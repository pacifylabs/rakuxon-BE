import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminNotificationsController } from './admin-notifications.controller';
import { Notification } from './entities/notification.entity';
import { NotificationsInboxController } from './notifications-inbox.controller';
import { NotificationsInboxService } from './notifications-inbox.service';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Notification]), AdminAuthModule],
  controllers: [NotificationsInboxController, AdminNotificationsController],
  providers: [NotificationsInboxService],
  exports: [NotificationsInboxService],
})
export class NotificationsInboxModule {}
