import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

import type { AdminUploadFolder, AdminUploadSignatureDto } from './dto/admin-upload.dto';
import { ENV } from '../../common/config/config.module';
import { cloudinaryCredentials } from '../../common/utils/cloudinary-credentials';
import type { Env } from '../../common/config/env.schema';

/**
 * Signs a direct-to-Cloudinary upload for an admin-authored content image
 * (a testimonial photo, an institution's logo/hero, an article's hero).
 *
 * Unlike a student document, there's no row to create first — the caller
 * already has an entity (the testimonial, institution or article) with a
 * plain URL column, and just needs a `secure_url` to put in it once the
 * upload completes. So this issues a signature and nothing else; the actual
 * write still goes through that entity's own permission-gated update
 * endpoint, which is the real gate here.
 */
@Injectable()
export class AdminUploadsService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  createSignature(folder: AdminUploadFolder): AdminUploadSignatureDto {
    const { cloudName, apiKey, apiSecret } = cloudinaryCredentials(this.env);

    const publicId = `rakuxon/admin-content/${folder}/${randomUUID()}`;
    const timestamp = Math.round(Date.now() / 1000);
    const signature = cloudinary.utils.api_sign_request({ public_id: publicId, timestamp }, apiSecret);

    return {
      cloudName,
      apiKey,
      timestamp,
      signature,
      publicId,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
    };
  }
}
