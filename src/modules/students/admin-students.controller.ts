import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  AdminStudentDetailDto,
  AdminStudentListDto,
  ListAdminStudentsQueryDto,
  UpdateStudentAdminDto,
} from './dto/admin-student.dto';
import { StudentsService } from './students.service';
import { AdminJwtAuthGuard } from '../../common/auth/admin-jwt-auth.guard';
import { Public } from '../../common/auth/public.decorator';
import { PermissionGuard } from '../../common/rbac/permission.guard';
import { RequirePermission } from '../../common/rbac/require-permission.decorator';

/**
 * `students.view` sees a student's profile — supporting a document review or
 * an application. `students.manage` can also edit it, for a correction
 * phoned in or a document the student cannot upload themselves. Two keys,
 * not one, because viewing another person's identity data and changing it
 * on their behalf are different trust levels.
 */
@ApiTags('admin-students')
@Controller('admin/students')
@Public()
@UseGuards(AdminJwtAuthGuard, PermissionGuard)
@ApiBearerAuth('admin-access-token')
export class AdminStudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  @RequirePermission('students.view')
  @ApiOperation({ summary: 'List students, searchable by name or email' })
  @ApiOkResponse({ type: AdminStudentListDto })
  list(@Query() query: ListAdminStudentsQueryDto): Promise<AdminStudentListDto> {
    return this.students.listAdmin(query);
  }

  @Get(':id')
  @RequirePermission('students.view')
  @ApiOperation({ summary: 'One student, with their full applicant profile' })
  @ApiOkResponse({ type: AdminStudentDetailDto })
  @ApiNotFoundResponse({ description: 'No student with that id.' })
  get(@Param('id') id: string): Promise<AdminStudentDetailDto> {
    return this.students.getAdminDetail(id);
  }

  @Patch(':id')
  @RequirePermission('students.manage')
  @ApiOperation({ summary: "Edit a student's applicant profile on their behalf" })
  @ApiOkResponse({ type: AdminStudentDetailDto })
  @ApiNotFoundResponse({ description: 'No student with that id.' })
  update(@Param('id') id: string, @Body() body: UpdateStudentAdminDto): Promise<AdminStudentDetailDto> {
    return this.students.updateAdmin(id, body);
  }
}
