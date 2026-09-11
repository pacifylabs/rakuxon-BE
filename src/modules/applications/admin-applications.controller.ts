import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { ApplicationWithGates } from './applications.service';
import { ApplicationsService } from './applications.service';
import {
  AdminApplicationDetailDto,
  AdminApplicationListDto,
  ListAdminApplicationsQueryDto,
} from './dto/admin-application.dto';
import { AdminJwtAuthGuard } from '../../common/auth/admin-jwt-auth.guard';
import { Public } from '../../common/auth/public.decorator';
import { PermissionGuard } from '../../common/rbac/permission.guard';
import { RequirePermission } from '../../common/rbac/require-permission.decorator';

/**
 * Read-only oversight across every tenant — no mutating routes exist here.
 * Review/decision workflow is out of scope; see ApplicationStatus's own doc
 * comment. @Public() opts every route out of the global, users-table
 * JwtAuthGuard; AdminJwtAuthGuard + PermissionGuard do the real auth here.
 */
@ApiTags('admin-applications')
@Controller('admin/applications')
@Public()
@UseGuards(AdminJwtAuthGuard, PermissionGuard)
@ApiBearerAuth('admin-access-token')
@RequirePermission('applications.view')
export class AdminApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Get()
  @ApiOperation({ summary: 'List applications across every tenant, filterable by status and tenant' })
  @ApiOkResponse({ type: AdminApplicationListDto })
  async list(@Query() query: ListAdminApplicationsQueryDto): Promise<AdminApplicationListDto> {
    const { items, total, page, pageCount } = await this.applications.listAdmin(query);
    return { items: await this.applications.enrichSummaries(items), total, page, pageCount };
  }

  @Get(':id')
  @ApiOperation({ summary: 'One application, with its document-attachment gates' })
  @ApiOkResponse({ type: AdminApplicationDetailDto })
  @ApiNotFoundResponse({ description: 'No application with that id.' })
  async get(@Param('id') id: string): Promise<AdminApplicationDetailDto> {
    const entry = await this.applications.getAdmin(id);
    return this.toDetail(entry);
  }

  private async toDetail(entry: ApplicationWithGates): Promise<AdminApplicationDetailDto> {
    const [summary] = await this.applications.enrichSummaries([entry.application]);
    return {
      ...summary!,
      attachedDocumentIds: entry.attachedDocumentIds,
      missingDocumentTypes: entry.missingDocumentTypes,
      readyToSubmit: entry.readyToSubmit,
    };
  }
}
