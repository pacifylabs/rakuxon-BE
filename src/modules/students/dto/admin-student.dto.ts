import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { AddressDto, EducationHistoryEntryDto } from './student.dto';
import { StudyLevel } from '../../../contract/enums';

const PASSWORD_MIN = 8;

export class ListAdminStudentsQueryDto {
  @ApiPropertyOptional({ description: 'Free text over the student’s name or email.' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 24, minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** One row on the admin students list — enough to find and open a student, and to gauge their engagement at a glance. */
export class AdminStudentSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) userId!: string;
  @ApiProperty() email!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ type: String, format: 'uuid' }) tenantId!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) profileCompletedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty() applicationsCount!: number;
}

export class AdminStudentListDto {
  @ApiProperty({ type: [AdminStudentSummaryDto] }) items!: AdminStudentSummaryDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageCount!: number;
}

/**
 * The full applicant profile, as an admin needs it to review or assist a
 * student — the same fields `GET /students/me` returns, plus the identity
 * fields (email, name) that route joins in from `users` rather than
 * duplicating onto `Student` itself.
 */
export class AdminStudentDetailDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) userId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) tenantId!: string;
  @ApiProperty() email!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date' }) dateOfBirth!: string | null;
  @ApiProperty({ type: String, nullable: true }) nationality!: string | null;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty({ type: String, nullable: true }) passportNumber!: string | null;
  @ApiProperty({ type: AddressDto }) address!: AddressDto;
  @ApiProperty({ type: [EducationHistoryEntryDto] }) educationHistory!: EducationHistoryEntryDto[];
  @ApiProperty({ enum: StudyLevel, enumName: 'StudyLevel', nullable: true }) intendedStudyLevel!: StudyLevel | null;
  @ApiProperty({ type: String, nullable: true }) intendedCountry!: string | null;
  @ApiProperty({ type: String, nullable: true }) preferredIntake!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) profileCompletedAt!: string | null;
}

/**
 * What an admin sets up directly for a student the partner already has
 * elsewhere — a real password, not an auto-generated one the student would
 * never see. `tenantId` defaults to the house tenant (the same one direct,
 * non-agency signups use) when omitted, so creating a student with no
 * partner in mind still works.
 */
export class AdminCreateStudentDto {
  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Ada' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  firstName!: string;

  @ApiProperty({ example: 'Lovelace' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  lastName!: string;

  @ApiProperty({
    example: 'correct-horse-battery',
    minLength: PASSWORD_MIN,
    description:
      'Set directly by the creating admin. The student can change it via the password-reset flow.',
  })
  @IsString()
  @MinLength(PASSWORD_MIN)
  @MaxLength(256)
  password!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'The partner this student belongs to. Defaults to the house tenant.',
  })
  @IsOptional()
  @IsUUID()
  tenantId?: string;
}

export class SetStudentPasswordDto {
  @ApiProperty({ example: 'correct-horse-battery', minLength: PASSWORD_MIN })
  @IsString()
  @MinLength(PASSWORD_MIN)
  @MaxLength(256)
  password!: string;
}

/**
 * Every field optional, same as the student's own `UpdateStudentProfileDto` —
 * an admin fills this in on a student's behalf (they cannot upload their own
 * documents, or need a correction phoned in), the same partial-save contract
 * the student's own profile screen already has. `email`/`firstName`/
 * `lastName` edit the linked account, not the applicant profile, but travel
 * together in one form since that is how the admin screen presents them.
 */
export class UpdateStudentAdminDto {
  @ApiPropertyOptional({ example: 'ada@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Ada' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Lovelace' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  lastName?: string;

  @ApiPropertyOptional({ example: '2001-04-12' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 'NG' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  nationality?: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  passportNumber?: string;

  @ApiPropertyOptional({ type: AddressDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;

  @ApiPropertyOptional({ type: [EducationHistoryEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EducationHistoryEntryDto)
  educationHistory?: EducationHistoryEntryDto[];

  @ApiPropertyOptional({ enum: StudyLevel, enumName: 'StudyLevel' })
  @IsOptional()
  @IsEnum(StudyLevel)
  intendedStudyLevel?: StudyLevel;

  @ApiPropertyOptional({ example: 'GB' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  intendedCountry?: string;

  @ApiPropertyOptional({ example: '2026-09' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  preferredIntake?: string;
}
