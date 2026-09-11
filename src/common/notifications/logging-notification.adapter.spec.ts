import { Logger } from '@nestjs/common';
import type { Env } from '../config/env.schema';
import { LoggingNotificationAdapter } from './logging-notification.adapter';

describe('LoggingNotificationAdapter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('never writes reset tokens or recipient addresses to production logs', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const adapter = new LoggingNotificationAdapter({ NODE_ENV: 'production' } as Env);
    await adapter.sendPasswordReset({
      to: 'person@example.com',
      resetUrl: 'https://app.rakuxon.com/reset-password/secret-token',
      expiresAt: new Date(),
    });
    expect(log).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/secret-token|person@example.com/);
  });

  it('never writes verification tokens or recipient addresses to production logs', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const adapter = new LoggingNotificationAdapter({ NODE_ENV: 'production' } as Env);
    await adapter.sendEmailVerification({
      to: 'person@example.com',
      verifyUrl: 'https://app.rakuxon.com/verify-email/secret-token',
      expiresAt: new Date(),
    });
    expect(log).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/secret-token|person@example.com/);
  });

  it('never writes a rejection reason or recipient address to production logs', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const adapter = new LoggingNotificationAdapter({ NODE_ENV: 'production' } as Env);
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
});
