import type { ApplicationSubmittedMessage } from '../notification.port';
import { renderLayout } from './layout';
import type { EmailContent } from './layout';

export function applicationSubmittedEmail(message: ApplicationSubmittedMessage): EmailContent {
  const subject = 'Your application has been submitted';

  const { html, text } = renderLayout({
    preheader: `Your application to ${message.institutionName} is in.`,
    heading: 'Application submitted',
    paragraphs: [
      `Your application for ${message.courseName} at ${message.institutionName} has been submitted. An admissions team member will review it and reach out with next steps.`,
    ],
    cta: { label: 'View application', url: message.reviewUrl },
  });

  return { subject, html, text };
}
