import { Global, Logger, Module } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

import { ENV } from '../config/config.module';
import { smtpConfigured } from '../config/env.schema';
import type { Env } from '../config/env.schema';
import { LoggingNotificationAdapter } from './logging-notification.adapter';
import { MAIL_TRANSPORT } from './mail-transport';
import type { MailTransport } from './mail-transport';
import { NOTIFICATION_PORT } from './notification.port';
import type { NotificationPort } from './notification.port';
import { SmtpNotificationAdapter } from './smtp-notification.adapter';

const logger = new Logger('NotificationsModule');

/**
 * Built regardless of which adapter is selected below — cheap, since
 * nodemailer does not open a connection until `sendMail` is called — but only
 * ever exercised when `smtpConfigured(env)` chose the SMTP adapter. Unconfigured,
 * it stands in as a transport nothing should ever call.
 */
function buildTransport(env: Env): MailTransport {
  if (!smtpConfigured(env)) {
    return {
      sendMail: () => {
        throw new Error('SMTP is not configured; the logging adapter should have been selected.');
      },
    };
  }

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
}

@Global()
@Module({
  providers: [
    { provide: MAIL_TRANSPORT, useFactory: buildTransport, inject: [ENV] },
    {
      provide: NOTIFICATION_PORT,
      useFactory: (env: Env, transport: MailTransport): NotificationPort => {
        if (smtpConfigured(env)) {
          logger.log(`Sending mail via SMTP (${env.SMTP_HOST}:${env.SMTP_PORT}).`);
          return new SmtpNotificationAdapter(env, transport);
        }

        logger.warn('SMTP is not configured; falling back to the logging adapter.');
        return new LoggingNotificationAdapter(env);
      },
      inject: [ENV, MAIL_TRANSPORT],
    },
  ],
  exports: [NOTIFICATION_PORT],
})
export class NotificationsModule {}
