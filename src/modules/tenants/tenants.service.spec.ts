import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';

import { Tenant } from './entities/tenant.entity';
import { TenantsService } from './tenants.service';
import { TenantStatus } from '../../contract/enums';

/**
 * Covers the status state machine directly — `list()`'s query-builder
 * plumbing is exercised by the e2e suite instead, where a real database makes
 * it worth more than mocking every chained call here.
 */
describe('TenantsService', () => {
  const repo = {
    findOne: jest.fn(),
    save: jest.fn((entity: unknown) => entity),
  };

  let service: TenantsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [TenantsService, { provide: getRepositoryToken(Tenant), useValue: repo }],
    }).compile();

    service = moduleRef.get(TenantsService);
  });

  const tenant = (status: TenantStatus) => ({
    id: 't-1',
    name: 'Northwind',
    slug: 'northwind',
    status,
    createdAt: new Date('2026-01-01'),
  });

  describe('approve', () => {
    it('moves a pending tenant to active', async () => {
      repo.findOne.mockResolvedValue(tenant(TenantStatus.Pending));

      const result = await service.approve('t-1');

      expect(result.status).toBe(TenantStatus.Active);
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ status: TenantStatus.Active }));
    });

    it('refuses to approve a tenant that is already active', async () => {
      repo.findOne.mockResolvedValue(tenant(TenantStatus.Active));

      await expect(service.approve('t-1')).rejects.toThrow(ConflictException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('refuses to approve a suspended tenant — suspension is lifted by reactivate, not approve', async () => {
      repo.findOne.mockResolvedValue(tenant(TenantStatus.Suspended));

      await expect(service.approve('t-1')).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException for an unknown id', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.approve('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('suspend', () => {
    it('moves an active tenant to suspended', async () => {
      repo.findOne.mockResolvedValue(tenant(TenantStatus.Active));

      const result = await service.suspend('t-1');

      expect(result.status).toBe(TenantStatus.Suspended);
    });

    it('refuses to suspend a tenant that is still pending', async () => {
      repo.findOne.mockResolvedValue(tenant(TenantStatus.Pending));

      await expect(service.suspend('t-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('reactivate', () => {
    it('moves a suspended tenant back to active', async () => {
      repo.findOne.mockResolvedValue(tenant(TenantStatus.Suspended));

      const result = await service.reactivate('t-1');

      expect(result.status).toBe(TenantStatus.Active);
    });

    it('refuses to reactivate a tenant that was never suspended', async () => {
      repo.findOne.mockResolvedValue(tenant(TenantStatus.Pending));

      await expect(service.reactivate('t-1')).rejects.toThrow(ConflictException);
    });
  });
});
