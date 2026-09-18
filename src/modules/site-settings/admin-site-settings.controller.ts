import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminSiteSettingsDto, UpdateSiteSettingsDto } from './dto/site-settings.dto';
import { SiteSettingsService } from './site-settings.service';
import { AdminJwtAuthGuard } from '../../common/auth/admin-jwt-auth.guard';
import { Public } from '../../common/auth/public.decorator';
import { PermissionGuard } from '../../common/rbac/permission.guard';
import { RequirePermission } from '../../common/rbac/require-permission.decorator';

/**
 * @Public() opts every route out of the global, users-table JwtAuthGuard;
 * AdminJwtAuthGuard + PermissionGuard do the real auth here — same shape as
 * AdminServicesController. No create/list/publish routes: this is a
 * singleton, always live, reusing the existing content.view/content.manage
 * pair.
 */
@ApiTags('admin-site-settings')
@Controller('admin/site-settings')
@Public()
@UseGuards(AdminJwtAuthGuard, PermissionGuard)
@ApiBearerAuth('admin-access-token')
export class AdminSiteSettingsController {
  constructor(private readonly siteSettings: SiteSettingsService) {}

  @Get()
  @RequirePermission('content.view')
  @ApiOperation({ summary: 'Get the site-wide settings' })
  @ApiOkResponse({ type: AdminSiteSettingsDto })
  get(): Promise<AdminSiteSettingsDto> {
    return this.siteSettings.getAdmin();
  }

  @Patch()
  @RequirePermission('content.manage')
  @ApiOperation({ summary: 'Update the site-wide settings' })
  @ApiOkResponse({ type: AdminSiteSettingsDto })
  update(@Body() dto: UpdateSiteSettingsDto): Promise<AdminSiteSettingsDto> {
    return this.siteSettings.update(dto);
  }
}
