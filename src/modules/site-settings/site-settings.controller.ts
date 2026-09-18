import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { SiteSettingsDto } from './dto/site-settings.dto';
import { SiteSettingsService } from './site-settings.service';
import { Public } from '../../common/auth/public.decorator';

/** Public: contact details, socials and footer copy for the marketing site's shell. */
@ApiTags('site-settings')
@Controller('site-settings')
export class SiteSettingsController {
  constructor(private readonly siteSettings: SiteSettingsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get the site-wide contact/social/footer settings' })
  @ApiOkResponse({ type: SiteSettingsDto })
  get(): Promise<SiteSettingsDto> {
    return this.siteSettings.getPublic();
  }
}
