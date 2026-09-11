import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';

import { AdminCatalogueService } from './admin-catalogue.service';
import { Article } from './entities/article.entity';
import { Country } from './entities/country.entity';
import { Course } from './entities/course.entity';
import { Institution } from './entities/institution.entity';

describe('AdminCatalogueService: countries', () => {
  const countries = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn((entity: unknown) => entity),
  };

  let service: AdminCatalogueService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminCatalogueService,
        { provide: getRepositoryToken(Institution), useValue: {} },
        { provide: getRepositoryToken(Course), useValue: {} },
        { provide: getRepositoryToken(Article), useValue: {} },
        { provide: getRepositoryToken(Country), useValue: countries },
      ],
    }).compile();

    service = moduleRef.get(AdminCatalogueService);
  });

  it('lists every country, ordered by name', async () => {
    countries.find.mockResolvedValue([
      { code: 'GB', name: 'United Kingdom', isDestination: true, flagEmoji: '🇬🇧' },
    ]);

    const result = await service.listCountries();

    expect(countries.find).toHaveBeenCalledWith({ order: { name: 'ASC' } });
    expect(result).toEqual([
      { code: 'GB', name: 'United Kingdom', isDestination: true, flagEmoji: '🇬🇧' },
    ]);
  });

  it('activates a country not currently a destination', async () => {
    countries.findOne.mockResolvedValue({
      code: 'NG',
      name: 'Nigeria',
      isDestination: false,
      flagEmoji: '🇳🇬',
    });

    const result = await service.setCountryDestination('NG', true);

    expect(result.isDestination).toBe(true);
    expect(countries.save).toHaveBeenCalledWith(expect.objectContaining({ isDestination: true }));
  });

  it('deactivates a country currently serving', async () => {
    countries.findOne.mockResolvedValue({
      code: 'GB',
      name: 'United Kingdom',
      isDestination: true,
      flagEmoji: '🇬🇧',
    });

    const result = await service.setCountryDestination('GB', false);

    expect(result.isDestination).toBe(false);
  });

  it('throws NotFoundException for an unknown code', async () => {
    countries.findOne.mockResolvedValue(null);

    await expect(service.setCountryDestination('ZZ', true)).rejects.toThrow(NotFoundException);
  });
});
