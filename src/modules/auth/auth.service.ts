import { createHash, randomBytes, randomUUID } from 'node:crypto';

import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';

import { EmailVerificationToken } from './entities/email-verification-token.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { SsoIdentity } from './entities/sso-identity.entity';
import type { AuthenticatedUser } from '../../common/auth/authenticated-request';
import { PasswordService } from './password.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { TokenService } from './token.service';
import { ENV } from '../../common/config/config.module';
import { appUrlForRole } from '../../common/config/env.schema';
import type { Env } from '../../common/config/env.schema';
import { NOTIFICATION_PORT } from '../../common/notifications/notification.port';
import type { NotificationPort } from '../../common/notifications/notification.port';
import { HOUSE_TENANT_ID } from '../../contract/constants';
import { Role, TenantStatus, UserStatus } from '../../contract/enums';
import type { SsoProfile } from './sso/sso.port';
import { Student } from '../students/entities/student.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import type { AuthTokensDto } from './dto/auth.dto';

/** Repositories bound to a transaction that has the identity context set. */
interface IdentityRepositories {
  users: Repository<User>;
  tenants: Repository<Tenant>;
  students: Repository<Student>;
  refreshTokens: Repository<RefreshToken>;
  resetTokens: Repository<PasswordResetToken>;
  verificationTokens: Repository<EmailVerificationToken>;
  ssoIdentities: Repository<SsoIdentity>;
  manager: EntityManager;
}

/**
 * Everything on the identity path.
 *
 * None of these operations can know a tenant in advance — establishing which
 * tenant someone belongs to is what they are for. So each one runs inside
 * `runInIdentityContext`, the single narrow exemption row-level security
 * grants, and every repository below comes from that transaction's manager.
 *
 * Repositories are taken from the transaction rather than injected, so every
 * query in a flow shares one connection and one transaction — sign-in, token
 * rotation and password reset each touch several tables and must not
 * half-apply.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
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
    firstName: string;
    lastName: string;
    password: string;
  }): Promise<AuthTokensDto> {
    const slug = input.slug.toLowerCase();

    /* Hashed before the transaction opens: argon2 is deliberately slow, and
       holding a pooled connection for the duration would starve the pool
       under load. */
    const passwordHash = await this.passwords.hash(input.password);

    const user = await this.inTransaction(async ({ tenants, users }) => {
      if (await tenants.exist({ where: { slug } })) {
        throw new ConflictException('That subdomain is already taken.');
      }

      const tenant = await tenants.save(
        tenants.create({
          name: input.agencyName,
          slug,
          /* Pending until vetted — see the admin vetting flow in stage 5. */
          status: TenantStatus.Pending,
        }),
      );

      return users.save(
        users.create({
          tenantId: tenant.id,
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          passwordHash,
          role: Role.AgencyAdmin,
          status: UserStatus.Active,
        }),
      );
    });

    await this.sendVerificationEmailBestEffort(user);

    return this.issueTokens(user);
  }

  /**
   * Creates a student's account: a `User(role: student)` plus its matching
   * `Student` profile row, in one transaction. The single path both
   * registration flows funnel into — direct signup passes the house tenant,
   * an onboarding-link redemption passes whatever tenant issued the link —
   * so "how a student account gets created" only exists in one place.
   */
  async createStudentAccount(input: {
    tenantId: string;
    email: string;
    firstName: string;
    lastName: string;
    password: string;
    sourceOnboardingLinkId?: string;
  }): Promise<AuthTokensDto> {
    const passwordHash = await this.passwords.hash(input.password);

    const user = await this.inTransaction(async ({ users, students }) => {
      if (await users.exist({ where: { tenantId: input.tenantId, email: input.email } })) {
        throw new ConflictException('That email is already registered.');
      }

      const saved = await users.save(
        users.create({
          tenantId: input.tenantId,
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          passwordHash,
          role: Role.Student,
          status: UserStatus.Active,
        }),
      );

      await students.save(
        students.create({
          tenantId: input.tenantId,
          userId: saved.id,
          sourceOnboardingLinkId: input.sourceOnboardingLinkId ?? null,
        }),
      );

      return saved;
    });

    await this.sendVerificationEmailBestEffort(user);

    return this.issueTokens(user);
  }

  /** A student signing up directly, with no agency — scoped to the house tenant. */
  async registerDirectStudent(input: {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
  }): Promise<AuthTokensDto> {
    return this.createStudentAccount({ tenantId: HOUSE_TENANT_ID, ...input });
  }

  async login(email: string, password: string): Promise<AuthTokensDto> {
    /* passwordHash is select:false, so ask for it explicitly. */
    const user = await this.inTransaction(({ users }) =>
      users
        .createQueryBuilder('user')
        .addSelect('user.passwordHash')
        .where('user.email = :email', { email })
        .getOne(),
    );

    /* Verified after the lookup transaction has closed, for the same reason
       the hash above is computed before one opens. */
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

    const stored = await this.inTransaction(({ refreshTokens }) =>
      refreshTokens.findOne({ where: { tokenHash } }),
    );

    if (!stored) {
      throw new UnauthorizedException('That refresh token is not valid.');
    }

    if (stored.revokedAt || stored.replacedByTokenId) {
      /*
       * Revoked in its own transaction, then thrown. Doing both inside one
       * would roll the revocation back on the way out — the replay would be
       * reported and the stolen family would stay alive.
       */
      await this.inTransaction((repos) => this.revokeFamily(repos, stored.familyId));

      throw new UnauthorizedException(
        'That refresh token has already been used. All sessions have been ended.',
      );
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('That refresh token has expired.');
    }

    const user = await this.inTransaction(({ users }) => users.findOne({ where: { id: stored.userId } }));

    if (!user || user.status !== UserStatus.Active) {
      throw new UnauthorizedException('This account is not active.');
    }

    return this.issueTokens(user, stored);
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

  /* ---------------------------------------------------------- password reset */

  /**
   * Starts a reset.
   *
   * Returns nothing either way. Telling the caller whether the address exists
   * would turn this into an account-enumeration endpoint, which is the usual
   * reason reset flows leak.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    /* One hour: a reset link sits in an inbox, which is far more exposed than
       an app's memory. */
    const expiresAt = new Date(Date.now() + 3_600_000);

    const user = await this.inTransaction(async ({ users, resetTokens }) => {
      const found = await users.findOne({ where: { email } });
      if (!found || found.status !== UserStatus.Active) return null;

      await resetTokens.save(
        resetTokens.create({ userId: found.id, tokenHash: this.sha256(token), expiresAt }),
      );

      return found;
    });

    if (!user) return;

    await this.notifications.sendPasswordReset({
      to: user.email,
      /* The surface this person actually signs in on — the marketing site
         has no reset screen. */
      resetUrl: `${appUrlForRole(this.env, user.role)}/reset-password/${token}`,
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
    const passwordHash = await this.passwords.hash(newPassword);

    await this.inTransaction(async ({ resetTokens, manager }) => {
      const grant = await resetTokens.findOne({ where: { tokenHash: this.sha256(token) } });

      const unusable = !grant || grant.consumedAt || grant.expiresAt.getTime() <= Date.now();
      if (unusable) {
        throw new UnauthorizedException('That reset link is not valid.');
      }

      await manager.update(User, grant.userId, { passwordHash });
      await manager.update(PasswordResetToken, grant.id, { consumedAt: new Date() });
      await manager.update(
        RefreshToken,
        { userId: grant.userId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
    });
  }

  /**
   * Issues a fresh verification link and emails it. Called right after
   * registration, and by the resend endpoint for whoever lost the first one.
   *
   * Best-effort: a notification failure here must not fail registration —
   * the account and its session are already real by the time this runs, so
   * the worst outcome of a broken mail transport is an unverified address,
   * not a lost account.
   */
  private async sendVerificationEmailBestEffort(user: User): Promise<void> {
    try {
      const token = randomBytes(32).toString('base64url');
      /* A day, not an hour like a password reset: verifying an address is
         not urgent the way recovering a compromised account is, and an
         applicant reasonably checks their inbox on their own schedule. */
      const expiresAt = new Date(Date.now() + 86_400_000);

      await this.inTransaction(({ verificationTokens }) =>
        verificationTokens.save(
          verificationTokens.create({ userId: user.id, tokenHash: this.sha256(token), expiresAt }),
        ),
      );

      await this.notifications.sendEmailVerification({
        to: user.email,
        verifyUrl: `${appUrlForRole(this.env, user.role)}/verify-email/${token}`,
        expiresAt,
      });
    } catch (error) {
      this.logger.warn(`Could not send verification email to ${user.email}: ${String(error)}`);
    }
  }

  /** Re-sends a verification link to the signed-in user. A no-op if already verified. */
  async resendEmailVerification(user: AuthenticatedUser): Promise<void> {
    const found = await this.inTransaction(({ users }) => users.findOne({ where: { id: user.id } }));
    if (!found || found.emailVerifiedAt) return;

    await this.sendVerificationEmailBestEffort(found);
  }

  /**
   * Completes verification.
   *
   * Unlike a password reset, this does not revoke sessions — confirming an
   * address is not a credential change, so there is nothing here for an
   * existing session to have been compromised by.
   */
  async confirmEmailVerification(token: string): Promise<void> {
    await this.inTransaction(async ({ verificationTokens, manager }) => {
      const grant = await verificationTokens.findOne({ where: { tokenHash: this.sha256(token) } });

      const unusable = !grant || grant.consumedAt || grant.expiresAt.getTime() <= Date.now();
      if (unusable) {
        throw new UnauthorizedException('That verification link is not valid.');
      }

      await manager.update(User, grant.userId, { emailVerifiedAt: new Date() });
      await manager.update(EmailVerificationToken, grant.id, { consumedAt: new Date() });
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

    const user = await this.inTransaction(async ({ users, ssoIdentities }) => {
      const existingIdentity = await ssoIdentities.findOne({
        where: { provider, providerAccountId: profile.providerAccountId },
      });

      if (existingIdentity) {
        const linked = await users.findOne({ where: { id: existingIdentity.userId } });
        if (!linked || linked.status !== UserStatus.Active) {
          throw new UnauthorizedException('This account is not active.');
        }
        return linked;
      }

      const found = await users.findOne({ where: { email: profile.email } });
      if (!found) {
        /* No self-service tenant creation through SSO: an agency is created
           deliberately, and a student arrives through an invitation link. */
        throw new UnauthorizedException('There is no account for that address yet.');
      }

      if (found.status !== UserStatus.Active) {
        throw new UnauthorizedException('This account is not active.');
      }

      await ssoIdentities.save(
        ssoIdentities.create({
          userId: found.id,
          provider,
          providerAccountId: profile.providerAccountId,
        }),
      );

      return found;
    });

    return this.issueTokens(user);
  }

  /**
   * Runs the work in one transaction, with the auth repositories bound to it.
   *
   * This was an "identity context" — a session variable that told row-level
   * security to let sign-in read across tenants, since a person logging in has
   * no tenant yet. The policies are gone, so it is now an ordinary
   * transaction: sign-in, token rotation and password reset each touch several
   * tables and must not half-apply.
   */
  private async inTransaction<T>(work: (repos: IdentityRepositories) => Promise<T>): Promise<T> {
    return this.dataSource.transaction((manager: EntityManager) =>
      work({
        users: manager.getRepository(User),
        tenants: manager.getRepository(Tenant),
        students: manager.getRepository(Student),
        refreshTokens: manager.getRepository(RefreshToken),
        resetTokens: manager.getRepository(PasswordResetToken),
        verificationTokens: manager.getRepository(EmailVerificationToken),
        ssoIdentities: manager.getRepository(SsoIdentity),
        manager,
      }),
    );
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private async revokeFamily(repos: IdentityRepositories, familyId: string): Promise<void> {
    /*
     * IsNull(), not undefined: TypeORM drops undefined criteria in some places
     * and compiles it to `revokedAt = NULL` in others, and `= NULL` matches no
     * row — which silently turned family revocation into a no-op.
     */
    await repos.refreshTokens.update({ familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  private async issueTokens(user: User, rotating?: RefreshToken): Promise<AuthTokensDto> {
    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      tid: user.tenantId,
      role: user.role,
      email: user.email,
    });

    const minted = this.tokens.mintRefreshToken();

    await this.inTransaction(async ({ refreshTokens }) => {
      const saved = await refreshTokens.save(
        refreshTokens.create({
          userId: user.id,
          tokenHash: minted.tokenHash,
          /* A rotation stays in its family; a fresh login starts a new one. */
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
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId,
        emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      },
    };
  }
}
