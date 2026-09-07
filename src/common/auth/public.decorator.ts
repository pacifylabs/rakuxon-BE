import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:public';

/**
 * Opts a route out of authentication. Every route is protected by default, so
 * this has to be explicit and is easy to grep for in review.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
