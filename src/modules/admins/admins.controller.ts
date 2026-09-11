import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminsService } from './admins.service';
import { AdminListDto, AdminSummaryDto, CreateAdminDto, PermissionDto, UpdateAdminPermissionsDto } from './dto/admin.dto';
import { AdminJwtAuthGuard } from '../../common/auth/admin-jwt-auth.guard';
import { Public } from '../../common/auth/public.decorator';
import { PermissionGuard } from '../../common/rbac/permission.guard';
import { RequirePermission } from '../../common/rbac/require-permission.decorator';

/**
 * Managing admin accounts themselves — the piece that makes "several admins,
 * different permissions" actually usable, not just representable in the
 * schema. Every route needs `admins.manage`.
 *
 * @Public() opts every route out of the global, users-table JwtAuthGuard;
 * AdminJwtAuthGuard + PermissionGuard do the real authentication and
 * authorisation here — see AdminJwtAuthGuard's doc comment for why both are
 * required together.
 */
@ApiTags('admins')
@Controller('admin/admins')
@Public()
@UseGuards(AdminJwtAuthGuard, PermissionGuard)
@ApiBearerAuth('admin-access-token')
export class AdminsController {
  constructor(private readonly admins: AdminsService) {}

  @Get('permissions')
  @RequirePermission('admins.manage')
  @ApiOperation({ summary: 'The full permission catalogue, for a create/edit form' })
  @ApiOkResponse({ type: [PermissionDto] })
  listPermissions(): Promise<PermissionDto[]> {
    return this.admins.listPermissionsCatalog();
  }

  @Post()
  @RequirePermission('admins.manage')
  @ApiOperation({
    summary: 'Create an admin',
    description:
      'The creating admin sets a real password directly, and assigns the new admin’s initial ' +
      'permission set. The new admin can change their password via the reset flow like anyone else.',
  })
  @ApiCreatedResponse({ type: AdminSummaryDto })
  @ApiForbiddenResponse({ description: 'Missing the admins.manage permission.' })
  create(@Body() dto: CreateAdminDto): Promise<AdminSummaryDto> {
    return this.admins.create(dto);
  }

  @Get()
  @RequirePermission('admins.manage')
  @ApiOperation({ summary: 'List every admin and their current permissions' })
  @ApiOkResponse({ type: AdminListDto })
  async list(): Promise<AdminListDto> {
    return { items: await this.admins.list() };
  }

  @Patch(':id/permissions')
  @RequirePermission('admins.manage')
  @ApiOperation({
    summary: 'Replace an admin’s permission set',
    description:
      'Sets the permission set to exactly the given list — not additive. An admin holding ' +
      'admins.manage may grant or revoke any permission key, including ones they do not ' +
      'themselves hold; there is no hierarchy check in this first slice.',
  })
  @ApiOkResponse({ type: AdminSummaryDto })
  updatePermissions(
    @Param('id') id: string,
    @Body() dto: UpdateAdminPermissionsDto,
  ): Promise<AdminSummaryDto> {
    return this.admins.updatePermissions(id, dto.permissionKeys);
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('admins.manage')
  @ApiOperation({ summary: 'Suspend an admin account' })
  @ApiOkResponse({ type: AdminSummaryDto })
  suspend(@Param('id') id: string): Promise<AdminSummaryDto> {
    return this.admins.suspend(id);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('admins.manage')
  @ApiOperation({ summary: 'Reactivate a suspended admin account' })
  @ApiOkResponse({ type: AdminSummaryDto })
  reactivate(@Param('id') id: string): Promise<AdminSummaryDto> {
    return this.admins.reactivate(id);
  }
}
