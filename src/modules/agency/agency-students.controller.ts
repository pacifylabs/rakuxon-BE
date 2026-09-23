import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AgencyService } from './agency.service';
import { AdminStudentDetailDto, AdminStudentListDto, ListAdminStudentsQueryDto } from '../students/dto/admin-student.dto';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/rbac/roles.decorator';
import { AGENCY_ROLES } from '../../contract/enums';
import type { AuthenticatedUser } from '../../common/auth/authenticated-request';

/**
 * The agency's own referred students. Read-only — an agency edits its
 * relationship with a student (staff, invites, referrals), never the
 * applicant profile itself; that stays the student's own or, on their
 * behalf, a platform admin's (`AdminStudentsController`).
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
}
