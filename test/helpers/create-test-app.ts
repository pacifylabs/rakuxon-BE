import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { adminDataSource, truncateAll } from './admin-data-source';
import { NOTIFICATION_PORT } from '../../src/common/notifications/notification.port';
import { AppModule } from '../../src/app.module';
import type {
  DocumentRejectedMessage,
  EmailVerificationMessage,
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
  readonly emailVerifications: EmailVerificationMessage[] = [];
  readonly documentRejections: DocumentRejectedMessage[] = [];

  async sendPasswordReset(message: PasswordResetMessage): Promise<void> {
    this.passwordResets.push(message);
  }

  async sendEmailVerification(message: EmailVerificationMessage): Promise<void> {
    this.emailVerifications.push(message);
  }

  async sendDocumentRejected(message: DocumentRejectedMessage): Promise<void> {
    this.documentRejections.push(message);
  }

  /** The token out of the most recent reset link for an address. */
  latestTokenFor(email: string): string {
    const message = [...this.passwordResets].reverse().find((entry) => entry.to === email);
    if (!message) throw new Error(`No password reset was sent to ${email}`);

    const token = message.resetUrl.split('/reset-password/')[1];
    if (!token) throw new Error(`Reset URL had no token: ${message.resetUrl}`);

    return token;
  }

  /** The token out of the most recent verification link for an address. */
  latestVerificationTokenFor(email: string): string {
    const message = [...this.emailVerifications].reverse().find((entry) => entry.to === email);
    if (!message) throw new Error(`No verification email was sent to ${email}`);

    const token = message.verifyUrl.split('/verify-email/')[1];
    if (!token) throw new Error(`Verify URL had no token: ${message.verifyUrl}`);

    return token;
  }
}

export interface TestApp {
  app: INestApplication;
  notifications: CapturingNotifications;
}

/** Boots the real app with the same pipes and versioning main.ts applies. */
export async function createTestApp(): Promise<TestApp> {
  /*
   * Migrations run first, on the owner connection (the application role has no
   * DDL rights, which is the point), and only then does the app boot. With
   * DATABASE_SYNCHRONIZE on, booting synchronises the schema from the entities,
   * whose generated search columns call a function a migration creates — so on
   * a fresh database, booting first fails before any test runs. CI hid this by
   * migrating in a separate step beforehand; this order no longer depends on it.
   */
  await (await adminDataSource()).runMigrations();

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
