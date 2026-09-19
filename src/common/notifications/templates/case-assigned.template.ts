import type { CaseAssignedMessage } from '../notification.port';
import { renderLayout } from './layout';
import type { EmailContent } from './layout';

export function caseAssignedEmail(message: CaseAssignedMessage): EmailContent {
  const subject = 'A case has been assigned to you';

  const { html, text } = renderLayout({
    preheader: `${message.studentName}'s application for ${message.courseName} needs your attention.`,
    heading: 'A case was assigned to you',
    paragraphs: [
      `${message.studentName}'s application for ${message.courseName} at ${message.institutionName} is now assigned to you.`,
    ],
    cta: { label: 'View application', url: message.reviewUrl },
  });

  return { subject, html, text };
}
