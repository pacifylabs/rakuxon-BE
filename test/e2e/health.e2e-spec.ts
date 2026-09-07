import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { createTestApp } from '../helpers/create-test-app';

describe('GET /v1/health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns 200 with build information, unauthenticated', async () => {
    // A load balancer has no credentials, so this route opts out of the
    // global auth guard. Everything else is closed by default.
    const response = await request(app.getHttpServer()).get('/v1/health').expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      environment: 'test',
      dependencies: { database: 'up' },
    });
    expect(typeof response.body.version).toBe('string');
    expect(typeof response.body.uptimeSeconds).toBe('number');
  });

  it('is versioned, so the unversioned path is not silently served', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });
});
