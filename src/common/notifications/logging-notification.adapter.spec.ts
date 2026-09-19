import { Logger } from '@nestjs/common';
import type { Env } from '../config/env.schema';
import { LoggingNotificationAdapter } from './logging-notification.adapter';
import type { NotificationTemplateRenderer } from './notification.port';

/** No template rows in these tests — every send falls through to the hardcoded `*.template.ts` copy, same as before this renderer existed. */
const fallbackOnlyTemplates: NotificationTemplateRenderer = {
  renderEmail: (_key, _context, fallback) => Promise.resolve(fallback()),
  renderInApp: (_key, _context, fallback) => Promise.resolve(fallback()),
};

describe('LoggingNotificationAdapter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('never writes reset tokens or recipient addresses to production logs', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const adapter = new LoggingNotificationAdapter({ NODE_ENV: 'production' } as Env, fallbackOnlyTemplates);
    await adapter.sendPasswordReset({
      to: 'person@example.com',
      resetUrl: 'https://app.rakuxon.com/auth/reset-password/secret-token',
      expiresAt: new Date(),
    });
    expect(log).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/secret-token|person@example.com/);
  });

  it('never writes verification tokens or recipient addresses to production logs', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const adapter = new LoggingNotificationAdapter({ NODE_ENV: 'production' } as Env, fallbackOnlyTemplates);
    await adapter.sendEmailVerification({
      to: 'person@example.com',
      verifyUrl: 'https://app.rakuxon.com/auth/verify-email/secret-token',
      expiresAt: new Date(),
    });
    expect(log).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/secret-token|person@example.com/);
  });

  it('never writes a rejection reason or recipient address to production logs', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const adapter = new LoggingNotificationAdapter({ NODE_ENV: 'production' } as Env, fallbackOnlyTemplates);
    await adapter.sendDocumentRejected({
      to: 'person@example.com',
      documentType: 'identity',
      reason: 'The scan is illegible',
      reviewUrl: 'https://app.rakuxon.com/dashboard/documents',
    });
    expect(log).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/illegible|person@example.com/);
  });

  it('never writes a recipient address to production logs on approval', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const adapter = new LoggingNotificationAdapter({ NODE_ENV: 'production' } as Env, fallbackOnlyTemplates);
    await adapter.sendDocumentApproved({
      to: 'person@example.com',
      documentType: 'identity',
      reviewUrl: 'https://app.rakuxon.com/dashboard/documents',
    });
    expect(log).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/person@example.com/);
  });

  it('logs an admin-edited template instead of the hardcoded copy, when one is enabled', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const templates: NotificationTemplateRenderer = {
      renderEmail: () =>
        Promise.resolve({ subject: 'Custom subject', html: '<p>Custom html</p>', text: 'Custom text' }),
      renderInApp: (_key, _context, fallback) => Promise.resolve(fallback()),
    };
    const adapter = new LoggingNotificationAdapter({ NODE_ENV: 'development' } as Env, templates);

    await adapter.sendDocumentApproved({
      to: 'ada@example.com',
      documentType: 'identity',
      reviewUrl: 'https://app.rakuxon.com/dashboard/documents',
    });

    expect(log).toHaveBeenCalledTimes(1);
    const [line] = log.mock.calls[0] as [string];
    expect(line).toContain('Custom subject');
    expect(line).toContain('Custom text');
  });
});
