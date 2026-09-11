import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { AddressDto, EducationHistoryEntryDto } from './student.dto';
import { StudyLevel } from '../../../contract/enums';

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

/** One row on the admin students list — enough to find and open a student. */
export class AdminStudentSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) userId!: string;
  @ApiProperty() email!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ type: String, format: 'uuid' }) tenantId!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) profileCompletedAt!: string | null;
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
 * Every field optional, same as the student's own `UpdateStudentProfileDto` —
 * an admin fills this in on a student's behalf (they cannot upload their own
 * documents, or need a correction phoned in), the same partial-save contract
 * the student's own profile screen already has.
 */
export class UpdateStudentAdminDto {
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
