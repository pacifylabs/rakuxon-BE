import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
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
 * Oversight across every tenant, plus the two actions an admin can take on
 * a student's behalf: attaching an admin-uploaded document to a specific
 * draft application, and (elsewhere in this controller, once added)
 * assignment. Full review/decision workflow is still out of scope; see
 * ApplicationStatus's own doc comment. @Public() opts every route out of
 * the global, users-table JwtAuthGuard; AdminJwtAuthGuard + PermissionGuard
 * do the real auth here. The class-level `applications.view` requirement is
 * overridden per-route to `applications.manage` for the two mutations below
 * — `PermissionGuard` reads handler metadata before class metadata, so a
 * view-only admin cannot reach them.
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

  @Post(':id/documents/:documentId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('applications.manage')
  @ApiOperation({
    summary: "Attach an admin-uploaded document to a student's draft application",
    description:
      'The document must already belong to this application\'s own student and be fully uploaded — ' +
      'see AdminDocumentRow/confirmUploadForAdmin for how it gets there.',
  })
  @ApiOkResponse({ type: AdminApplicationDetailDto })
  async attachDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ): Promise<AdminApplicationDetailDto> {
    return this.toDetail(await this.applications.attachDocumentAdmin(id, documentId));
  }

  @Delete(':id/documents/:documentId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('applications.manage')
  @ApiOperation({ summary: "Detach a document from a student's draft application" })
  @ApiOkResponse({ type: AdminApplicationDetailDto })
  async detachDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ): Promise<AdminApplicationDetailDto> {
    return this.toDetail(await this.applications.detachDocumentAdmin(id, documentId));
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
