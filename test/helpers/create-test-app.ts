import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { AppModule } from '../../src/app.module';

/** Boots the real app with the same pipes and versioning main.ts applies. */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();

  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  await app.init();

  const dataSource = app.get(DataSource);
  await dataSource.runMigrations();

  return app;
}

/** Empties the identity tables between suites, leaving the schema in place. */
export async function truncateIdentity(app: INestApplication): Promise<void> {
  const dataSource = app.get(DataSource);
  await dataSource.query(
    'TRUNCATE TABLE "onboarding_links", "refresh_tokens", "users", "tenants" CASCADE',
  );
}

/** A slug that cannot collide with a parallel run. */
export const uniqueSlug = (prefix = 'agency'): string =>
  `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
