import { v2 as cloudinary } from 'cloudinary';
import { AdminUploadsService } from './uploads.service';
import type { Env } from '../../common/config/env.schema';

describe('AdminUploadsService', () => {
  it('signs the Rakuxon path without exposing the shared account secret', () => {
    const secret = 'test-only-cloudinary-secret';
    const service = new AdminUploadsService({
      CLOUDINARY_CLOUD_NAME: 'test-cloud',
      CLOUDINARY_API_KEY: '12345',
      CLOUDINARY_API_SECRET: secret,
    } as Env);
    const result = service.createSignature('testimonials');
    expect(result.publicId).toMatch(/^rakuxon\/admin-content\/testimonials\/[0-9a-f-]+$/);
    expect(result.signature).toBe(cloudinary.utils.api_sign_request({
      public_id: result.publicId, timestamp: result.timestamp,
    }, secret));
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});
