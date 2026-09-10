import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { StudyLevel } from '../../../contract/enums';

const CURRENT_YEAR = new Date().getFullYear();

export class AddressDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  line1?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  line2?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  region?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @ApiProperty({ required: false, example: 'NG' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  countryCode?: string;
}

export class EducationHistoryEntryDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  institutionName!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  qualification!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fieldOfStudy?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1950)
  @Max(CURRENT_YEAR)
  startYear?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1950)
  @Max(CURRENT_YEAR + 10)
  endYear?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  grade?: string;
}

/**
 * Every field optional: a student fills this in over several visits, not one
 * sitting, and a partial save must not be blocked by fields they have not
 * reached yet.
 */
export class UpdateStudentProfileDto {
  @ApiProperty({ required: false, example: '2001-04-12' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiProperty({ required: false, example: 'NG' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  nationality?: string;

  @ApiProperty({ required: false, example: '+2348012345678' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  passportNumber?: string;

  @ApiProperty({ required: false, type: AddressDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;

  @ApiProperty({ required: false, type: [EducationHistoryEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EducationHistoryEntryDto)
  educationHistory?: EducationHistoryEntryDto[];

  @ApiProperty({ required: false, enum: StudyLevel, enumName: 'StudyLevel' })
  @IsOptional()
  @IsEnum(StudyLevel)
  intendedStudyLevel?: StudyLevel;

  @ApiProperty({ required: false, example: 'GB' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  intendedCountry?: string;

  @ApiProperty({ required: false, example: '2026-09' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  preferredIntake?: string;
}

export class StudentProfileDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  userId!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  sourceOnboardingLinkId!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date' })
  dateOfBirth!: string | null;

  @ApiProperty({ type: String, nullable: true })
  nationality!: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({ type: String, nullable: true })
  passportNumber!: string | null;

  @ApiProperty({ type: AddressDto })
  address!: AddressDto;

  @ApiProperty({ type: [EducationHistoryEntryDto] })
  educationHistory!: EducationHistoryEntryDto[];

  @ApiProperty({ enum: StudyLevel, enumName: 'StudyLevel', nullable: true })
  intendedStudyLevel!: StudyLevel | null;

  @ApiProperty({ type: String, nullable: true })
  intendedCountry!: string | null;

  @ApiProperty({ type: String, nullable: true })
  preferredIntake!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  profileCompletedAt!: string | null;
}
