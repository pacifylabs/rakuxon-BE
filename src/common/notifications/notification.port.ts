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

export interface NotificationPort {
  sendPasswordReset(message: PasswordResetMessage): Promise<void>;
  sendEmailVerification(message: EmailVerificationMessage): Promise<void>;
}

export const NOTIFICATION_PORT = Symbol('NOTIFICATION_PORT');
