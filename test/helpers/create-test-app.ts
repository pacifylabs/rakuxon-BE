import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { adminDataSource, truncateAll } from './admin-data-source';
import { NOTIFICATION_PORT } from '../../src/common/notifications/notification.port';
import { AppModule } from '../../src/app.module';
import type {
  NotificationPort,
  PasswordResetMessage,
} from '../../src/common/notifications/notification.port';

/**
 * Captures what would have been emailed.
 *
 * Lets a test hold a real reset token without reading an inbox, and without
 * reaching into the database to rewrite a hash — so the flow under test is the
 * one that actually runs in production.
 */
export class CapturingNotifications implements NotificationPort {
  readonly passwordResets: PasswordResetMessage[] = [];

  async sendPasswordReset(message: PasswordResetMessage): Promise<void> {
    this.passwordResets.push(message);
  }

  /** The token out of the most recent reset link for an address. */
  latestTokenFor(email: string): string {
    const message = [...this.passwordResets].reverse().find((entry) => entry.to === email);
    if (!message) throw new Error(`No password reset was sent to ${email}`);

    const token = message.resetUrl.split('/reset-password/')[1];
    if (!token) throw new Error(`Reset URL had no token: ${message.resetUrl}`);

    return token;
  }
}

export interface TestApp {
  app: INestApplication;
  notifications: CapturingNotifications;
}

/** Boots the real app with the same pipes and versioning main.ts applies. */
export async function createTestApp(): Promise<TestApp> {
  const notifications = new CapturingNotifications();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(NOTIFICATION_PORT)
    .useValue(notifications)
    .compile();

  const app = moduleRef.createNestApplication();

  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  await app.init();

  /* Migrations run on the owner connection: the application role has no DDL
     rights, which is the point. */
  await (await adminDataSource()).runMigrations();

  return { app, notifications };
}

/**
 * Empties the identity tables between suites, leaving the schema in place.
 *
 * Takes the app only to keep the call sites unchanged; the work happens on the
 * owner connection, because TRUNCATE is not granted to the application role.
 */
export async function truncateIdentity(_app?: INestApplication): Promise<void> {
  await truncateAll();
}

/** A slug that cannot collide with a parallel run. */
export const uniqueSlug = (prefix = 'agency'): string =>
  `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
