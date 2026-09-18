import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  AdminDestinationDetailDto,
  AdminDestinationListDto,
  AdminDestinationSummaryDto,
  CreateDestinationDto,
  ListAdminDestinationsQueryDto,
  UpdateDestinationDto,
} from './dto/destination.dto';
import { DestinationsService } from './destinations.service';
import { AdminJwtAuthGuard } from '../../common/auth/admin-jwt-auth.guard';
import { Public } from '../../common/auth/public.decorator';
import { PermissionGuard } from '../../common/rbac/permission.guard';
import { RequirePermission } from '../../common/rbac/require-permission.decorator';
import { PublishStatus } from '../../contract/enums';

/**
 * The written guide behind a handful of /destinations cards — separate from
 * the reference country list (Countries utility), which governs which
 * countries serve applicants at all. @Public() opts every route out of the
 * global, users-table JwtAuthGuard; AdminJwtAuthGuard + PermissionGuard do
 * the real auth here, same shape as AdminTestimonialsController.
 */
@ApiTags('admin-destinations')
@Controller('admin/destinations')
@Public()
@UseGuards(AdminJwtAuthGuard, PermissionGuard)
@ApiBearerAuth('admin-access-token')
export class AdminDestinationsController {
  constructor(private readonly destinations: DestinationsService) {}

  @Post()
  @RequirePermission('content.manage')
  @ApiOperation({ summary: 'Create a destination guide', description: 'Starts life as draft.' })
  @ApiCreatedResponse({ type: AdminDestinationDetailDto })
  create(@Body() dto: CreateDestinationDto): Promise<AdminDestinationDetailDto> {
    return this.destinations.create(dto);
  }

  @Get()
  @RequirePermission('content.view')
  @ApiOperation({ summary: 'List destination guides, including drafts and suspended records' })
  @ApiOkResponse({ type: AdminDestinationListDto })
  list(@Query() query: ListAdminDestinationsQueryDto): Promise<AdminDestinationListDto> {
    return this.destinations.listAdmin(query);
  }

  @Get(':id')
  @RequirePermission('content.view')
  @ApiOkResponse({ type: AdminDestinationDetailDto })
  getDetail(@Param('id') id: string): Promise<AdminDestinationDetailDto> {
    return this.destinations.getDetail(id);
  }

  @Patch(':id')
  @RequirePermission('content.manage')
  @ApiOkResponse({ type: AdminDestinationDetailDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDestinationDto,
  ): Promise<AdminDestinationDetailDto> {
    return this.destinations.update(id, dto);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('content.manage')
  @ApiOkResponse({ type: AdminDestinationSummaryDto })
  publish(@Param('id') id: string): Promise<AdminDestinationSummaryDto> {
    return this.destinations.setStatus(id, PublishStatus.Published);
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('content.manage')
  @ApiOkResponse({ type: AdminDestinationSummaryDto })
  suspend(@Param('id') id: string): Promise<AdminDestinationSummaryDto> {
    return this.destinations.setStatus(id, PublishStatus.Suspended);
  }

  @Post(':id/revert-to-draft')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('content.manage')
  @ApiOkResponse({ type: AdminDestinationSummaryDto })
  revertToDraft(@Param('id') id: string): Promise<AdminDestinationSummaryDto> {
    return this.destinations.setStatus(id, PublishStatus.Draft);
  }
}
