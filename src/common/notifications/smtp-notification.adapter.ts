import { Inject, Injectable } from '@nestjs/common';

import { ENV } from '../config/config.module';
import type { Env } from '../config/env.schema';
import { emailVerificationEmail } from './templates/email-verification.template';
import { passwordResetEmail } from './templates/password-reset.template';
import { MAIL_TRANSPORT } from './mail-transport';
import type { MailTransport } from './mail-transport';
import type {
  EmailVerificationMessage,
  NotificationPort,
  PasswordResetMessage,
} from './notification.port';

/**
 * Sends real mail over SMTP.
 *
 * The transporter is injected rather than built here, so a test can hand this
 * a fake with a `sendMail` spy instead of opening a real socket — see
 * docs/03-tdd-guide.md's "mock the email transport" rule.
 */
@Injectable()
export class SmtpNotificationAdapter implements NotificationPort {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
  ) {}

  async sendPasswordReset(message: PasswordResetMessage): Promise<void> {
    const { subject, html, text } = passwordResetEmail(message);
    await this.send(message.to, subject, html, text);
  }

  async sendEmailVerification(message: EmailVerificationMessage): Promise<void> {
    const { subject, html, text } = emailVerificationEmail(message);
    await this.send(message.to, subject, html, text);
  }

  private async send(to: string, subject: string, html: string, text: string): Promise<void> {
    /* SMTP_FROM is guaranteed by smtpConfigured(), which gates whether this
       adapter is ever selected — see notifications.module.ts. */
    await this.transport.sendMail({ from: this.env.SMTP_FROM as string, to, subject, html, text });
  }
}
