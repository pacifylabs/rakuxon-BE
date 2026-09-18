import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AdminSiteSettingsDto, SiteSettingsDto, UpdateSiteSettingsDto } from './dto/site-settings.dto';
import { SiteSettings } from './entities/site-settings.entity';
import { definedEntries } from '../../common/utils/defined-entries';

/**
 * Today's real values — used only if the seed migration's single row is
 * somehow missing, so the site never renders with no contact details at all.
 */
const DEFAULTS: Omit<SiteSettings, 'id' | 'createdAt' | 'updatedAt'> = {
  contactEmail: 'enquiries@rakuxon.com',
  contactPhones: ['+234 816 717 8847', '+44 776 094 4935'],
  contactAddresses: [
    { label: 'UK office', lines: ['Flat 15, St. Matthews House', 'Phelp Street, London SE17 2PJ'] },
    { label: 'Nigeria office', lines: ['11 Akinsemoyin Street', 'Surulere, Lagos'] },
  ],
  socials: [
    { label: 'WhatsApp', href: 'https://wa.me/2348167178847' },
    { label: 'Instagram', href: 'https://www.instagram.com/rakuxon' },
    { label: 'TikTok', href: 'https://www.tiktok.com/@rakuxonltd' },
    { label: 'X', href: 'https://x.com/rakuxon' },
    { label: 'Facebook', href: 'https://www.facebook.com/rakuxon' },
    { label: 'YouTube', href: 'https://youtube.com/@rakuxon' },
  ],
  footerTagline: 'Where Minds Meet Maps.',
  footerBlurb:
    'Transforming dreams into global education and travel opportunities. Your trusted partner for studying abroad and exploring the world.',
  logoUrl: '/logo-light.png',
  logoDarkUrl: '/logo-dark.png',
};

@Injectable()
export class SiteSettingsService {
  constructor(
    @InjectRepository(SiteSettings) private readonly settings: Repository<SiteSettings>,
  ) {}

  async getPublic(): Promise<SiteSettingsDto> {
    return this.toDto(await this.getOrCreateDefault());
  }

  async getAdmin(): Promise<AdminSiteSettingsDto> {
    return this.toDto(await this.getOrCreateDefault());
  }

  async update(dto: UpdateSiteSettingsDto): Promise<AdminSiteSettingsDto> {
    const row = await this.getOrCreateDefault();
    const patch = definedEntries(dto);
    const saved = await this.settings.save({ ...row, ...patch });
    return this.toDto(saved);
  }

  /** There is always exactly one row — no id in the URL, so nothing to 404 on. */
  private async getOrCreateDefault(): Promise<SiteSettings> {
    const existing = await this.settings.find({ take: 1 });
    if (existing[0]) return existing[0];
    return this.settings.save(this.settings.create(DEFAULTS));
  }

  private toDto(row: SiteSettings): SiteSettingsDto {
    return {
      contactEmail: row.contactEmail,
      contactPhones: row.contactPhones,
      contactAddresses: row.contactAddresses,
      socials: row.socials,
      footerTagline: row.footerTagline,
      footerBlurb: row.footerBlurb,
      logoUrl: row.logoUrl,
      logoDarkUrl: row.logoDarkUrl,
    };
  }
}
