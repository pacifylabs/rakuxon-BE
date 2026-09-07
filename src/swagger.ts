import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';

/**
 * OpenAPI at /docs, with the raw document at /docs-json.
 *
 * docs/07-api-contract.md asked for one contract mechanism to be chosen before
 * the first authenticated screen. This is it: the FE generates its client from
 * this document, so the published types cannot drift from the running API.
 *
 * `persistAuthorization` keeps a pasted bearer token across page reloads, which
 * is the difference between Swagger being usable for manual testing and not.
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Rakuxon API')
    .setDescription(
      [
        'Multi-tenant study-abroad platform API.',
        '',
        '**Tenancy.** The tenant is derived server-side from the bearer token or the request',
        'subdomain. It is never a field the client sets — any request body containing one is',
        'rejected by the global validation pipe.',
        '',
        '**Testing here.** Call `POST /v1/auth/register` then `POST /v1/auth/login`, press',
        '*Authorize*, and paste the `accessToken`. It persists across reloads.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      'access-token',
    )
    .addTag('health', 'Liveness and dependency checks')
    .addTag('auth', 'Registration, login, token rotation and password reset')
    .addTag('onboarding-links', 'Tokenised student invitations')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha', operationsSorter: 'alpha' },
  });
}
