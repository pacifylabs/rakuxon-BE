import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  AdminServiceDetailDto,
  AdminServiceListDto,
  AdminServiceSummaryDto,
  CreateServiceDto,
  ListAdminServicesQueryDto,
  UpdateServiceDto,
} from './dto/service.dto';
import { ServicesService } from './services.service';
import { AdminJwtAuthGuard } from '../../common/auth/admin-jwt-auth.guard';
import { Public } from '../../common/auth/public.decorator';
import { PermissionGuard } from '../../common/rbac/permission.guard';
import { RequirePermission } from '../../common/rbac/require-permission.decorator';
import { PublishStatus } from '../../contract/enums';

/**
 * @Public() opts every route out of the global, users-table JwtAuthGuard;
 * AdminJwtAuthGuard + PermissionGuard do the real auth here — same shape as
 * AdminTestimonialsController.
 */
@ApiTags('admin-services')
@Controller('admin/services')
@Public()
@UseGuards(AdminJwtAuthGuard, PermissionGuard)
@ApiBearerAuth('admin-access-token')
export class AdminServicesController {
  constructor(private readonly services: ServicesService) {}

  @Post()
  @RequirePermission('content.manage')
  @ApiOperation({ summary: 'Create a service', description: 'Starts life as draft.' })
  @ApiCreatedResponse({ type: AdminServiceDetailDto })
  create(@Body() dto: CreateServiceDto): Promise<AdminServiceDetailDto> {
    return this.services.create(dto);
  }

  @Get()
  @RequirePermission('content.view')
  @ApiOperation({ summary: 'List services, including drafts and suspended records' })
  @ApiOkResponse({ type: AdminServiceListDto })
  list(@Query() query: ListAdminServicesQueryDto): Promise<AdminServiceListDto> {
    return this.services.listAdmin(query);
  }

  @Get(':id')
  @RequirePermission('content.view')
  @ApiOkResponse({ type: AdminServiceDetailDto })
  getDetail(@Param('id') id: string): Promise<AdminServiceDetailDto> {
    return this.services.getDetail(id);
  }

  @Patch(':id')
  @RequirePermission('content.manage')
  @ApiOkResponse({ type: AdminServiceDetailDto })
  update(@Param('id') id: string, @Body() dto: UpdateServiceDto): Promise<AdminServiceDetailDto> {
    return this.services.update(id, dto);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('content.manage')
  @ApiOkResponse({ type: AdminServiceSummaryDto })
  publish(@Param('id') id: string): Promise<AdminServiceSummaryDto> {
    return this.services.setStatus(id, PublishStatus.Published);
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('content.manage')
  @ApiOkResponse({ type: AdminServiceSummaryDto })
  suspend(@Param('id') id: string): Promise<AdminServiceSummaryDto> {
    return this.services.setStatus(id, PublishStatus.Suspended);
  }

  @Post(':id/revert-to-draft')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('content.manage')
  @ApiOkResponse({ type: AdminServiceSummaryDto })
  revertToDraft(@Param('id') id: string): Promise<AdminServiceSummaryDto> {
    return this.services.setStatus(id, PublishStatus.Draft);
  }
}
