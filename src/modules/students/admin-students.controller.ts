import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import {
  AdminCreateStudentDto,
  AdminStudentDetailDto,
  AdminStudentListDto,
  ListAdminStudentsQueryDto,
  SetStudentPasswordDto,
  UpdateStudentAdminDto,
} from './dto/admin-student.dto';
import { StudentsService } from './students.service';
import { AdminJwtAuthGuard } from '../../common/auth/admin-jwt-auth.guard';
import { Public } from '../../common/auth/public.decorator';
import { AuditResource } from '../audit-log/audit-resource.decorator';
import { AuditLogService } from '../audit-log/audit-log.service';
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
  constructor(
    private readonly students: StudentsService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Post()
  @RequirePermission('students.manage')
  @AuditResource('student')
  @ApiOperation({
    summary: 'Create a student on their behalf',
    description:
      'For students a partner already has, manually or through another system. The creating ' +
      'admin sets a real password directly; the student can change it via the reset flow like ' +
      'anyone else. No self-verification is needed — the admin is vouching for the account.',
  })
  @ApiCreatedResponse({ type: AdminStudentDetailDto })
  @ApiForbiddenResponse({ description: 'Missing the students.manage permission.' })
  create(@Body() dto: AdminCreateStudentDto): Promise<AdminStudentDetailDto> {
    return this.students.createByAdmin(dto);
  }

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

  @Get(':id/audit-log')
  @RequirePermission('students.view')
  @ApiOperation({ summary: "This student's own history — every admin and student action on them" })
  async auditLogFor(@Param('id') id: string) {
    return { items: await this.auditLog.listForResource('student', id) };
  }

  @Patch(':id')
  @RequirePermission('students.manage')
  @AuditResource('student')
  @ApiOperation({ summary: "Edit a student's applicant profile on their behalf" })
  @ApiOkResponse({ type: AdminStudentDetailDto })
  @ApiNotFoundResponse({ description: 'No student with that id.' })
  update(@Param('id') id: string, @Body() body: UpdateStudentAdminDto): Promise<AdminStudentDetailDto> {
    return this.students.updateAdmin(id, body);
  }

  @Post(':id/set-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('students.manage')
  @AuditResource('student')
  @ApiOperation({ summary: "Set a student's password directly — a reset done for them, not by them." })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'No student with that id.' })
  setPassword(@Param('id') id: string, @Body() body: SetStudentPasswordDto): Promise<void> {
    return this.students.setPassword(id, body.password);
  }
}
