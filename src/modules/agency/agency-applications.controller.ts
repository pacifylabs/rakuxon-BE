import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AgencyService } from './agency.service';
import {
  AdminApplicationDetailDto,
  AdminApplicationListDto,
  ListAdminApplicationsQueryDto,
} from '../applications/dto/admin-application.dto';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/rbac/roles.decorator';
import { AGENCY_ROLES } from '../../contract/enums';
import type { AuthenticatedUser } from '../../common/auth/authenticated-request';

/**
 * The agency's own students' applications. Attaching/detaching an
 * already-uploaded document is the one write this controller allows —
 * approving or rejecting a document, and the review decision it feeds,
 * stay a platform-admin action (`AdminApplicationsController` /
 * `AdminDocumentsController`): an agency should not be able to wave its
 * own students through review.
 */
@ApiTags('agency-applications')
@ApiBearerAuth('access-token')
@Controller('agency/applications')
@Roles(...AGENCY_ROLES)
export class AgencyApplicationsController {
  constructor(private readonly agency: AgencyService) {}

  @Get()
  @ApiOperation({ summary: "The caller's own agency's applications" })
  @ApiOkResponse({ type: AdminApplicationListDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAdminApplicationsQueryDto,
  ): Promise<AdminApplicationListDto> {
    return this.agency.listApplications(user.tenantId!, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of the caller\'s own agency\'s applications' })
  @ApiOkResponse({ type: AdminApplicationDetailDto })
  @ApiNotFoundResponse({ description: 'No application with that id.' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<AdminApplicationDetailDto> {
    return this.agency.getApplication(user.tenantId!, id);
  }

  @Post(':id/documents/:documentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Attach one of the student's already-uploaded documents to their application" })
  @ApiOkResponse({ type: AdminApplicationDetailDto })
  attachDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ): Promise<AdminApplicationDetailDto> {
    return this.agency.attachDocument(user.tenantId!, id, documentId);
  }

  @Delete(':id/documents/:documentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Detach a document from the application' })
  @ApiOkResponse({ type: AdminApplicationDetailDto })
  detachDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ): Promise<AdminApplicationDetailDto> {
    return this.agency.detachDocument(user.tenantId!, id, documentId);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Submit a draft application on the student's behalf" })
  @ApiOkResponse({ type: AdminApplicationDetailDto })
  @ApiConflictResponse({ description: 'This application has already been submitted.' })
  @ApiBadRequestResponse({ description: 'The profile is incomplete or a required document is missing.' })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<AdminApplicationDetailDto> {
    return this.agency.submitApplication(user.tenantId!, id);
  }
}
