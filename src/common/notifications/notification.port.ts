import type { EmailContent } from './templates/layout';

/**
 * How the application reaches a person.
 *
 * An interface, not a mail client: docs/04-architecture.md keeps every vendor
 * behind a port, and the real email channel is stage 8 work. Until then the
 * development adapter logs, which keeps the reset flow testable end to end
 * without pretending mail is wired.
 */
export interface PasswordResetMessage {
  to: string;
  resetUrl: string;
  expiresAt: Date;
}

export interface EmailVerificationMessage {
  to: string;
  verifyUrl: string;
  expiresAt: Date;
}

export interface DocumentRejectedMessage {
  to: string;
  documentType: string;
  reason: string;
  reviewUrl: string;
}

export interface DocumentApprovedMessage {
  to: string;
  documentType: string;
  reviewUrl: string;
}

export interface ApplicationSubmittedMessage {
  to: string;
  courseName: string;
  institutionName: string;
  reviewUrl: string;
}

export interface CaseAssignedMessage {
  to: string;
  studentName: string;
  courseName: string;
  institutionName: string;
  reviewUrl: string;
}

export interface NewMessageMessage {
  to: string;
  fromName: string;
  preview: string;
  reviewUrl: string;
}

export interface NotificationPort {
  sendPasswordReset(message: PasswordResetMessage): Promise<void>;
  sendEmailVerification(message: EmailVerificationMessage): Promise<void>;
  sendDocumentRejected(message: DocumentRejectedMessage): Promise<void>;
  sendDocumentApproved(message: DocumentApprovedMessage): Promise<void>;
  sendApplicationSubmitted(message: ApplicationSubmittedMessage): Promise<void>;
  sendCaseAssigned(message: CaseAssignedMessage): Promise<void>;
  sendNewMessage(message: NewMessageMessage): Promise<void>;
}

export const NOTIFICATION_PORT = Symbol('NOTIFICATION_PORT');

export interface InAppContent {
  title: string;
  body: string;
}

/**
 * What `NotificationTemplatesService` looks like from the outside — the
 * adapters and the in-app call sites only need these two methods, not the
 * admin CRUD around them. Depending on this interface (rather than the
 * concrete class in `modules/notification-templates`) keeps `common/` from
 * reaching into `modules/`, and lets the adapters' unit tests hand in a
 * one-line fake instead of a real repository.
 */
export interface NotificationTemplateRenderer {
  renderEmail(
    key: string,
    context: Record<string, string>,
    fallback: () => EmailContent,
  ): Promise<EmailContent>;
  renderInApp(
    key: string,
    context: Record<string, string>,
    fallback: () => InAppContent,
  ): Promise<InAppContent>;
}
