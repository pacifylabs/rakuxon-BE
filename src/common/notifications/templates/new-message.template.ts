import type { NewMessageMessage } from '../notification.port';
import { renderLayout } from './layout';
import type { EmailContent } from './layout';

export function newMessageEmail(message: NewMessageMessage): EmailContent {
  const subject = `New message from ${message.fromName}`;

  const { html, text } = renderLayout({
    preheader: message.preview,
    heading: 'You have a new message',
    paragraphs: [`${message.fromName} sent you a message: "${message.preview}"`],
    cta: { label: 'Read and reply', url: message.reviewUrl },
  });

  return { subject, html, text };
}
