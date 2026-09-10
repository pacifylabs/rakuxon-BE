import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

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
