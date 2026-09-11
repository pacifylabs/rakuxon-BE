import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ListTenantsQueryDto, TenantDto, TenantListDto } from './dto/tenant.dto';
import { TenantsService } from './tenants.service';
import { AdminJwtAuthGuard } from '../../common/auth/admin-jwt-auth.guard';
import { Public } from '../../common/auth/public.decorator';
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
  constructor(private readonly tenants: TenantsService) {}

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

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('tenants.approve')
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
  @ApiOperation({ summary: 'Suspend an active tenant', description: 'Active -> suspended only.' })
  @ApiOkResponse({ type: TenantDto })
  suspend(@Param('id') id: string): Promise<TenantDto> {
    return this.tenants.suspend(id);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('tenants.approve')
  @ApiOperation({ summary: 'Reinstate a suspended tenant', description: 'Suspended -> active only.' })
  @ApiOkResponse({ type: TenantDto })
  reactivate(@Param('id') id: string): Promise<TenantDto> {
    return this.tenants.reactivate(id);
  }
}
