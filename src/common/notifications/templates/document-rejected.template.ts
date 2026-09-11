import type { DocumentRejectedMessage } from '../notification.port';
import { renderLayout } from './layout';
import type { EmailContent } from './layout';

export function documentRejectedEmail(message: DocumentRejectedMessage): EmailContent {
  const subject = 'One of your documents needs another look';

  const { html, text } = renderLayout({
    preheader: `Your ${message.documentType} was not accepted — here's why.`,
    heading: 'A document needs another look',
    paragraphs: [
      `Your ${message.documentType} was reviewed and could not be accepted: ${message.reason}`,
      'Upload a replacement when you have one ready.',
    ],
    cta: { label: 'Review documents', url: message.reviewUrl },
  });

  return { subject, html, text };
}
