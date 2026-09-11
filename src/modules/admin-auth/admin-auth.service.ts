import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';

import { AdminAuthTokensDto } from './dto/admin-auth.dto';
import { AdminPasswordResetToken } from './entities/admin-password-reset-token.entity';
import { AdminRefreshToken } from './entities/admin-refresh-token.entity';
import { AdminTokenService } from './admin-token.service';
import { ENV } from '../../common/config/config.module';
import type { Env } from '../../common/config/env.schema';
import { NOTIFICATION_PORT } from '../../common/notifications/notification.port';
import type { NotificationPort } from '../../common/notifications/notification.port';
import { UserStatus } from '../../contract/enums';
import { Admin } from '../admins/entities/admin.entity';
import { AdminPermission } from '../admins/entities/admin-permission.entity';
import { Permission } from '../admins/entities/permission.entity';
import { PasswordService } from '../auth/password.service';

interface AdminIdentityRepositories {
  admins: Repository<Admin>;
  refreshTokens: Repository<AdminRefreshToken>;
  resetTokens: Repository<AdminPasswordResetToken>;
  adminPermissions: Repository<AdminPermission>;
  permissions: Repository<Permission>;
  manager: EntityManager;
}

/**
 * Everything on the admin identity path — login, refresh, logout, password
 * reset. Deliberately a separate class from `AuthService`, not a shared
 * generalisation of it: admin sessions are a fully isolated identity system
 * (own table, own tokens, own secret pair), and the two paths should be able
 * to change independently without one accidentally affecting the other.
 *
 * No register, no SSO, no email verification — admins are provisioned by
 * another admin (`AdminsService.create`) or the bootstrap script
 * (`scripts/seed-platform-admin.ts`), never self-registered.
 */
@Injectable()
export class AdminAuthService {
  constructor(
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    @Inject(ENV) private readonly env: Env,
    private readonly passwords: PasswordService,
    private readonly tokens: AdminTokenService,
    private readonly dataSource: DataSource,
  ) {}

  async login(email: string, password: string): Promise<AdminAuthTokensDto> {
    /* passwordHash is select:false, so ask for it explicitly. */
    const admin = await this.inTransaction(({ admins }) =>
      admins
        .createQueryBuilder('admin')
        .addSelect('admin.passwordHash')
        .where('admin.email = :email', { email })
        .getOne(),
    );

    /* One message for "no such account" and "wrong password", same reason as
       the users-side login: distinguishing them is an account-enumeration
       leak. The verify call still runs for a missing admin so the timing
       does not give it away either. */
    const valid = await this.passwords.verify(admin?.passwordHash, password);
    if (!admin || !valid) {
      throw new UnauthorizedException('Those credentials are not valid.');
    }

    if (admin.status !== UserStatus.Active) {
      throw new UnauthorizedException('This account is not active.');
    }

    return this.issueTokens(admin);
  }

  /** Rotates a refresh token. Same replay defence as AuthService.refresh. */
  async refresh(presentedToken: string): Promise<AdminAuthTokensDto> {
    const tokenHash = this.tokens.hashRefreshToken(presentedToken);

    const stored = await this.inTransaction(({ refreshTokens }) =>
      refreshTokens.findOne({ where: { tokenHash } }),
    );

    if (!stored) {
      throw new UnauthorizedException('That refresh token is not valid.');
    }

    if (stored.revokedAt || stored.replacedByTokenId) {
      await this.inTransaction((repos) => this.revokeFamily(repos, stored.familyId));
      throw new UnauthorizedException(
        'That refresh token has already been used. All sessions have been ended.',
      );
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('That refresh token has expired.');
    }

    const admin = await this.inTransaction(({ admins }) =>
      admins.findOne({ where: { id: stored.adminId } }),
    );

    if (!admin || admin.status !== UserStatus.Active) {
      throw new UnauthorizedException('This account is not active.');
    }

    /* Permission keys are reloaded here, not carried over from the token
       being rotated — a permission change made through AdminsService takes
       effect the next time the affected admin refreshes, at the latest. */
    return this.issueTokens(admin, stored);
  }

  /** Ends the presented session. Unknown tokens succeed: logout is idempotent. */
  async logout(presentedToken: string): Promise<void> {
    await this.inTransaction(({ refreshTokens }) =>
      refreshTokens.update(
        { tokenHash: this.tokens.hashRefreshToken(presentedToken) },
        { revokedAt: new Date() },
      ),
    );
  }

  async requestPasswordReset(email: string): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 3_600_000);

    const admin = await this.inTransaction(async ({ admins, resetTokens }) => {
      const found = await admins.findOne({ where: { email } });
      if (!found || found.status !== UserStatus.Active) return null;

      await resetTokens.save(
        resetTokens.create({ adminId: found.id, tokenHash: this.sha256(token), expiresAt }),
      );

      return found;
    });

    if (!admin) return;

    await this.notifications.sendPasswordReset({
      to: admin.email,
      resetUrl: `${this.env.ADMIN_APP_URL ?? this.env.WEB_APP_URL}/reset-password/${token}`,
      expiresAt,
    });
  }

  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    const passwordHash = await this.passwords.hash(newPassword);

    await this.inTransaction(async ({ resetTokens, manager }) => {
      const grant = await resetTokens.findOne({ where: { tokenHash: this.sha256(token) } });

      const unusable = !grant || grant.consumedAt || grant.expiresAt.getTime() <= Date.now();
      if (unusable) {
        throw new UnauthorizedException('That reset link is not valid.');
      }

      await manager.update(Admin, grant.adminId, { passwordHash });
      await manager.update(AdminPasswordResetToken, grant.id, { consumedAt: new Date() });
      await manager.update(
        AdminRefreshToken,
        { adminId: grant.adminId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
    });
  }

  private async loadPermissionKeys(adminId: string, repos: AdminIdentityRepositories): Promise<string[]> {
    const rows = await repos.permissions
      .createQueryBuilder('permission')
      .innerJoin('admin_permissions', 'ap', 'ap."permissionId" = permission.id')
      .where('ap."adminId" = :adminId', { adminId })
      .select('permission.key', 'key')
      .getRawMany<{ key: string }>();

    return rows.map((row) => row.key);
  }

  private async inTransaction<T>(work: (repos: AdminIdentityRepositories) => Promise<T>): Promise<T> {
    return this.dataSource.transaction((manager: EntityManager) =>
      work({
        admins: manager.getRepository(Admin),
        refreshTokens: manager.getRepository(AdminRefreshToken),
        resetTokens: manager.getRepository(AdminPasswordResetToken),
        adminPermissions: manager.getRepository(AdminPermission),
        permissions: manager.getRepository(Permission),
        manager,
      }),
    );
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private async revokeFamily(repos: AdminIdentityRepositories, familyId: string): Promise<void> {
    await repos.refreshTokens.update({ familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  private async issueTokens(admin: Admin, rotating?: AdminRefreshToken): Promise<AdminAuthTokensDto> {
    const permissions = await this.inTransaction((repos) => this.loadPermissionKeys(admin.id, repos));

    const accessToken = await this.tokens.signAccessToken({
      sub: admin.id,
      email: admin.email,
      permissions,
    });

    const minted = this.tokens.mintRefreshToken();

    await this.inTransaction(async ({ refreshTokens }) => {
      const saved = await refreshTokens.save(
        refreshTokens.create({
          adminId: admin.id,
          tokenHash: minted.tokenHash,
          familyId: rotating?.familyId ?? randomUUID(),
          expiresAt: minted.expiresAt,
        }),
      );

      if (rotating) {
        await refreshTokens.update(rotating.id, {
          replacedByTokenId: saved.id,
          revokedAt: new Date(),
        });
      }
    });

    return {
      accessToken,
      refreshToken: minted.token,
      expiresIn: this.tokens.accessTtlSeconds,
      admin: {
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        permissions,
      },
    };
  }
}
