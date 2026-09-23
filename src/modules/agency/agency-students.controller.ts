import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AgencyService } from './agency.service';
import { CreateAgencyStudentDto } from './dto/agency.dto';
import { DocumentDto } from '../documents/dto/document.dto';
import { AdminStudentDetailDto, AdminStudentListDto, ListAdminStudentsQueryDto } from '../students/dto/admin-student.dto';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/rbac/roles.decorator';
import { AGENCY_ROLES } from '../../contract/enums';
import type { AuthenticatedUser } from '../../common/auth/authenticated-request';

/**
 * The agency's own referred students. Mostly read-only — an agency can
 * bring a student in directly (`POST`), the same way an invite link would,
 * but cannot edit the applicant profile itself once it exists; that stays
 * the student's own or, on their behalf, a platform admin's
 * (`AdminStudentsController`).
 */
@ApiTags('agency-students')
@ApiBearerAuth('access-token')
@Controller('agency/students')
@Roles(...AGENCY_ROLES)
export class AgencyStudentsController {
  constructor(private readonly agency: AgencyService) {}

  @Get()
  @ApiOperation({ summary: "The caller's own agency's students" })
  @ApiOkResponse({ type: AdminStudentListDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAdminStudentsQueryDto,
  ): Promise<AdminStudentListDto> {
    return this.agency.listStudents(user.tenantId!, query);
  }

  @Post()
  @ApiOperation({ summary: 'Bring a student directly into the caller\'s own agency' })
  @ApiCreatedResponse({ type: AdminStudentDetailDto })
  @ApiConflictResponse({ description: 'That email is already registered in this agency.' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAgencyStudentDto,
  ): Promise<AdminStudentDetailDto> {
    return this.agency.createStudent(user.tenantId!, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of the caller\'s own agency\'s students' })
  @ApiOkResponse({ type: AdminStudentDetailDto })
  @ApiNotFoundResponse({ description: 'No student with that id.' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<AdminStudentDetailDto> {
    return this.agency.getStudent(user.tenantId!, id);
  }

  @Get(':id/documents')
  @ApiOperation({ summary: "One of the caller's own agency's students' uploaded documents" })
  @ApiOkResponse({ type: [DocumentDto] })
  @ApiNotFoundResponse({ description: 'No student with that id.' })
  listDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<DocumentDto[]> {
    return this.agency.listStudentDocuments(user.tenantId!, id);
  }
}
