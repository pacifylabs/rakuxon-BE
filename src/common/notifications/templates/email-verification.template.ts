import type { EmailVerificationMessage } from '../notification.port';
import { humanizeExpiry } from './expiry';
import { renderLayout } from './layout';
import type { EmailContent } from './layout';

export function emailVerificationEmail(message: EmailVerificationMessage): EmailContent {
  const subject = 'Confirm your email address';

  const { html, text } = renderLayout({
    preheader: 'Confirm this address to finish setting up your account.',
    heading: 'Confirm your email address',
    paragraphs: [
      'Thanks for creating a Rakuxon account. Confirm this email address to finish setting things up.',
    ],
    cta: { label: 'Confirm email', url: message.verifyUrl },
    footnote: `This link expires ${humanizeExpiry(message.expiresAt)}. If you didn't create a Rakuxon account, you can ignore this email.`,
  });

  return { subject, html, text };
}
