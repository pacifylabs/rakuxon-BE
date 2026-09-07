/* Loads .env for local runs. Hosted environments inject real variables, and
   dotenv never overwrites something already set, so this is a no-op there. */
import 'dotenv/config';

import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { ENV } from './common/config/config.module';
import { corsOrigins } from './common/config/env.schema';
import type { Env } from './common/config/env.schema';
import { setupSwagger } from './swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const env = app.get<Env>(ENV);

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

  await app.listen(env.PORT);
}

void bootstrap();
