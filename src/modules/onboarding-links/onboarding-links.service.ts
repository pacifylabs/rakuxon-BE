import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { OnboardingLink } from './entities/onboarding-link.entity';
import { ENV } from '../../common/config/config.module';
import type { Env } from '../../common/config/env.schema';
import type { ConsumedLinkDto, OnboardingLinkDto } from './dto/onboarding-link.dto';

const DEFAULT_EXPIRY_DAYS = 14;

@Injectable()
export class OnboardingLinksService {
  constructor(
    @InjectRepository(OnboardingLink) private readonly links: Repository<OnboardingLink>,
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
   * Redeems an invitation, marking it used.
   *
   * Every rejection returns the same message. Distinguishing "expired" from
   * "already used" from "never existed" tells someone holding a guessed token
   * which guesses were close.
   */
  async consume(token: string): Promise<ConsumedLinkDto> {
    const link = await this.links.findOne({ where: { tokenHash: this.hash(token) } });

    const unusable =
      !link || link.revokedAt || link.consumedAt || link.expiresAt.getTime() <= Date.now();

    if (unusable) {
      throw new UnauthorizedException('That invitation link is not valid.');
    }

    await this.links.update(link.id, { consumedAt: new Date() });

    return { tenantId: link.tenantId, inviteeEmail: link.inviteeEmail };
  }

  async revoke(id: string, tenantId: string): Promise<void> {
    /* IsNull(), not undefined — see the note in auth.service.ts. */
    await this.links.update({ id, tenantId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
