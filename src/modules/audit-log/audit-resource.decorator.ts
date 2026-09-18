import { SetMetadata } from '@nestjs/common';

export const AUDIT_RESOURCE_KEY = 'audit:resource';

/**
 * Tags a mutating admin route with what it acted on, for `AuditLogInterceptor`
 * to record as `resourceType` — applied only where a resource's own scoped
 * history actually needs to filter on it. Everything else the interceptor
 * still logs, just without a resource type to filter by.
 */
export const AuditResource = (resourceType: string) => SetMetadata(AUDIT_RESOURCE_KEY, resourceType);
