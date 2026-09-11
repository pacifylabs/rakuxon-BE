import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Length, Max, Min } from 'class-validator';

import { IntakeStatus, StudyLevel, StudyMode, TuitionPeriod } from '../../../contract/enums';
import type { EnglishTest, Intake, RequirementGroup, Scholarship } from '../entities/shared.types';

/**
 * Doubles as both the public response shape (used as-is, decorators are
 * inert for serialization) and the admin authoring input shape (the
 * `@Is*` decorators below are what validate a PATCH's `intakes` array) —
 * one class rather than two, since the fields are identical either way.
 */
export class IntakeDto implements Intake {
  @ApiProperty({ example: 'Sep' }) @IsString() @IsNotEmpty() month!: string;
  @ApiProperty({ example: 2026 }) @IsInt() year!: number;
  @ApiPropertyOptional({ type: String, format: 'date' }) @IsOptional() @IsString() applicationDeadline?: string;
  @ApiProperty({ enum: IntakeStatus, enumName: 'IntakeStatus' }) @IsIn(Object.values(IntakeStatus)) status!: IntakeStatus;
}

export class ListCoursesQueryDto {
  @ApiPropertyOptional({ example: 'GB', description: 'ISO 3166-1 alpha-2, the institution\'s.' })
  @IsOptional()
  @Transform(({ value }) => String(value).toUpperCase())
  @IsString()
  @Length(2, 2)
  country?: string;

  @ApiPropertyOptional({ description: 'Free text over the course title and institution name.' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: StudyLevel, enumName: 'StudyLevel' })
  @IsOptional()
  @IsEnum(StudyLevel)
  level?: StudyLevel;

  @ApiPropertyOptional({ description: 'Matched against the discipline tags.' })
  @IsOptional()
  @IsString()
  discipline?: string;

  @ApiPropertyOptional({ description: 'Restrict to one institution.' })
  @IsOptional()
  @IsString()
  institutionSlug?: string;

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

/** A course, joined with just enough of its institution to render a card. */
export class CourseSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: StudyLevel, enumName: 'StudyLevel' }) level!: StudyLevel;
  @ApiProperty({ enum: StudyMode, enumName: 'StudyMode' }) studyMode!: StudyMode;
  @ApiProperty({ type: [String] }) disciplines!: string[];
  @ApiPropertyOptional({ description: 'Absent where the source does not state it; never estimated.' })
  durationMonths?: number;
  @ApiPropertyOptional({ description: 'Null where a fee has not been recorded.', example: '18500.00' })
  tuitionAmount?: string;
  @ApiPropertyOptional({ example: 'GBP' }) tuitionCurrency?: string;
  @ApiProperty({ description: 'The source calls the fee approximate, so it must be shown as one.' })
  tuitionIsEstimate!: boolean;
  @ApiProperty() fastTrackOffer!: boolean;
  @ApiProperty({ type: [IntakeDto] }) intakes!: Intake[];

  @ApiProperty() institutionId!: string;
  @ApiProperty() institutionName!: string;
  @ApiProperty() institutionSlug!: string;
  @ApiProperty() country!: string;
  @ApiProperty({ example: 'GB' }) countryCode!: string;
}

export class CourseListDto {
  @ApiProperty({ type: [CourseSummaryDto] }) items!: CourseSummaryDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageCount!: number;
}

/** The whole course. Imported courses leave most of this empty; the page hides what is. */
export class CourseDetailDto extends CourseSummaryDto {
  @ApiPropertyOptional() overview?: string;
  @ApiProperty({ type: [String] }) highlights!: string[];
  @ApiPropertyOptional() careers?: string;
  @ApiPropertyOptional() campus?: string;
  @ApiProperty({ enum: TuitionPeriod, enumName: 'TuitionPeriod' }) tuitionPeriod!: TuitionPeriod;
  @ApiProperty({ type: 'array', items: { type: 'object' } }) entryRequirements!: RequirementGroup[];
  @ApiProperty({ type: 'array', items: { type: 'object' } }) englishTests!: EnglishTest[];
  @ApiProperty({ type: 'array', items: { type: 'object' } }) scholarships!: Scholarship[];
  @ApiPropertyOptional() offerResponseWeeks?: number;
}
