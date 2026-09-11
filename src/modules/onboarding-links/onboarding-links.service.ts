import { createHash, randomBytes } from 'node:crypto';

import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { OnboardingLink } from './entities/onboarding-link.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { ENV } from '../../common/config/config.module';
import type { Env } from '../../common/config/env.schema';
import { TenantStatus } from '../../contract/enums';
import type {
  ConsumedLinkDto,
  OnboardingLinkDto,
  PeekedLinkDto,
} from './dto/onboarding-link.dto';

const DEFAULT_EXPIRY_DAYS = 14;

/**
 * Invitations.
 *
 * Tenant scoping is this service's own responsibility now: every query that
 * touches a specific agency's links carries an explicit `tenantId`. Row-level
 * security used to be the backstop; it was removed, so the `where` clauses
 * below are the whole guarantee and are covered by tests rather than trusted.
 */
@Injectable()
export class OnboardingLinksService {
  constructor(
    @InjectRepository(OnboardingLink) private readonly links: Repository<OnboardingLink>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Issues an invitation.
   *
   * The token is returned exactly once. Only its hash is stored, so a database
   * leak does not yield working invitations and the counselor cannot look the
   * link up again later — they reissue instead, which is also the auditable
   * behaviour.
   */
  async issue(input: {
    tenantId: string;
    issuedByUserId: string;
    inviteeEmail: string;
    expiresInDays?: number;
  }): Promise<OnboardingLinkDto> {
    /*
     * The one capability a pending (unvetted) agency has today that pulls
     * real student data into the system before an admin has looked at it —
     * see the admin tenant-vetting flow. Every other agency action doesn't
     * exist yet as a capability, so this is the single narrow gate.
     */
    const tenant = await this.tenants.findOne({ where: { id: input.tenantId } });
    if (tenant?.status !== TenantStatus.Active) {
      throw new ForbiddenException('Your agency is pending approval before you can invite students.');
    }

    const token = randomBytes(32).toString('base64url');
    const days = input.expiresInDays ?? DEFAULT_EXPIRY_DAYS;

    const saved = await this.links.save(
      this.links.create({
        tenantId: input.tenantId,
        issuedByUserId: input.issuedByUserId,
        inviteeEmail: input.inviteeEmail,
        tokenHash: this.hash(token),
        expiresAt: new Date(Date.now() + days * 86_400_000),
      }),
    );

    return {
      id: saved.id,
      url: `${this.env.WEB_APP_URL}/invite/${token}`,
      inviteeEmail: saved.inviteeEmail,
      expiresAt: saved.expiresAt.toISOString(),
    };
  }

  /**
   * Looks up an invitation without spending it, so the sign-up form can show
   * who it's from and prefill the invitee's email before a password exists.
   *
   * Same validity checks and the same generic rejection message as `consume`
   * — a peek is just a consume that doesn't mark the token used.
   */
  async peek(token: string): Promise<PeekedLinkDto> {
    const link = await this.findValid(token);
    const tenant = await this.tenants.findOne({ where: { id: link.tenantId } });

    return { tenantName: tenant?.name ?? 'your agency', inviteeEmail: link.inviteeEmail };
  }

  /**
   * Redeems an invitation, marking it used.
   *
   * Deliberately not tenant-scoped: the student has no account and no
   * subdomain yet, so the token is the only thing identifying the agency and
   * reading it is how the tenant gets discovered. The token is 32 random bytes
   * and only its hash is stored, which is what makes that safe.
   *
   * Every rejection returns the same message. Distinguishing "expired" from
   * "already used" from "never existed" tells someone holding a guessed token
   * which guesses were close.
   */
  async consume(token: string): Promise<ConsumedLinkDto> {
    const link = await this.findValid(token);

    await this.links.update(link.id, { consumedAt: new Date() });

    return { id: link.id, tenantId: link.tenantId, inviteeEmail: link.inviteeEmail };
  }

  /**
   * Revokes an invitation.
   *
   * `tenantId` is in the where clause, not checked afterwards: a counselor
   * must not be able to revoke another agency's link by guessing an id, and an
   * UPDATE that matches nothing is the correct outcome rather than an error
   * that confirms the id exists.
   *
   * IsNull(), not undefined — TypeORM compiles `undefined` to `revokedAt =
   * NULL`, which matches nothing and silently turns this into a no-op.
   */
  async revoke(id: string, tenantId: string): Promise<void> {
    await this.links.update({ id, tenantId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  private async findValid(token: string): Promise<OnboardingLink> {
    const link = await this.links.findOne({ where: { tokenHash: this.hash(token) } });

    const unusable =
      !link || link.revokedAt || link.consumedAt || link.expiresAt.getTime() <= Date.now();

    if (unusable) {
      throw new UnauthorizedException('That invitation link is not valid.');
    }

    return link;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
