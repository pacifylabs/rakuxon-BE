import { Global, Module } from '@nestjs/common';

import { validateEnv } from './env.schema';
import type { Env } from './env.schema';

export const ENV = Symbol('ENV');

/**
 * Publishes the validated environment. Global so no feature module has to
 * import it, and nothing anywhere reads `process.env` directly.
 */
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: (): Env => validateEnv(process.env) }],
  exports: [ENV],
})
export class ConfigModule {}
