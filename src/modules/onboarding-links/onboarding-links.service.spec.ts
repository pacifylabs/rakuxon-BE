import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { IsNull } from 'typeorm';

import { ENV } from '../../common/config/config.module';
import { OnboardingLink } from './entities/onboarding-link.entity';
import { OnboardingLinksService } from './onboarding-links.service';

/**
 * Tenant scoping used to be enforced by a row-level security policy. It was
 * removed, so these `where` clauses are now the entire guarantee — which makes
 * them worth asserting rather than reading.
 */
describe('OnboardingLinksService', () => {
  const repo = {
    save: jest.fn(),
    create: jest.fn((entity: unknown) => entity),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  let service: OnboardingLinksService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        OnboardingLinksService,
        { provide: getRepositoryToken(OnboardingLink), useValue: repo },
        { provide: ENV, useValue: { WEB_APP_URL: 'https://rakuxon.test' } },
      ],
    }).compile();

    service = moduleRef.get(OnboardingLinksService);
  });

  describe('revoke', () => {
    it('scopes the update by tenant, not just by id', async () => {
      // Without this clause a counselor could revoke another agency's
      // invitation by guessing an id. Nothing else stops them now.
      await service.revoke('link-1', 'tenant-a');

      expect(repo.update).toHaveBeenCalledWith(
        { id: 'link-1', tenantId: 'tenant-a', revokedAt: IsNull() },
        { revokedAt: expect.any(Date) },
      );
    });

    it('matches only links that are still live', async () => {
      // IsNull(), never undefined: TypeORM compiles undefined to `= NULL`,
      // which matches nothing and turns revocation into a silent no-op.
      await service.revoke('link-1', 'tenant-a');

      const [criteria] = repo.update.mock.calls[0] as [Record<string, unknown>];
      expect(criteria.revokedAt).toEqual(IsNull());
      expect(criteria.revokedAt).not.toBeUndefined();
    });
  });

  describe('issue', () => {
    it('stamps the issuing tenant onto the link', async () => {
      repo.save.mockResolvedValue({
        id: 'link-1',
        inviteeEmail: 'a@b.test',
        expiresAt: new Date('2026-10-01'),
      });

      await service.issue({
        tenantId: 'tenant-a',
        issuedByUserId: 'user-1',
        inviteeEmail: 'a@b.test',
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-a' }),
      );
    });

    it('stores only a hash, so a database leak yields no working invitations', async () => {
      repo.save.mockResolvedValue({
        id: 'link-1',
        inviteeEmail: 'a@b.test',
        expiresAt: new Date('2026-10-01'),
      });

      const { url } = await service.issue({
        tenantId: 'tenant-a',
        issuedByUserId: 'user-1',
        inviteeEmail: 'a@b.test',
      });

      const token = url.split('/invite/')[1] as string;
      const [stored] = repo.create.mock.calls[0] as [{ tokenHash: string }];

      expect(stored.tokenHash).not.toBe(token);
      expect(stored.tokenHash).toHaveLength(64);
    });
  });

  describe('consume', () => {
    it('is deliberately not tenant-scoped, because the token discovers the tenant', async () => {
      repo.findOne.mockResolvedValue({
        id: 'link-1',
        tenantId: 'tenant-a',
        inviteeEmail: 'a@b.test',
        expiresAt: new Date(Date.now() + 86_400_000),
      });

      const result = await service.consume('a-token');

      const [query] = repo.findOne.mock.calls[0] as [{ where: Record<string, unknown> }];
      expect(Object.keys(query.where)).toEqual(['tokenHash']);
      expect(result.tenantId).toBe('tenant-a');
    });

    it('gives one message for expired, used and unknown alike', async () => {
      const cases = [
        null,
        { expiresAt: new Date(Date.now() - 1), tenantId: 't' },
        { expiresAt: new Date(Date.now() + 1000), consumedAt: new Date(), tenantId: 't' },
        { expiresAt: new Date(Date.now() + 1000), revokedAt: new Date(), tenantId: 't' },
      ];

      for (const link of cases) {
        repo.findOne.mockResolvedValue(link);
        // Distinguishing them tells someone holding a guessed token which
        // guesses were close.
        await expect(service.consume('t')).rejects.toThrow(UnauthorizedException);
      }
    });
  });
});
