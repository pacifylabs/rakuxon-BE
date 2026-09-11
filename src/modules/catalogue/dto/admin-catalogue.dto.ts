import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { CampusDto, EnglishTestDto, FaqDto, QualityRatingDto, RequirementGroupDto, ScholarshipDto } from './catalogue-shapes.dto';
import { IntakeDto } from './course.dto';
import { PublishStatus, StudyLevel, StudyMode, TuitionPeriod } from '../../../contract/enums';
import type { Campus, EnglishTest, Faq, Intake, QualityRating, RequirementGroup, Scholarship } from '../entities/shared.types';

/**
 * The moderation-list DTOs below (list/summary/publish-suspend-revert) carry
 * only what that screen needs — not the full detail shape. Full authoring
 * DTOs (`AdminInstitutionDetailDto`, `UpdateInstitutionDto`, etc.) live
 * further down this file, alongside their course/article counterparts.
 */

export class ListAdminInstitutionsQueryDto {
  @ApiPropertyOptional({ enum: PublishStatus, enumName: 'PublishStatus' })
  @IsOptional()
  @IsEnum(PublishStatus)
  status?: PublishStatus;

  @ApiPropertyOptional({ example: 'GB' })
  @IsOptional()
  @Transform(({ value }) => String(value).toUpperCase())
  @IsString()
  @Length(2, 2)
  country?: string;

  @ApiPropertyOptional({ description: 'Free text over the name.' })
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

export class AdminInstitutionSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ example: 'GB' }) countryCode!: string;
  @ApiProperty({ enum: PublishStatus, enumName: 'PublishStatus' }) status!: PublishStatus;
}

export class AdminInstitutionListDto {
  @ApiProperty({ type: [AdminInstitutionSummaryDto] }) items!: AdminInstitutionSummaryDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageCount!: number;
}

export class ListAdminCoursesQueryDto {
  @ApiPropertyOptional({ enum: PublishStatus, enumName: 'PublishStatus' })
  @IsOptional()
  @IsEnum(PublishStatus)
  status?: PublishStatus;

  @ApiPropertyOptional({ example: 'GB' })
  @IsOptional()
  @Transform(({ value }) => String(value).toUpperCase())
  @IsString()
  @Length(2, 2)
  country?: string;

  @ApiPropertyOptional({ enum: StudyLevel, enumName: 'StudyLevel' })
  @IsOptional()
  @IsEnum(StudyLevel)
  level?: StudyLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  institutionSlug?: string;

  @ApiPropertyOptional({ description: 'Free text over the course title and institution name.' })
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

export class AdminCourseSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty() institutionId!: string;
  @ApiProperty() institutionName!: string;
  @ApiProperty() institutionSlug!: string;
  @ApiProperty({ enum: PublishStatus, enumName: 'PublishStatus' }) status!: PublishStatus;
}

export class AdminCourseListDto {
  @ApiProperty({ type: [AdminCourseSummaryDto] }) items!: AdminCourseSummaryDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageCount!: number;
}

export class ListAdminArticlesQueryDto {
  @ApiPropertyOptional({ enum: PublishStatus, enumName: 'PublishStatus' })
  @IsOptional()
  @IsEnum(PublishStatus)
  status?: PublishStatus;

  @ApiPropertyOptional({ description: 'Free text over the title.' })
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

export class AdminArticleSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: PublishStatus, enumName: 'PublishStatus' }) status!: PublishStatus;
}

export class AdminArticleListDto {
  @ApiProperty({ type: [AdminArticleSummaryDto] }) items!: AdminArticleSummaryDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageCount!: number;
}

/**
 * Countries — reference data, not a paginated list (there are ~200 rows).
 * `isDestination` is the "are we serving this country" toggle: it already
 * means the right thing (see the Countries migration's own doc comment), it
 * just had no admin surface until now.
 */
export class AdminCountryDto {
  @ApiProperty({ example: 'GB' }) code!: string;
  @ApiProperty({ example: 'United Kingdom' }) name!: string;
  @ApiProperty() isDestination!: boolean;
  @ApiProperty({ example: '🇬🇧' }) flagEmoji!: string;
}

/* ------------------------------------------------------------- authoring */

/**
 * Full field-level create/update, not moderation. `source`/`sourceUrl`/
 * `retrievedAt` are deliberately absent from both the update and create
 * DTOs below — they are provenance (see `scripts/seed-articles.ts`'s own
 * "Written here, not taken from anywhere" comment for the same principle
 * applied to a script instead of an admin form), set once by whatever
 * created the row and never hand-edited afterwards.
 */
export class AdminArticleDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) excerpt!: string | null;
  @ApiProperty() body!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) heroImageUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, example: 'GB' }) countryCode!: string | null;
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiPropertyOptional({ type: Number, nullable: true }) readMinutes!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) author!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) publishedAt!: string | null;
  @ApiProperty({ enum: PublishStatus, enumName: 'PublishStatus' }) status!: PublishStatus;
  @ApiPropertyOptional({ type: String, nullable: true }) source!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) sourceUrl!: string | null;
}

export class UpdateArticleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() excerpt?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() body?: string;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() heroImageUrl?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, example: 'GB' }) @IsOptional() @IsString() @Length(2, 2) countryCode?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @ApiPropertyOptional({ type: Number, nullable: true }) @IsOptional() @IsInt() @Min(0) readMinutes?: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() author?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' }) @IsOptional() @IsDateString() publishedAt?: string | null;
}

export class CreateArticleDto {
  @ApiProperty() @IsString() @IsNotEmpty() slug!: string;
  @ApiProperty() @IsString() @IsNotEmpty() title!: string;
  @ApiProperty() @IsString() @IsNotEmpty() body!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() excerpt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() heroImageUrl?: string;
  @ApiPropertyOptional({ example: 'GB' }) @IsOptional() @IsString() @Length(2, 2) countryCode?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) readMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() author?: string;
  @ApiPropertyOptional({ type: String, format: 'date-time' }) @IsOptional() @IsDateString() publishedAt?: string;
}

/*
 * Institutions. Deliberately excludes wikidataId/latitude/longitude/
 * enrichedAt/source/sourceUrl/retrievedAt — enrichment-pipeline provenance,
 * same non-editable category as an article's source/sourceUrl (see that
 * DTO's own doc comment).
 */
export class AdminInstitutionDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: [String] }) aka!: string[];
  @ApiProperty() country!: string;
  @ApiProperty({ example: 'GB' }) countryCode!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) city!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) website!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) about!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) logoUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) heroImageUrl!: string | null;
  @ApiProperty({ type: [String] }) highlights!: string[];
  @ApiProperty({ type: [CampusDto] }) campuses!: Campus[];
  @ApiProperty({ type: [RequirementGroupDto] }) requiredDocuments!: RequirementGroup[];
  @ApiProperty({ type: [EnglishTestDto] }) englishTests!: EnglishTest[];
  @ApiProperty({ type: [FaqDto] }) faqs!: Faq[];
  @ApiProperty({ type: [QualityRatingDto] }) qualityRatings!: QualityRating[];
  @ApiPropertyOptional({ type: String, nullable: true }) employability!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) foundedYear!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) studentCount!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) overview!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) overviewSourceUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) motto!: string | null;
  @ApiProperty({ type: [String] }) memberships!: string[];
  @ApiPropertyOptional({ type: String, nullable: true }) tuitionFrom!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) tuitionCurrency!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) upcomingIntake!: string | null;
  @ApiProperty() fastTrackOffer!: boolean;
  @ApiProperty({ enum: PublishStatus, enumName: 'PublishStatus' }) status!: PublishStatus;
}

export class UpdateInstitutionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) aka?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() country?: string;
  @ApiPropertyOptional({ example: 'GB' }) @IsOptional() @IsString() @Length(2, 2) countryCode?: string;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() city?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() website?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() about?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() logoUrl?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() heroImageUrl?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) highlights?: string[];
  @ApiPropertyOptional({ type: [CampusDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CampusDto) campuses?: CampusDto[];
  @ApiPropertyOptional({ type: [RequirementGroupDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RequirementGroupDto) requiredDocuments?: RequirementGroupDto[];
  @ApiPropertyOptional({ type: [EnglishTestDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EnglishTestDto) englishTests?: EnglishTestDto[];
  @ApiPropertyOptional({ type: [FaqDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => FaqDto) faqs?: FaqDto[];
  @ApiPropertyOptional({ type: [QualityRatingDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => QualityRatingDto) qualityRatings?: QualityRatingDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() employability?: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) @IsOptional() @IsInt() foundedYear?: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) @IsOptional() @IsInt() @Min(0) studentCount?: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() overview?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() overviewSourceUrl?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() motto?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) memberships?: string[];
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() tuitionFrom?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, example: 'GBP' }) @IsOptional() @IsString() @Length(3, 3) tuitionCurrency?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() upcomingIntake?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() fastTrackOffer?: boolean;
}

export class CreateInstitutionDto {
  @ApiProperty() @IsString() @IsNotEmpty() slug!: string;
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiProperty() @IsString() @IsNotEmpty() country!: string;
  @ApiProperty({ example: 'GB' }) @IsString() @Length(2, 2) countryCode!: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) aka?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() website?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() about?: string;
}

/*
 * Courses. Same provenance exclusions as institutions/articles
 * (source/sourceUrl/sourceRef/retrievedAt stay pipeline-only).
 */
export class AdminCourseDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() institutionId!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: StudyLevel, enumName: 'StudyLevel' }) level!: StudyLevel;
  @ApiProperty({ type: [String] }) disciplines!: string[];
  @ApiPropertyOptional({ type: Number, nullable: true }) durationMonths!: number | null;
  @ApiProperty({ enum: StudyMode, enumName: 'StudyMode' }) studyMode!: StudyMode;
  @ApiPropertyOptional({ type: String, nullable: true }) campus!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) tuitionAmount!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) tuitionCurrency!: string | null;
  @ApiProperty({ enum: TuitionPeriod, enumName: 'TuitionPeriod' }) tuitionPeriod!: TuitionPeriod;
  @ApiProperty() tuitionIsEstimate!: boolean;
  @ApiProperty() tuitionIsInternational!: boolean;
  @ApiProperty({ type: [IntakeDto] }) intakes!: Intake[];
  @ApiProperty({ type: [RequirementGroupDto] }) entryRequirements!: RequirementGroup[];
  @ApiProperty({ type: [EnglishTestDto] }) englishTests!: EnglishTest[];
  @ApiProperty({ type: [ScholarshipDto] }) scholarships!: Scholarship[];
  @ApiPropertyOptional({ type: String, nullable: true }) overview!: string | null;
  @ApiProperty({ type: [String] }) highlights!: string[];
  @ApiPropertyOptional({ type: String, nullable: true }) careers!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) offerResponseWeeks!: number | null;
  @ApiProperty() fastTrackOffer!: boolean;
  @ApiProperty({ enum: PublishStatus, enumName: 'PublishStatus' }) status!: PublishStatus;
}

export class UpdateCourseDto {
  @ApiPropertyOptional() @IsOptional() @IsString() slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() institutionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional({ enum: StudyLevel, enumName: 'StudyLevel' }) @IsOptional() @IsEnum(StudyLevel) level?: StudyLevel;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) disciplines?: string[];
  @ApiPropertyOptional({ type: Number, nullable: true }) @IsOptional() @IsInt() @Min(0) durationMonths?: number | null;
  @ApiPropertyOptional({ enum: StudyMode, enumName: 'StudyMode' }) @IsOptional() @IsEnum(StudyMode) studyMode?: StudyMode;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() campus?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() tuitionAmount?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, example: 'GBP' }) @IsOptional() @IsString() @Length(3, 3) tuitionCurrency?: string | null;
  @ApiPropertyOptional({ enum: TuitionPeriod, enumName: 'TuitionPeriod' }) @IsOptional() @IsEnum(TuitionPeriod) tuitionPeriod?: TuitionPeriod;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() tuitionIsEstimate?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() tuitionIsInternational?: boolean;
  @ApiPropertyOptional({ type: [IntakeDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => IntakeDto) intakes?: IntakeDto[];
  @ApiPropertyOptional({ type: [RequirementGroupDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RequirementGroupDto) entryRequirements?: RequirementGroupDto[];
  @ApiPropertyOptional({ type: [EnglishTestDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EnglishTestDto) englishTests?: EnglishTestDto[];
  @ApiPropertyOptional({ type: [ScholarshipDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ScholarshipDto) scholarships?: ScholarshipDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() overview?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) highlights?: string[];
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() careers?: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) @IsOptional() @IsInt() @Min(0) offerResponseWeeks?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() fastTrackOffer?: boolean;
}

export class CreateCourseDto {
  @ApiProperty() @IsString() @IsNotEmpty() slug!: string;
  @ApiProperty() @IsString() @IsNotEmpty() institutionId!: string;
  @ApiProperty() @IsString() @IsNotEmpty() title!: string;
  @ApiProperty({ enum: StudyLevel, enumName: 'StudyLevel' }) @IsEnum(StudyLevel) level!: StudyLevel;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) disciplines?: string[];
}
