import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuditLogListDto, ListAuditLogQueryDto } from './dto/audit-log.dto';
import { AuditLogService } from './audit-log.service';
import { AdminJwtAuthGuard } from '../../common/auth/admin-jwt-auth.guard';
import { Public } from '../../common/auth/public.decorator';
import { PermissionGuard } from '../../common/rbac/permission.guard';
import { RequirePermission } from '../../common/rbac/require-permission.decorator';

/**
 * Platform-wide — every admin and student action, across every resource.
 * Separate from a resource's own scoped history (which reuses whatever
 * permission already lets an admin view that resource): this is the
 * superadmin view, gated by its own `platform.audit` key.
 */
@ApiTags('audit-log')
@Controller('admin/audit-log')
@Public()
@UseGuards(AdminJwtAuthGuard, PermissionGuard)
@ApiBearerAuth('admin-access-token')
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  @Get()
  @RequirePermission('platform.audit')
  @ApiOperation({ summary: 'The platform-wide activity log, filterable and paginated' })
  @ApiOkResponse({ type: AuditLogListDto })
  list(@Query() query: ListAuditLogQueryDto): Promise<AuditLogListDto> {
    return this.auditLog.listPlatform(query);
  }
}
