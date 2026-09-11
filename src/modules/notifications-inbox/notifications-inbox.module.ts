import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Notification } from './entities/notification.entity';
import { NotificationsInboxController } from './notifications-inbox.controller';
import { NotificationsInboxService } from './notifications-inbox.service';

@Module({
  imports: [TypeOrmModule.forFeature([Notification])],
  controllers: [NotificationsInboxController],
  providers: [NotificationsInboxService],
  exports: [NotificationsInboxService],
})
export class NotificationsInboxModule {}
