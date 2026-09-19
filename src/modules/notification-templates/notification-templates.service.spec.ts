import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { NotificationTemplate } from './entities/notification-template.entity';
import { NotificationTemplatesService } from './notification-templates.service';

describe('NotificationTemplatesService', () => {
  const repo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
  };

  let service: NotificationTemplatesService;

  const row: NotificationTemplate = {
    id: 't-1',
    key: 'document_approved',
    channel: 'both',
    subject: 'Approved: {{documentType}}',
    heading: 'A document was approved',
    body: ['Your {{documentType}} was reviewed and accepted.', 'Nothing more to do.'],
    ctaLabel: 'View documents',
    ctaUrl: '{{reviewUrl}}',
    footnote: null,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationTemplatesService,
        { provide: getRepositoryToken(NotificationTemplate), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(NotificationTemplatesService);
  });

  describe('renderEmail', () => {
    it('interpolates the row and never calls the fallback, when an enabled row exists', async () => {
      repo.findOne.mockResolvedValue(row);
      const fallback = jest.fn();

      const result = await service.renderEmail(
        'document_approved',
        { documentType: 'passport', reviewUrl: 'https://app.example.com/documents' },
        fallback,
      );

      expect(fallback).not.toHaveBeenCalled();
      expect(result.subject).toBe('Approved: passport');
      expect(result.html).toContain('Your passport was reviewed and accepted.');
      expect(result.html).toContain('href="https://app.example.com/documents"');
      expect(result.text).toContain('View documents: https://app.example.com/documents');
    });

    it('calls the fallback when no row exists for that key', async () => {
      repo.findOne.mockResolvedValue(null);
      const fallback = jest.fn(() => ({ subject: 'S', html: '<p>H</p>', text: 'T' }));

      const result = await service.renderEmail('document_approved', {}, fallback);

      expect(fallback).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ subject: 'S', html: '<p>H</p>', text: 'T' });
    });

    it('calls the fallback when the row is scoped to in_app only', async () => {
      repo.findOne.mockResolvedValue({ ...row, channel: 'in_app' });
      const fallback = jest.fn(() => ({ subject: 'S', html: '<p>H</p>', text: 'T' }));

      await service.renderEmail('document_approved', {}, fallback);

      expect(fallback).toHaveBeenCalledTimes(1);
    });

    it('does not fetch a disabled row — the repository query already filters on enabled: true', async () => {
      repo.findOne.mockResolvedValue(null);
      const fallback = jest.fn(() => ({ subject: 'S', html: '<p>H</p>', text: 'T' }));

      await service.renderEmail('document_approved', {}, fallback);

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { key: 'document_approved', enabled: true },
      });
      expect(fallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('renderInApp', () => {
    it('uses the heading and only the first paragraph, interpolated', async () => {
      repo.findOne.mockResolvedValue(row);
      const fallback = jest.fn();

      const result = await service.renderInApp('document_approved', { documentType: 'passport' }, fallback);

      expect(fallback).not.toHaveBeenCalled();
      expect(result).toEqual({
        title: 'A document was approved',
        body: 'Your passport was reviewed and accepted.',
      });
    });

    it('calls the fallback when the row is scoped to email only', async () => {
      repo.findOne.mockResolvedValue({ ...row, channel: 'email' });
      const fallback = jest.fn(() => ({ title: 'T', body: 'B' }));

      await service.renderInApp('document_approved', {}, fallback);

      expect(fallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('update', () => {
    it('throws NotFoundException for an unknown id', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.update('missing', { heading: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('only changes the fields the caller actually set', async () => {
      repo.findOne.mockResolvedValue(row);
      repo.save.mockImplementation(async (value: unknown) => value);

      const result = await service.update('t-1', { heading: 'New heading' });

      expect(result.heading).toBe('New heading');
      expect(result.body).toEqual(row.body);
      expect(result.subject).toBe(row.subject);
    });
  });

  describe('getDetail', () => {
    it("includes the key's fixed set of tokens", async () => {
      repo.findOne.mockResolvedValue(row);
      const result = await service.getDetail('t-1');
      expect(result.availableTokens.sort()).toEqual(['documentType', 'reviewUrl'].sort());
    });
  });

  describe('preview', () => {
    it('renders draft fields against sample data without touching the repository beyond the lookup', async () => {
      repo.findOne.mockResolvedValue(row);

      const result = await service.preview('t-1', {
        heading: 'Draft: {{documentType}}',
        body: ['Draft body for {{documentType}}.'],
      });

      expect(result.inAppTitle).toBe('Draft: passport');
      expect(result.inAppBody).toBe('Draft body for passport.');
      expect(repo.save).not.toHaveBeenCalled();
    });
  });
});
