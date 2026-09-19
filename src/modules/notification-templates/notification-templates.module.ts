import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminNotificationTemplatesController } from './admin-notification-templates.controller';
import { NotificationTemplate } from './entities/notification-template.entity';
import { NotificationTemplatesService } from './notification-templates.service';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';

/**
 * Exports `NotificationTemplatesService` — `common/notifications/notifications.module.ts`
 * imports this module so its adapter factory can inject it, which is why this
 * module (unlike most feature modules) needs an explicit `exports`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([NotificationTemplate]), AdminAuthModule],
  controllers: [AdminNotificationTemplatesController],
  providers: [NotificationTemplatesService],
  exports: [NotificationTemplatesService],
})
export class NotificationTemplatesModule {}
