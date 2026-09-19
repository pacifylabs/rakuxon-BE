import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Admin-editable copy for the six system messages the app already sends,
 * seeded with the exact copy each `*.template.ts` function hardcoded —
 * nothing changes for a recipient until an admin actually edits a row.
 * `NotificationTemplatesService` falls back to those same functions (and to
 * the inline in-app copy at each call site) whenever a row is missing or
 * `enabled = false`, so deleting a row by mistake degrades gracefully
 * instead of breaking the message.
 */
export class NotificationTemplates1757003800000 implements MigrationInterface {
  name = 'NotificationTemplates1757003800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notification_templates" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "key" text NOT NULL UNIQUE,
        "channel" text NOT NULL,
        "subject" text,
        "heading" text NOT NULL,
        "body" text[] NOT NULL DEFAULT '{}',
        "ctaLabel" text,
        "ctaUrl" text,
        "footnote" text,
        "enabled" boolean NOT NULL DEFAULT true,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      INSERT INTO "notification_templates"
        ("key", "channel", "subject", "heading", "body", "ctaLabel", "ctaUrl", "footnote") VALUES
      (
        'password_reset', 'email', 'Reset your Rakuxon password', 'Reset your password',
        ARRAY[
          'We received a request to reset the password on your Rakuxon account.',
          'Click the button below to choose a new one.'
        ],
        'Reset password', '{{resetUrl}}',
        'This link expires {{expiresIn}}. If you didn''t request a password reset, you can safely ignore this email — your password hasn''t changed.'
      ),
      (
        'email_verification', 'email', 'Confirm your email address', 'Confirm your email address',
        ARRAY['Thanks for creating a Rakuxon account. Confirm this email address to finish setting things up.'],
        'Confirm email', '{{verifyUrl}}',
        'This link expires {{expiresIn}}. If you didn''t create a Rakuxon account, you can ignore this email.'
      ),
      (
        'document_rejected', 'both', 'One of your documents needs another look', 'A document needs another look',
        ARRAY[
          'Your {{documentType}} was reviewed and could not be accepted: {{reason}}',
          'Upload a replacement when you have one ready.'
        ],
        'Review documents', '{{reviewUrl}}', NULL
      ),
      (
        'document_approved', 'both', 'One of your documents was approved', 'A document was approved',
        ARRAY['Your {{documentType}} was reviewed and accepted — nothing more to do for this one.'],
        'View documents', '{{reviewUrl}}', NULL
      ),
      (
        'application_submitted', 'both', 'Your application has been submitted', 'Application submitted',
        ARRAY['Your application for {{courseName}} at {{institutionName}} has been submitted. An admissions team member will review it and reach out with next steps.'],
        'View application', '{{reviewUrl}}', NULL
      ),
      (
        'case_assigned', 'both', 'A case has been assigned to you', 'A case was assigned to you',
        ARRAY['{{studentName}}''s application for {{courseName}} at {{institutionName}} is now assigned to you.'],
        'View application', '{{reviewUrl}}', NULL
      );
    `);

    await queryRunner.query(`
      INSERT INTO "permissions" ("key", "description") VALUES
        ('notifications.view', 'View the copy behind every email and in-app notification the platform sends'),
        ('notifications.manage', 'Edit the copy behind emails and in-app notifications, or disable one');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "permissions" WHERE "key" IN ('notifications.view', 'notifications.manage');
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_templates";`);
  }
}
