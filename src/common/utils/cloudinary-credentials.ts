import { BadRequestException } from '@nestjs/common';

import type { Env } from '../config/env.schema';

export interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

/**
 * Every signed-upload flow (student documents, admin content images) needs
 * the same three values and the same refusal when they're absent — a
 * deployment with no Cloudinary account configured yet, not a bug.
 */
export function cloudinaryCredentials(env: Env): CloudinaryCredentials {
  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = env;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new BadRequestException('Document upload is not configured on this deployment yet.');
  }

  return { cloudName, apiKey, apiSecret };
}
