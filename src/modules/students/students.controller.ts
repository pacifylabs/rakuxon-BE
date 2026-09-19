import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { StudentProfileDto, UpdateStudentProfileDto } from './dto/student.dto';
import { StudentsService } from './students.service';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../contract/enums';
import type { AuthenticatedUser } from '../../common/auth/authenticated-request';

@ApiTags('students')
@ApiBearerAuth('access-token')
@Controller('students')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get('me')
  @Roles(Role.Student)
  @ApiOperation({ summary: "The caller's own applicant profile" })
  @ApiOkResponse({ type: StudentProfileDto })
  async getOwnProfile(@CurrentUser() user: AuthenticatedUser): Promise<StudentProfileDto> {
    return this.toDto(await this.students.getOwnProfile(user));
  }

  @Patch('me')
  @Roles(Role.Student)
  @ApiOperation({
    summary: "Update the caller's own applicant profile",
    description:
      'Every field is optional — a partial save is expected. `profileCompletedAt` is set once ' +
      'every field admission processing needs is present, and stays set afterwards.',
  })
  @ApiOkResponse({ type: StudentProfileDto })
  async updateOwnProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateStudentProfileDto,
  ): Promise<StudentProfileDto> {
    return this.toDto(await this.students.updateOwnProfile(user, dto));
  }

  @Post('me/heartbeat')
  @Roles(Role.Student)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Record that the caller is currently active',
    description: 'Polled by the frontend every ~60s while a session is open — drives the "online" indicator in messaging.',
  })
  @ApiNoContentResponse()
  async heartbeat(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.students.heartbeat(user);
  }

  private toDto(student: Awaited<ReturnType<StudentsService['getOwnProfile']>>): StudentProfileDto {
    return {
      id: student.id,
      userId: student.userId,
      sourceOnboardingLinkId: student.sourceOnboardingLinkId,
      dateOfBirth: student.dateOfBirth,
      nationality: student.nationality,
      phone: student.phone,
      passportNumber: student.passportNumber,
      address: student.address,
      educationHistory: student.educationHistory,
      intendedStudyLevel: student.intendedStudyLevel,
      intendedCountry: student.intendedCountry,
      preferredIntake: student.preferredIntake,
      profileCompletedAt: student.profileCompletedAt?.toISOString() ?? null,
    };
  }
}
