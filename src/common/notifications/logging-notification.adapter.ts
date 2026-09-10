import { Inject, Injectable, Logger } from '@nestjs/common';

import { ENV } from '../config/config.module';
import type { Env } from '../config/env.schema';

import type {
  EmailVerificationMessage,
  NotificationPort,
  PasswordResetMessage,
} from './notification.port';

/**
 * Development adapter.
 *
 * Logs the reset link so the flow can be walked locally. It deliberately does
 * not pretend to send mail — swapping in a real transport is a stage 8 change
 * that touches this file only.
 */
@Injectable()
export class LoggingNotificationAdapter implements NotificationPort {
  constructor(@Inject(ENV) private readonly env: Env) {}

  private readonly logger = new Logger('Notifications');

  async sendPasswordReset(message: PasswordResetMessage): Promise<void> {
    if (this.env.NODE_ENV === 'production') {
      this.logger.warn(
        'Password reset email was not sent: production email transport is not configured.',
      );
      return;
    }
    this.logger.log(
      `Password reset for ${message.to} — ${message.resetUrl} (expires ${message.expiresAt.toISOString()})`,
    );
  }

  async sendEmailVerification(message: EmailVerificationMessage): Promise<void> {
    if (this.env.NODE_ENV === 'production') {
      this.logger.warn(
        'Email verification was not sent: production email transport is not configured.',
      );
      return;
    }
    this.logger.log(
      `Email verification for ${message.to} — ${message.verifyUrl} (expires ${message.expiresAt.toISOString()})`,
    );
  }
}
