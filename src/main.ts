/* Loads .env for local runs. Hosted environments inject real variables, and
   dotenv never overwrites something already set, so this is a no-op there. */
import 'dotenv/config';

import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { DataSource } from 'typeorm';

import { AppModule } from './app.module';
import { ENV } from './common/config/config.module';
import { corsOrigins } from './common/config/env.schema';
import type { Env } from './common/config/env.schema';
import { assertRlsEnforceable } from './common/tenancy/rls-enforcement';
import { setupSwagger } from './swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const env = app.get<Env>(ENV);

  /* Before anything can serve a request. A role that bypasses row-level
     security produces no error, no warning and no visible symptom — every
     query simply returns every tenant's rows. */
  await assertRlsEnforceable(app.get(DataSource));

  app.use(helmet());

  /* Each frontend app is its own origin and sends its bearer token
     explicitly, so the allow-list has to name all of them. */
  app.enableCors({ origin: corsOrigins(env), credentials: true });

  /* URI versioning, per docs/07-api-contract.md: every route is /v1/... */
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      /* Reject unknown keys outright rather than silently dropping them: a
         client sending `tenantId` should fail loudly, not be quietly ignored. */
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  setupSwagger(app);

  /* 0.0.0.0 explicitly: a host that binds only loopback is invisible to a
     platform health check, which reports as "no open ports detected" and looks
     like a crash rather than a binding problem. */
  await app.listen(env.PORT, '0.0.0.0');
}

void bootstrap();
