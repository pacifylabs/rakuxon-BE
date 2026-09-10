import type { PasswordResetMessage } from '../notification.port';
import { humanizeExpiry } from './expiry';
import { renderLayout } from './layout';
import type { EmailContent } from './layout';

export function passwordResetEmail(message: PasswordResetMessage): EmailContent {
  const subject = 'Reset your Rakuxon password';

  const { html, text } = renderLayout({
    preheader: 'Use this link to set a new password.',
    heading: 'Reset your password',
    paragraphs: [
      'We received a request to reset the password on your Rakuxon account.',
      'Click the button below to choose a new one.',
    ],
    cta: { label: 'Reset password', url: message.resetUrl },
    footnote: `This link expires ${humanizeExpiry(message.expiresAt)}. If you didn't request a password reset, you can safely ignore this email — your password hasn't changed.`,
  });

  return { subject, html, text };
}
