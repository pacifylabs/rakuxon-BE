import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

import { IntakeStatus, StudyLevel, StudyMode } from '../../../contract/enums';
import type { Intake } from '../entities/shared.types';

export class IntakeDto implements Intake {
  @ApiProperty({ example: 'Sep' }) month!: string;
  @ApiProperty({ example: 2026 }) year!: number;
  @ApiPropertyOptional({ type: String, format: 'date' }) applicationDeadline?: string;
  @ApiProperty({ enum: IntakeStatus, enumName: 'IntakeStatus' }) status!: IntakeStatus;
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
  @ApiProperty() durationMonths!: number;
  @ApiPropertyOptional({ description: 'Null where a fee has not been recorded.', example: '18500.00' })
  tuitionAmount?: string;
  @ApiPropertyOptional({ example: 'GBP' }) tuitionCurrency?: string;
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
