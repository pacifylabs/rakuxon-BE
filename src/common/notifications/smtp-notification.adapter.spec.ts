import type { Env } from '../config/env.schema';
import type { MailMessage, MailTransport } from './mail-transport';
import type { NotificationTemplateRenderer } from './notification.port';
import { SmtpNotificationAdapter } from './smtp-notification.adapter';

/** No template rows in these tests — every send falls through to the hardcoded `*.template.ts` copy, same as before this renderer existed. */
const fallbackOnlyTemplates: NotificationTemplateRenderer = {
  renderEmail: (_key, _context, fallback) => Promise.resolve(fallback()),
  renderInApp: (_key, _context, fallback) => Promise.resolve(fallback()),
};

describe('SmtpNotificationAdapter', () => {
  function build() {
    const sent: MailMessage[] = [];
    const transport: MailTransport = {
      sendMail: async (message) => {
        sent.push(message);
      },
    };
    const env = { SMTP_FROM: 'Rakuxon <no-reply@rakuxon.com>' } as Env;
    return { adapter: new SmtpNotificationAdapter(env, transport, fallbackOnlyTemplates), sent };
  }

  it('sends a password reset email from the configured address, carrying the reset link', async () => {
    const { adapter, sent } = build();
    const expiresAt = new Date(Date.now() + 3_600_000);

    await adapter.sendPasswordReset({
      to: 'ada@example.com',
      resetUrl: 'https://app.rakuxon.com/auth/reset-password/secret-token',
      expiresAt,
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      from: 'Rakuxon <no-reply@rakuxon.com>',
      to: 'ada@example.com',
      subject: expect.stringMatching(/password/i),
    });
    expect(sent[0]?.html).toContain('https://app.rakuxon.com/auth/reset-password/secret-token');
    expect(sent[0]?.text).toContain('https://app.rakuxon.com/auth/reset-password/secret-token');
  });

  it('sends a verification email from the configured address, carrying the verify link', async () => {
    const { adapter, sent } = build();
    const expiresAt = new Date(Date.now() + 86_400_000);

    await adapter.sendEmailVerification({
      to: 'ada@example.com',
      verifyUrl: 'https://app.rakuxon.com/auth/verify-email/secret-token',
      expiresAt,
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      from: 'Rakuxon <no-reply@rakuxon.com>',
      to: 'ada@example.com',
      subject: expect.stringMatching(/confirm|verif/i),
    });
    expect(sent[0]?.html).toContain('https://app.rakuxon.com/auth/verify-email/secret-token');
    expect(sent[0]?.text).toContain('https://app.rakuxon.com/auth/verify-email/secret-token');
  });

  it('sends a document-rejected email carrying the reason and the review link', async () => {
    const { adapter, sent } = build();

    await adapter.sendDocumentRejected({
      to: 'ada@example.com',
      documentType: 'identity',
      reason: 'The scan is illegible',
      reviewUrl: 'https://app.rakuxon.com/dashboard/documents',
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ from: 'Rakuxon <no-reply@rakuxon.com>', to: 'ada@example.com' });
    expect(sent[0]?.html).toContain('The scan is illegible');
    expect(sent[0]?.html).toContain('https://app.rakuxon.com/dashboard/documents');
    expect(sent[0]?.text).toContain('The scan is illegible');
  });

  it('sends a document-approved email carrying the document type and the review link', async () => {
    const { adapter, sent } = build();

    await adapter.sendDocumentApproved({
      to: 'ada@example.com',
      documentType: 'identity',
      reviewUrl: 'https://app.rakuxon.com/dashboard/documents',
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ from: 'Rakuxon <no-reply@rakuxon.com>', to: 'ada@example.com' });
    expect(sent[0]?.html).toContain('identity');
    expect(sent[0]?.html).toContain('https://app.rakuxon.com/dashboard/documents');
  });

  it('sends an admin-edited template instead of the hardcoded copy, when one is enabled', async () => {
    const sent: MailMessage[] = [];
    const transport: MailTransport = {
      sendMail: async (message) => {
        sent.push(message);
      },
    };
    const env = { SMTP_FROM: 'Rakuxon <no-reply@rakuxon.com>' } as Env;
    const templates: NotificationTemplateRenderer = {
      renderEmail: (key) =>
        Promise.resolve(
          key === 'document_approved'
            ? { subject: 'Custom subject', html: '<p>Custom html</p>', text: 'Custom text' }
            : Promise.reject(new Error(`unexpected key ${key}`)),
        ),
      renderInApp: (_key, _context, fallback) => Promise.resolve(fallback()),
    };
    const adapter = new SmtpNotificationAdapter(env, transport, templates);

    await adapter.sendDocumentApproved({
      to: 'ada@example.com',
      documentType: 'identity',
      reviewUrl: 'https://app.rakuxon.com/dashboard/documents',
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ subject: 'Custom subject', html: '<p>Custom html</p>', text: 'Custom text' });
  });

  it('never puts the recipient address in the subject', async () => {
    const { adapter, sent } = build();
    await adapter.sendPasswordReset({
      to: 'ada@example.com',
      resetUrl: 'https://app.rakuxon.com/auth/reset-password/secret-token',
      expiresAt: new Date(),
    });

    expect(sent[0]?.subject).not.toContain('ada@example.com');
  });
});
