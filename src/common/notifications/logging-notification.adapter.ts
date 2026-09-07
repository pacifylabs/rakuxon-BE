import { Injectable, Logger } from '@nestjs/common';

import type { NotificationPort, PasswordResetMessage } from './notification.port';

/**
 * Development adapter.
 *
 * Logs the reset link so the flow can be walked locally. It deliberately does
 * not pretend to send mail — swapping in a real transport is a stage 8 change
 * that touches this file only.
 */
@Injectable()
export class LoggingNotificationAdapter implements NotificationPort {
  private readonly logger = new Logger('Notifications');

  async sendPasswordReset(message: PasswordResetMessage): Promise<void> {
    this.logger.log(
      `Password reset for ${message.to} — ${message.resetUrl} (expires ${message.expiresAt.toISOString()})`,
    );
  }
}
