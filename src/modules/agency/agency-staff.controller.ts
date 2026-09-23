import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AgencyService } from './agency.service';
import { CreateAgencyStaffDto } from './dto/agency.dto';
import { TenantStaffDto, TenantStaffListDto } from '../tenants/dto/tenant.dto';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/rbac/roles.decorator';
import { AGENCY_ROLES, Role } from '../../contract/enums';
import type { AuthenticatedUser } from '../../common/auth/authenticated-request';

/**
 * An agency managing its own counselors, without a Rakuxon admin in the
 * loop. Listing is open to any agency role; inviting and suspending are
 * `agency_admin`-only — a counselor does not manage their own colleagues.
 */
@ApiTags('agency-staff')
@ApiBearerAuth('access-token')
@Controller('agency/staff')
@Roles(...AGENCY_ROLES)
export class AgencyStaffController {
  constructor(private readonly agency: AgencyService) {}

  @Get()
  @ApiOperation({ summary: "The caller's own agency's staff" })
  @ApiOkResponse({ type: TenantStaffListDto })
  list(@CurrentUser() user: AuthenticatedUser): Promise<TenantStaffListDto> {
    return this.agency.listStaff(user.tenantId!);
  }

  @Post()
  @Roles(Role.AgencyAdmin)
  @ApiOperation({ summary: 'Invite a counselor into the caller\'s own agency' })
  @ApiCreatedResponse({ type: TenantStaffDto })
  addStaff(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAgencyStaffDto,
  ): Promise<TenantStaffDto> {
    return this.agency.addStaff(user.tenantId!, dto);
  }

  @Post(':userId/suspend')
  @Roles(Role.AgencyAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend one of the caller\'s own agency\'s staff' })
  @ApiOkResponse({ type: TenantStaffDto })
  suspend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ): Promise<TenantStaffDto> {
    return this.agency.suspendStaff(user.tenantId!, userId);
  }

  @Post(':userId/reactivate')
  @Roles(Role.AgencyAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate one of the caller\'s own agency\'s staff' })
  @ApiOkResponse({ type: TenantStaffDto })
  reactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ): Promise<TenantStaffDto> {
    return this.agency.reactivateStaff(user.tenantId!, userId);
  }
}
