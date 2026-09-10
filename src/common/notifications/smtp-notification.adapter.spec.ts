import type { Env } from '../config/env.schema';
import type { MailMessage, MailTransport } from './mail-transport';
import { SmtpNotificationAdapter } from './smtp-notification.adapter';

describe('SmtpNotificationAdapter', () => {
  function build() {
    const sent: MailMessage[] = [];
    const transport: MailTransport = {
      sendMail: async (message) => {
        sent.push(message);
      },
    };
    const env = { SMTP_FROM: 'Rakuxon <no-reply@rakuxon.com>' } as Env;
    return { adapter: new SmtpNotificationAdapter(env, transport), sent };
  }

  it('sends a password reset email from the configured address, carrying the reset link', async () => {
    const { adapter, sent } = build();
    const expiresAt = new Date(Date.now() + 3_600_000);

    await adapter.sendPasswordReset({
      to: 'ada@example.com',
      resetUrl: 'https://app.rakuxon.com/reset-password/secret-token',
      expiresAt,
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      from: 'Rakuxon <no-reply@rakuxon.com>',
      to: 'ada@example.com',
      subject: expect.stringMatching(/password/i),
    });
    expect(sent[0]?.html).toContain('https://app.rakuxon.com/reset-password/secret-token');
    expect(sent[0]?.text).toContain('https://app.rakuxon.com/reset-password/secret-token');
  });

  it('sends a verification email from the configured address, carrying the verify link', async () => {
    const { adapter, sent } = build();
    const expiresAt = new Date(Date.now() + 86_400_000);

    await adapter.sendEmailVerification({
      to: 'ada@example.com',
      verifyUrl: 'https://app.rakuxon.com/verify-email/secret-token',
      expiresAt,
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      from: 'Rakuxon <no-reply@rakuxon.com>',
      to: 'ada@example.com',
      subject: expect.stringMatching(/confirm|verif/i),
    });
    expect(sent[0]?.html).toContain('https://app.rakuxon.com/verify-email/secret-token');
    expect(sent[0]?.text).toContain('https://app.rakuxon.com/verify-email/secret-token');
  });

  it('never puts the recipient address in the subject', async () => {
    const { adapter, sent } = build();
    await adapter.sendPasswordReset({
      to: 'ada@example.com',
      resetUrl: 'https://app.rakuxon.com/reset-password/secret-token',
      expiresAt: new Date(),
    });

    expect(sent[0]?.subject).not.toContain('ada@example.com');
  });
});
