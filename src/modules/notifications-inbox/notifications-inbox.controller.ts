import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { NotificationDto, UnreadCountDto } from './dto/notification.dto';
import type { Notification } from './entities/notification.entity';
import { NotificationsInboxService } from './notifications-inbox.service';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../contract/enums';
import type { AuthenticatedUser } from '../../common/auth/authenticated-request';

/** Only students receive a notification today — see the entity's own doc comment on why this could widen later. */
@ApiTags('notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
@Roles(Role.Student)
export class NotificationsInboxController {
  constructor(private readonly notifications: NotificationsInboxService) {}

  @Get()
  @ApiOperation({ summary: "The caller's own notifications, newest first" })
  @ApiOkResponse({ type: [NotificationDto] })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<NotificationDto[]> {
    return (await this.notifications.listOwn(user)).map((notification) => this.toDto(notification));
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'How many of the caller\'s notifications are unread' })
  @ApiOkResponse({ type: UnreadCountDto })
  async unreadCount(@CurrentUser() user: AuthenticatedUser): Promise<UnreadCountDto> {
    return { count: await this.notifications.unreadCount(user) };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark one notification read' })
  @ApiOkResponse({ type: NotificationDto })
  async markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<NotificationDto> {
    return this.toDto(await this.notifications.markRead(user, id));
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
