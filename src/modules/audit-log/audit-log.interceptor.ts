import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import type { Observable } from 'rxjs';
import { mergeMap } from 'rxjs';
import { Repository } from 'typeorm';

import { AUDIT_RESOURCE_KEY } from './audit-resource.decorator';
import { AuditLogService } from './audit-log.service';
import type { AuthenticatedAdminRequest } from '../../common/auth/authenticated-admin-request';
import { REQUIRE_PERMISSION_KEY } from '../../common/rbac/require-permission.decorator';
import { Admin } from '../admins/entities/admin.entity';
import { Permission } from '../admins/entities/permission.entity';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Attributes every admin mutation with no per-endpoint code: reads the same
 * `rbac:permissions` metadata `PermissionGuard` already used to decide the
 * request was allowed, and turns it into a human "who did what" row. Only
 * fires for a request `AdminJwtAuthGuard` actually authenticated — every
 * student-facing and public route is a no-op pass-through.
 *
 * Best-effort: a failure writing the log never fails the mutation itself —
 * see `logMutation`'s own catch.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditLog: AuditLogService,
    @InjectRepository(Admin) private readonly admins: Repository<Admin>,
    @InjectRepository(Permission) private readonly permissions: Repository<Permission>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      mergeMap(async (result) => {
        try { await this.logMutation(context); }
        catch { this.logger.error('Failed to write an audit-log entry'); }
        return result;
      }),
    );
  }

  private async logMutation(context: ExecutionContext): Promise<void> {
    const request = context.switchToHttp().getRequest<AuthenticatedAdminRequest>();
    if (!request.admin || !MUTATING_METHODS.has(request.method)) return;

    const required = this.reflector.getAllAndOverride<string[] | undefined>(REQUIRE_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return;

    const [admin, permission] = await Promise.all([
      this.admins.findOne({ where: { id: request.admin.id } }),
      this.permissions.findOne({ where: { key: required[0] } }),
    ]);

    const resourceType = this.reflector.getAllAndOverride<string | undefined>(AUDIT_RESOURCE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    /* Only meaningful paired with a resourceType — and only ever a uuid, since
       that's the column's type; a route keyed by something else (a country
       code, a slug) has no tagged resourceType and so gets no resourceId either. */
    const firstParam = Object.values(request.params ?? {})[0] as string | undefined;
    const resourceId = resourceType && firstParam && UUID_PATTERN.test(firstParam) ? firstParam : null;

    await this.auditLog.record({
      actorType: 'admin',
      actorId: request.admin.id,
      actorName: admin ? `${admin.firstName} ${admin.lastName}` : null,
      action: required[0]!,
      description: permission?.description ?? `${request.method} ${request.route?.path ?? request.url}`,
      resourceType: resourceType ?? null,
      resourceId,
    });
  }
}
