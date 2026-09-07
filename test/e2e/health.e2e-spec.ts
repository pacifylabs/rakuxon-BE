import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../src/app.module';

describe('GET /v1/health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns 200 with build information', async () => {
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
