import { Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { NotificationDto, UnreadCountDto } from './dto/notification.dto';
import type { Notification } from './entities/notification.entity';
import { NotificationsInboxService } from './notifications-inbox.service';
import { AdminJwtAuthGuard } from '../../common/auth/admin-jwt-auth.guard';
import { CurrentAdmin } from '../../common/auth/current-admin.decorator';
import { Public } from '../../common/auth/public.decorator';
import type { AuthenticatedAdmin } from '../../common/auth/authenticated-admin-request';

/**
 * An admin's own notifications — the same inbox students read from
 * (`NotificationsInboxController`), scoped to `adminId` instead of `userId`.
 * No `PermissionGuard`: every route acts on the caller's own inbox, so being
 * a signed-in admin at all is the only gate that makes sense.
 */
@ApiTags('admin-notifications')
@Controller('admin/notifications')
@Public()
@UseGuards(AdminJwtAuthGuard)
@ApiBearerAuth('admin-access-token')
export class AdminNotificationsController {
  constructor(private readonly notifications: NotificationsInboxService) {}

  @Get()
  @ApiOperation({ summary: "The caller's own notifications, newest first" })
  @ApiOkResponse({ type: [NotificationDto] })
  async list(@CurrentAdmin() admin: AuthenticatedAdmin): Promise<NotificationDto[]> {
    return (await this.notifications.listOwnAdmin(admin)).map((notification) => this.toDto(notification));
  }

  @Get('unread-count')
  @ApiOperation({ summary: "How many of the caller's notifications are unread" })
  @ApiOkResponse({ type: UnreadCountDto })
  async unreadCount(@CurrentAdmin() admin: AuthenticatedAdmin): Promise<UnreadCountDto> {
    return { count: await this.notifications.unreadCountAdmin(admin) };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark one notification read' })
  @ApiOkResponse({ type: NotificationDto })
  async markRead(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id') id: string,
  ): Promise<NotificationDto> {
    return this.toDto(await this.notifications.markReadAdmin(admin, id));
  }

  private toDto(notification: Notification): NotificationDto {
    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      link: notification.link,
      readAt: notification.readAt ? notification.readAt.toISOString() : null,
      createdAt: notification.createdAt.toISOString(),
    };
  }
}
