import { Inject, Injectable, Logger } from '@nestjs/common';

import { ENV } from '../config/config.module';
import type { Env } from '../config/env.schema';
import { humanizeExpiry } from './templates/expiry';
import { applicationSubmittedEmail } from './templates/application-submitted.template';
import { caseAssignedEmail } from './templates/case-assigned.template';
import { documentApprovedEmail } from './templates/document-approved.template';
import { documentRejectedEmail } from './templates/document-rejected.template';
import { emailVerificationEmail } from './templates/email-verification.template';
import { passwordResetEmail } from './templates/password-reset.template';

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
 * Development adapter.
 *
 * Logs the rendered subject and body — including any link a CTA carries —
 * so the flow can be walked locally, and so an admin-edited template is
 * visible without SMTP being configured. It deliberately does not pretend to
 * send mail — swapping in a real transport is a stage 8 change that touches
 * this file only.
 */
@Injectable()
export class LoggingNotificationAdapter implements NotificationPort {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly templates: NotificationTemplateRenderer,
  ) {}

  private readonly logger = new Logger('Notifications');

  async sendPasswordReset(message: PasswordResetMessage): Promise<void> {
    if (this.unavailableInProduction('Password reset')) return;
    const { subject, text } = await this.templates.renderEmail(
      'password_reset',
      { resetUrl: message.resetUrl, expiresIn: humanizeExpiry(message.expiresAt) },
      () => passwordResetEmail(message),
    );
    this.log(message.to, subject, text);
  }

  async sendEmailVerification(message: EmailVerificationMessage): Promise<void> {
    if (this.unavailableInProduction('Email verification')) return;
    const { subject, text } = await this.templates.renderEmail(
      'email_verification',
      { verifyUrl: message.verifyUrl, expiresIn: humanizeExpiry(message.expiresAt) },
      () => emailVerificationEmail(message),
    );
    this.log(message.to, subject, text);
  }

  async sendDocumentRejected(message: DocumentRejectedMessage): Promise<void> {
    if (this.unavailableInProduction('Document-rejected email')) return;
    const { subject, text } = await this.templates.renderEmail(
      'document_rejected',
      { documentType: message.documentType, reason: message.reason, reviewUrl: message.reviewUrl },
      () => documentRejectedEmail(message),
    );
    this.log(message.to, subject, text);
  }

  async sendDocumentApproved(message: DocumentApprovedMessage): Promise<void> {
    if (this.unavailableInProduction('Document-approved email')) return;
    const { subject, text } = await this.templates.renderEmail(
      'document_approved',
      { documentType: message.documentType, reviewUrl: message.reviewUrl },
      () => documentApprovedEmail(message),
    );
    this.log(message.to, subject, text);
  }

  async sendApplicationSubmitted(message: ApplicationSubmittedMessage): Promise<void> {
    if (this.unavailableInProduction('Application-submitted email')) return;
    const { subject, text } = await this.templates.renderEmail(
      'application_submitted',
      { courseName: message.courseName, institutionName: message.institutionName, reviewUrl: message.reviewUrl },
      () => applicationSubmittedEmail(message),
    );
    this.log(message.to, subject, text);
  }

  async sendCaseAssigned(message: CaseAssignedMessage): Promise<void> {
    if (this.unavailableInProduction('Case-assigned email')) return;
    const { subject, text } = await this.templates.renderEmail(
      'case_assigned',
      {
        studentName: message.studentName,
        courseName: message.courseName,
        institutionName: message.institutionName,
        reviewUrl: message.reviewUrl,
      },
      () => caseAssignedEmail(message),
    );
    this.log(message.to, subject, text);
  }

  /** True (after warning) when this call site must stop — a real deployment with no SMTP transport should never silently no-op. */
  private unavailableInProduction(label: string): boolean {
    if (this.env.NODE_ENV !== 'production') return false;
    this.logger.warn(`${label} was not sent: production email transport is not configured.`);
    return true;
  }

  private log(to: string, subject: string, text: string): void {
    this.logger.log(`${subject} — sent to ${to}\n${text}`);
  }
}
