import { Inject, Injectable } from '@nestjs/common';

import { ENV } from '../config/config.module';
import type { Env } from '../config/env.schema';
import { humanizeExpiry } from './templates/expiry';
import { applicationSubmittedEmail } from './templates/application-submitted.template';
import { caseAssignedEmail } from './templates/case-assigned.template';
import { documentApprovedEmail } from './templates/document-approved.template';
import { documentRejectedEmail } from './templates/document-rejected.template';
import { emailVerificationEmail } from './templates/email-verification.template';
import { passwordResetEmail } from './templates/password-reset.template';
import { MAIL_TRANSPORT } from './mail-transport';
import type { MailTransport } from './mail-transport';
import type {
  ApplicationSubmittedMessage,
  CaseAssignedMessage,
  DocumentApprovedMessage,
  DocumentRejectedMessage,
  EmailVerificationMessage,
  NotificationPort,
  NotificationTemplateRenderer,
  PasswordResetMessage,
} from './notification.port';

/**
 * Sends real mail over SMTP.
 *
 * The transporter is injected rather than built here, so a test can hand this
 * a fake with a `sendMail` spy instead of opening a real socket — see
 * docs/03-tdd-guide.md's "mock the email transport" rule.
 *
 * Every message first asks `templates` for an admin-edited version of its
 * copy; `templates` falls back to the hardcoded `*.template.ts` function
 * below when no enabled row exists for that key, so this adapter's own
 * behaviour is unchanged until someone actually edits a template.
 */
@Injectable()
export class SmtpNotificationAdapter implements NotificationPort {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
    private readonly templates: NotificationTemplateRenderer,
  ) {}

  async sendPasswordReset(message: PasswordResetMessage): Promise<void> {
    const { subject, html, text } = await this.templates.renderEmail(
      'password_reset',
      { resetUrl: message.resetUrl, expiresIn: humanizeExpiry(message.expiresAt) },
      () => passwordResetEmail(message),
    );
    await this.send(message.to, subject, html, text);
  }

  async sendEmailVerification(message: EmailVerificationMessage): Promise<void> {
    const { subject, html, text } = await this.templates.renderEmail(
      'email_verification',
      { verifyUrl: message.verifyUrl, expiresIn: humanizeExpiry(message.expiresAt) },
      () => emailVerificationEmail(message),
    );
    await this.send(message.to, subject, html, text);
  }

  async sendDocumentRejected(message: DocumentRejectedMessage): Promise<void> {
    const { subject, html, text } = await this.templates.renderEmail(
      'document_rejected',
      { documentType: message.documentType, reason: message.reason, reviewUrl: message.reviewUrl },
      () => documentRejectedEmail(message),
    );
    await this.send(message.to, subject, html, text);
  }

  async sendDocumentApproved(message: DocumentApprovedMessage): Promise<void> {
    const { subject, html, text } = await this.templates.renderEmail(
      'document_approved',
      { documentType: message.documentType, reviewUrl: message.reviewUrl },
      () => documentApprovedEmail(message),
    );
    await this.send(message.to, subject, html, text);
  }

  async sendApplicationSubmitted(message: ApplicationSubmittedMessage): Promise<void> {
    const { subject, html, text } = await this.templates.renderEmail(
      'application_submitted',
      { courseName: message.courseName, institutionName: message.institutionName, reviewUrl: message.reviewUrl },
      () => applicationSubmittedEmail(message),
    );
    await this.send(message.to, subject, html, text);
  }

  async sendCaseAssigned(message: CaseAssignedMessage): Promise<void> {
    const { subject, html, text } = await this.templates.renderEmail(
      'case_assigned',
      {
        studentName: message.studentName,
        courseName: message.courseName,
        institutionName: message.institutionName,
        reviewUrl: message.reviewUrl,
      },
      () => caseAssignedEmail(message),
    );
    await this.send(message.to, subject, html, text);
  }

  private async send(to: string, subject: string, html: string, text: string): Promise<void> {
    /* SMTP_FROM is guaranteed by smtpConfigured(), which gates whether this
       adapter is ever selected — see notifications.module.ts. */
    await this.transport.sendMail({ from: this.env.SMTP_FROM as string, to, subject, html, text });
  }
}
