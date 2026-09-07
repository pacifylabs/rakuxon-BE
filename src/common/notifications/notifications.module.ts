import { Global, Module } from '@nestjs/common';

import { LoggingNotificationAdapter } from './logging-notification.adapter';
import { NOTIFICATION_PORT } from './notification.port';

@Global()
@Module({
  providers: [{ provide: NOTIFICATION_PORT, useClass: LoggingNotificationAdapter }],
  exports: [NOTIFICATION_PORT],
})
export class NotificationsModule {}
