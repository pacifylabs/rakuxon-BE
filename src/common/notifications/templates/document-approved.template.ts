import type { DocumentApprovedMessage } from '../notification.port';
import { renderLayout } from './layout';
import type { EmailContent } from './layout';

export function documentApprovedEmail(message: DocumentApprovedMessage): EmailContent {
  const subject = 'One of your documents was approved';

  const { html, text } = renderLayout({
    preheader: `Your ${message.documentType} was reviewed and accepted.`,
    heading: 'A document was approved',
    paragraphs: [
      `Your ${message.documentType} was reviewed and accepted — nothing more to do for this one.`,
    ],
    cta: { label: 'View documents', url: message.reviewUrl },
  });

  return { subject, html, text };
}
