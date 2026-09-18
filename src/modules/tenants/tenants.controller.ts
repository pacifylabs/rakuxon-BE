import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import {
  AdminCreateTenantDto,
  CreateTenantStaffDto,
  ListTenantsQueryDto,
  SetTenantStaffPasswordDto,
  TenantDto,
  TenantListDto,
  TenantStaffDto,
  TenantStaffListDto,
  UpdateTenantDto,
} from './dto/tenant.dto';
import { TenantsService } from './tenants.service';
import { AdminJwtAuthGuard } from '../../common/auth/admin-jwt-auth.guard';
import { Public } from '../../common/auth/public.decorator';
import { AuditResource } from '../audit-log/audit-resource.decorator';
import { ResourceAuditLogDto } from '../audit-log/dto/audit-log.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PermissionGuard } from '../../common/rbac/permission.guard';
import { RequirePermission } from '../../common/rbac/require-permission.decorator';

/**
 * Tenant vetting. @Public() opts every route out of the global, users-table
 * JwtAuthGuard; AdminJwtAuthGuard + PermissionGuard do the real auth here.
 */
@ApiTags('tenants')
@Controller('admin/tenants')
@Public()
@UseGuards(AdminJwtAuthGuard, PermissionGuard)
@ApiBearerAuth('admin-access-token')
export class TenantsController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Post()
  @RequirePermission('tenants.approve')
  @AuditResource('tenant')
  @ApiOperation({
    summary: 'Create a partner directly',
    description:
      'For a partner the client already has a relationship with — no self-service signup, no ' +
      'approval wait. Creates the partner active immediately, plus its first staff user with a ' +
      'password set directly by the creating admin. Gated by tenants.approve: creating and ' +
      'vouching for a partner is the same trust tier as approving one.',
  })
  @ApiCreatedResponse({ type: TenantDto })
  @ApiForbiddenResponse({ description: 'Missing the tenants.approve permission.' })
  create(@Body() dto: AdminCreateTenantDto): Promise<TenantDto> {
    return this.tenants.create(dto);
  }

  @Get()
  @RequirePermission('tenants.view')
  @ApiOperation({ summary: 'List tenants, filterable by status' })
  @ApiOkResponse({ type: TenantListDto })
  list(@Query() query: ListTenantsQueryDto): Promise<TenantListDto> {
    return this.tenants.list(query);
  }

  @Get(':id')
  @RequirePermission('tenants.view')
  @ApiOperation({ summary: 'One tenant' })
  @ApiOkResponse({ type: TenantDto })
  @ApiNotFoundResponse({ description: 'No tenant with that id.' })
  get(@Param('id') id: string): Promise<TenantDto> {
    return this.tenants.get(id);
  }

  @Get(':id/audit-log')
  @RequirePermission('tenants.view')
  @ApiOperation({ summary: "This partner's own history — every admin action on it" })
  @ApiOkResponse({ type: ResourceAuditLogDto })
  async auditLogFor(@Param('id') id: string): Promise<ResourceAuditLogDto> {
    return { items: await this.auditLog.listForResource('tenant', id) };
  }

  @Patch(':id')
  @RequirePermission('tenants.approve')
  @AuditResource('tenant')
  @ApiOperation({ summary: "Edit a partner's name or subdomain" })
  @ApiOkResponse({ type: TenantDto })
  @ApiNotFoundResponse({ description: 'No tenant with that id.' })
  update(@Param('id') id: string, @Body() dto: UpdateTenantDto): Promise<TenantDto> {
    return this.tenants.update(id, dto);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('tenants.approve')
  @AuditResource('tenant')
  @ApiOperation({
    summary: 'Approve a pending tenant',
    description: 'Pending -> active only. This is what lifts the onboarding-links gate for the agency.',
  })
  @ApiOkResponse({ type: TenantDto })
  @ApiForbiddenResponse({ description: 'Missing the tenants.approve permission.' })
  approve(@Param('id') id: string): Promise<TenantDto> {
    return this.tenants.approve(id);
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('tenants.suspend')
  @AuditResource('tenant')
  @ApiOperation({ summary: 'Suspend an active tenant', description: 'Active -> suspended only.' })
  @ApiOkResponse({ type: TenantDto })
  suspend(@Param('id') id: string): Promise<TenantDto> {
    return this.tenants.suspend(id);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('tenants.approve')
  @AuditResource('tenant')
  @ApiOperation({ summary: 'Reinstate a suspended tenant', description: 'Suspended -> active only.' })
  @ApiOkResponse({ type: TenantDto })
  reactivate(@Param('id') id: string): Promise<TenantDto> {
    return this.tenants.reactivate(id);
  }

  @Get(':tenantId/staff')
  @RequirePermission('tenants.view')
  @ApiOperation({ summary: "List a partner's staff users" })
  @ApiOkResponse({ type: TenantStaffListDto })
  @ApiNotFoundResponse({ description: 'No tenant with that id.' })
  async listStaff(@Param('tenantId') tenantId: string): Promise<TenantStaffListDto> {
    return { items: await this.tenants.listStaff(tenantId) };
  }

  @Post(':tenantId/staff')
  @RequirePermission('tenants.approve')
  @AuditResource('tenant')
  @ApiOperation({
    summary: 'Add a staff user to an existing partner',
    description: 'The creating admin sets a real password directly, same as creating the partner itself.',
  })
  @ApiCreatedResponse({ type: TenantStaffDto })
  @ApiNotFoundResponse({ description: 'No tenant with that id.' })
  addStaff(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateTenantStaffDto,
  ): Promise<TenantStaffDto> {
    return this.tenants.addStaff(tenantId, dto);
  }

  @Post(':tenantId/staff/:userId/set-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('tenants.approve')
  @AuditResource('tenant')
  @ApiOperation({
    summary: "Set a staff member's password directly — a reset done for them, not by them.",
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'No staff member with that id at this partner.' })
  setStaffPassword(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
    @Body() dto: SetTenantStaffPasswordDto,
  ): Promise<void> {
    return this.tenants.setStaffPassword(tenantId, userId, dto.password);
  }
}
