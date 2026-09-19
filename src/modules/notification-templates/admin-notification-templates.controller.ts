import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  NotificationTemplateDetailDto,
  NotificationTemplatePreviewDto,
  NotificationTemplateSummaryDto,
  PreviewNotificationTemplateDto,
  UpdateNotificationTemplateDto,
} from './dto/notification-template.dto';
import { NotificationTemplatesService } from './notification-templates.service';
import { AdminJwtAuthGuard } from '../../common/auth/admin-jwt-auth.guard';
import { Public } from '../../common/auth/public.decorator';
import { PermissionGuard } from '../../common/rbac/permission.guard';
import { RequirePermission } from '../../common/rbac/require-permission.decorator';

/**
 * One row per system message, editable copy only — `key` and `channel` are
 * fixed by the call site that sends them and are not exposed for editing.
 * @Public() opts every route out of the global, users-table JwtAuthGuard;
 * AdminJwtAuthGuard + PermissionGuard do the real auth, same shape as
 * AdminTestimonialsController.
 */
@ApiTags('admin-notification-templates')
@Controller('admin/notification-templates')
@Public()
@UseGuards(AdminJwtAuthGuard, PermissionGuard)
@ApiBearerAuth('admin-access-token')
export class AdminNotificationTemplatesController {
  constructor(private readonly templates: NotificationTemplatesService) {}

  @Get()
  @RequirePermission('notifications.view')
  @ApiOperation({ summary: 'List every configurable notification template' })
  @ApiOkResponse({ type: [NotificationTemplateSummaryDto] })
  list(): Promise<NotificationTemplateSummaryDto[]> {
    return this.templates.listAdmin();
  }

  @Get(':id')
  @RequirePermission('notifications.view')
  @ApiOkResponse({ type: NotificationTemplateDetailDto })
  getDetail(@Param('id') id: string): Promise<NotificationTemplateDetailDto> {
    return this.templates.getDetail(id);
  }

  @Patch(':id')
  @RequirePermission('notifications.manage')
  @ApiOkResponse({ type: NotificationTemplateDetailDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateNotificationTemplateDto,
  ): Promise<NotificationTemplateDetailDto> {
    return this.templates.update(id, dto);
  }

  @Post(':id/preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('notifications.manage')
  @ApiOperation({ summary: "Render the editor's in-progress fields against sample data, without saving" })
  @ApiOkResponse({ type: NotificationTemplatePreviewDto })
  preview(
    @Param('id') id: string,
    @Body() dto: PreviewNotificationTemplateDto,
  ): Promise<NotificationTemplatePreviewDto> {
    return this.templates.preview(id, dto);
  }
}
