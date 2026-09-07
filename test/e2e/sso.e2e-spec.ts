import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';

import { adminDataSource } from '../helpers/admin-data-source';
import { AppModule } from '../../src/app.module';
import { SSO_PROVIDERS } from '../../src/modules/auth/sso/sso.port';
import { UserStatus } from '../../src/contract/enums';
import { User } from '../../src/modules/users/entities/user.entity';
import { truncateIdentity, uniqueSlug } from '../helpers/create-test-app';
import type { SsoProfile, SsoProvider } from '../../src/modules/auth/sso/sso.port';

/**
 * The provider itself is mocked, per docs/03-tdd-guide.md — what matters here
 * is how a provider identity maps onto a platform account, not Google's wire
 * format, which google-sso.provider.spec.ts covers.
 */
class StubProvider implements SsoProvider {
  readonly name = 'google';
  profile: SsoProfile = {
    providerAccountId: 'google-subject-1',
    email: 'someone@example.com',
    fullName: 'Some One',
    emailVerified: true,
  };

  async exchangeCode(): Promise<SsoProfile> {
    return this.profile;
  }
}

describe('single sign-on', () => {
  let app: INestApplication;
  let provider: StubProvider;

  beforeAll(async () => {
    provider = new StubProvider();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SSO_PROVIDERS)
      .useValue(new Map<string, SsoProvider>([['google', provider]]))
      .compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    /* Owner connection: the runtime role has no DDL rights by design. */
    await (await adminDataSource()).runMigrations();
  });

  afterAll(async () => {
    await truncateIdentity(app);
    await app?.close();
  });

  async function registerAgency() {
    const slug = uniqueSlug();
    const { body } = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        agencyName: 'Northwind',
        slug,
        email: `admin@${slug}.example`,
        fullName: 'Ada Lovelace',
        password: 'correct-horse-battery',
      })
      .expect(201);
    return body;
  }

  const callback = (providerName = 'google') =>
    request(app.getHttpServer())
      .post(`/v1/auth/sso/${providerName}/callback`)
      .send({ code: 'auth-code', redirectUri: 'https://app.test/cb' });

  it('signs an existing user in and returns a session', async () => {
    const session = await registerAgency();
    provider.profile = {
      providerAccountId: `sub-${Math.random()}`,
      email: session.user.email,
      fullName: 'Ada Lovelace',
      emailVerified: true,
    };

    const response = await callback().expect(200);
    expect(response.body.user.id).toBe(session.user.id);
    expect(typeof response.body.accessToken).toBe('string');
  });

  it('links the provider identity, so a second sign-in reuses the account', async () => {
    const session = await registerAgency();
    provider.profile = {
      providerAccountId: `sub-${Math.random()}`,
      email: session.user.email,
      fullName: 'Ada Lovelace',
      emailVerified: true,
    };

    const first = await callback().expect(200);
    const second = await callback().expect(200);

    expect(second.body.user.id).toBe(first.body.user.id);

    /* Read on the owner connection: rows are invisible to the runtime role
       outside a tenant context, which is the guarantee, not a problem here. */
    const users = await (await adminDataSource()).getRepository(User).count({
      where: { email: session.user.email },
    });
    expect(users).toBe(1);
  });

  it('refuses an address the provider has not verified', async () => {
    const session = await registerAgency();
    provider.profile = {
      providerAccountId: `sub-${Math.random()}`,
      email: session.user.email,
      fullName: 'Ada Lovelace',
      emailVerified: false,
    };

    // Otherwise anyone who can claim an address at a provider takes over the
    // matching platform account.
    await callback().expect(401);
  });

  it('does not create an account, because SSO must not create tenants', async () => {
    provider.profile = {
      providerAccountId: `sub-${Math.random()}`,
      email: `stranger-${Math.random().toString(36).slice(2)}@example.com`,
      fullName: 'A Stranger',
      emailVerified: true,
    };

    await callback().expect(401);
  });

  it('refuses a suspended account', async () => {
    const session = await registerAgency();
    await (await adminDataSource())
      .getRepository(User)
      .update({ id: session.user.id }, { status: UserStatus.Suspended });

    provider.profile = {
      providerAccountId: `sub-${Math.random()}`,
      email: session.user.email,
      fullName: 'Ada Lovelace',
      emailVerified: true,
    };

    await callback().expect(401);
  });

  it('answers 400 for a provider that is not configured', async () => {
    await callback('facebook').expect(400);
  });

  it('requires both the code and the redirect URI', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/sso/google/callback')
      .send({ code: 'auth-code' })
      .expect(400);
  });
});
