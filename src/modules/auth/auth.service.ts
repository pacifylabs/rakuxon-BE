import { createHash, randomBytes, randomUUID } from 'node:crypto';

import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';

import { PasswordResetToken } from './entities/password-reset-token.entity';
import { SsoIdentity } from './entities/sso-identity.entity';
import { PasswordService } from './password.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { TokenService } from './token.service';
import { ENV } from '../../common/config/config.module';
import type { Env } from '../../common/config/env.schema';
import { NOTIFICATION_PORT } from '../../common/notifications/notification.port';
import type { NotificationPort } from '../../common/notifications/notification.port';
import { Role, TenantStatus, UserStatus } from '../../contract/enums';
import type { SsoProfile } from './sso/sso.port';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import type { AuthTokensDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
    @InjectRepository(PasswordResetToken)
    private readonly resetTokens: Repository<PasswordResetToken>,
    @InjectRepository(SsoIdentity) private readonly ssoIdentities: Repository<SsoIdentity>,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    @Inject(ENV) private readonly env: Env,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Creates an agency and its first administrator in one transaction — a
   * tenant with no way to sign in would be unusable, and a user with no tenant
   * would be unreachable.
   */
  async registerAgency(input: {
    agencyName: string;
    slug: string;
    email: string;
    fullName: string;
    password: string;
  }): Promise<AuthTokensDto> {
    const slug = input.slug.toLowerCase();

    if (await this.tenants.exist({ where: { slug } })) {
      throw new ConflictException('That subdomain is already taken.');
    }

    const passwordHash = await this.passwords.hash(input.password);

    const user = await this.dataSource.transaction(async (manager) => {
      const tenant = await manager.save(
        manager.create(Tenant, {
          name: input.agencyName,
          slug,
          /* Pending until vetted — see the admin vetting flow in stage 5. */
          status: TenantStatus.Pending,
        }),
      );

      return manager.save(
        manager.create(User, {
          tenantId: tenant.id,
          email: input.email,
          fullName: input.fullName,
          passwordHash,
          role: Role.AgencyAdmin,
          status: UserStatus.Active,
        }),
      );
    });

    return this.issueTokens(user);
  }

  async login(email: string, password: string): Promise<AuthTokensDto> {
    /* passwordHash is select:false, so ask for it explicitly. */
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();

    const valid = await this.passwords.verify(user?.passwordHash, password);

    /*
     * One message for "no such account" and "wrong password". Distinguishing
     * them tells an attacker which addresses are registered. The verify call
     * still runs for a missing user so the timing does not give it away either.
     */
    if (!user || !valid) {
      throw new UnauthorizedException('Those credentials are not valid.');
    }

    if (user.status !== UserStatus.Active) {
      throw new UnauthorizedException('This account is not active.');
    }

    return this.issueTokens(user);
  }

  /**
   * Rotates a refresh token.
   *
   * A token is single-use. Presenting one that has already been rotated means
   * either a replay or a stolen token being used alongside the real one, and
   * there is no way to tell which — so the whole family is revoked and both
   * parties have to sign in again. That is the intended, safe outcome.
   */
  async refresh(presentedToken: string): Promise<AuthTokensDto> {
    const tokenHash = this.tokens.hashRefreshToken(presentedToken);
    const stored = await this.refreshTokens.findOne({ where: { tokenHash } });

    if (!stored) {
      throw new UnauthorizedException('That refresh token is not valid.');
    }

    if (stored.revokedAt || stored.replacedByTokenId) {
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException(
        'That refresh token has already been used. All sessions have been ended.',
      );
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('That refresh token has expired.');
    }

    const user = await this.users.findOne({ where: { id: stored.userId } });
    if (!user || user.status !== UserStatus.Active) {
      throw new UnauthorizedException('This account is not active.');
    }

    return this.issueTokens(user, stored);
  }

  /** Ends the presented session. Unknown tokens succeed: logout is idempotent. */
  async logout(presentedToken: string): Promise<void> {
    await this.refreshTokens.update(
      { tokenHash: this.tokens.hashRefreshToken(presentedToken) },
      { revokedAt: new Date() },
    );
  }

  /* ---------------------------------------------------------- password reset */

  /**
   * Starts a reset.
   *
   * Returns nothing either way. Telling the caller whether the address exists
   * would turn this into an account-enumeration endpoint, which is the usual
   * reason reset flows leak.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.users.findOne({ where: { email } });
    if (!user || user.status !== UserStatus.Active) return;

    const token = randomBytes(32).toString('base64url');
    /* One hour: a reset link sits in an inbox, which is far more exposed than
       an app's memory. */
    const expiresAt = new Date(Date.now() + 3_600_000);

    await this.resetTokens.save(
      this.resetTokens.create({ userId: user.id, tokenHash: this.sha256(token), expiresAt }),
    );

    await this.notifications.sendPasswordReset({
      to: user.email,
      resetUrl: `${this.env.WEB_APP_URL}/reset-password/${token}`,
      expiresAt,
    });
  }

  /**
   * Completes a reset.
   *
   * Every existing session dies with the change. If the reset was triggered
   * because an account was compromised, leaving the attacker's refresh token
   * alive would defeat the whole exercise.
   */
  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    const grant = await this.resetTokens.findOne({ where: { tokenHash: this.sha256(token) } });

    const unusable = !grant || grant.consumedAt || grant.expiresAt.getTime() <= Date.now();
    if (unusable) {
      throw new UnauthorizedException('That reset link is not valid.');
    }

    const passwordHash = await this.passwords.hash(newPassword);

    await this.dataSource.transaction(async (manager) => {
      await manager.update(User, grant.userId, { passwordHash });
      await manager.update(PasswordResetToken, grant.id, { consumedAt: new Date() });
      await manager.update(
        RefreshToken,
        { userId: grant.userId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
    });
  }

  /* ------------------------------------------------------------------- SSO */

  /**
   * Signs in through an identity provider.
   *
   * An unverified address is refused: accepting one would let anyone who can
   * claim an address at a provider take over the matching platform account.
   * Where the address already belongs to a user, the provider identity is
   * linked rather than a second account created.
   */
  async signInWithSso(provider: string, profile: SsoProfile): Promise<AuthTokensDto> {
    if (!profile.emailVerified) {
      throw new UnauthorizedException(
        'That provider has not verified the email address on this account.',
      );
    }

    const existingIdentity = await this.ssoIdentities.findOne({
      where: { provider, providerAccountId: profile.providerAccountId },
    });

    if (existingIdentity) {
      const user = await this.users.findOne({ where: { id: existingIdentity.userId } });
      if (!user || user.status !== UserStatus.Active) {
        throw new UnauthorizedException('This account is not active.');
      }
      return this.issueTokens(user);
    }

    const user = await this.users.findOne({ where: { email: profile.email } });
    if (!user) {
      /* No self-service tenant creation through SSO: an agency is created
         deliberately, and a student arrives through an invitation link. */
      throw new UnauthorizedException('There is no account for that address yet.');
    }

    if (user.status !== UserStatus.Active) {
      throw new UnauthorizedException('This account is not active.');
    }

    await this.ssoIdentities.save(
      this.ssoIdentities.create({
        userId: user.id,
        provider,
        providerAccountId: profile.providerAccountId,
      }),
    );

    return this.issueTokens(user);
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private async revokeFamily(familyId: string): Promise<void> {
    /*
     * IsNull(), not undefined: TypeORM drops undefined criteria in some places
     * and compiles it to `revokedAt = NULL` in others, and `= NULL` matches no
     * row — which silently turned family revocation into a no-op.
     */
    await this.refreshTokens.update(
      { familyId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  private async issueTokens(user: User, rotating?: RefreshToken): Promise<AuthTokensDto> {
    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      tid: user.tenantId,
      role: user.role,
      email: user.email,
    });

    const minted = this.tokens.mintRefreshToken();
    const saved = await this.refreshTokens.save(
      this.refreshTokens.create({
        userId: user.id,
        tokenHash: minted.tokenHash,
        /* A rotation stays in its family; a fresh login starts a new one. */
        familyId: rotating?.familyId ?? randomUUID(),
        expiresAt: minted.expiresAt,
      }),
    );

    if (rotating) {
      await this.refreshTokens.update(rotating.id, {
        replacedByTokenId: saved.id,
        revokedAt: new Date(),
      });
    }

    return {
      accessToken,
      refreshToken: minted.token,
      expiresIn: this.tokens.accessTtlSeconds,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }
}
