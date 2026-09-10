/**
 * The one thing `SmtpNotificationAdapter` needs from nodemailer.
 *
 * Reduced to a single method so a test can substitute a spy without a real
 * `Transporter` — the same "interface, not a vendor" shape as every other
 * port in this codebase.
 */
export interface MailMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface MailTransport {
  sendMail(message: MailMessage): Promise<unknown>;
}

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');
