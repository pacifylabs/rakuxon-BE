import { Global, Module } from '@nestjs/common';

import { TenantContext } from './tenant-context';

/**
 * Global because every module from stage 3 onward reaches the database
 * through it, and a tenant-scoped module that forgot to import it would fall
 * back to unscoped repositories — the exact mistake this stage exists to make
 * impossible.
 */
@Global()
@Module({ providers: [TenantContext], exports: [TenantContext] })
export class TenancyModule {}
