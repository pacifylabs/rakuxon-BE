import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import { PublishStatus } from '../../../contract/enums';
import type { TestimonialPlacement } from '../entities/testimonial.entity';

const PLACEMENTS: TestimonialPlacement[] = ['home', 'students'];

/* -------------------------------------------------------------- public */

export class ListTestimonialsQueryDto {
  @ApiPropertyOptional({ enum: PLACEMENTS })
  @IsOptional()
  @IsIn(PLACEMENTS)
  placement?: TestimonialPlacement;

  @ApiPropertyOptional({ default: 6, minimum: 1, maximum: 24 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(24)
  limit?: number;
}

export class TestimonialDto {
  @ApiProperty() id!: string;
  @ApiProperty() quote!: string;
  @ApiProperty() authorName!: string;
  @ApiProperty() detail!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) photoUrl!: string | null;
}

/* --------------------------------------------------------------- admin */

export class ListAdminTestimonialsQueryDto {
  @ApiPropertyOptional({ enum: PublishStatus, enumName: 'PublishStatus' })
  @IsOptional()
  @IsEnum(PublishStatus)
  status?: PublishStatus;

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

export class AdminTestimonialSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() authorName!: string;
  @ApiProperty() detail!: string;
  @ApiProperty() hasPhoto!: boolean;
  @ApiProperty({ enum: PublishStatus, enumName: 'PublishStatus' }) status!: PublishStatus;
}

export class AdminTestimonialListDto {
  @ApiProperty({ type: [AdminTestimonialSummaryDto] }) items!: AdminTestimonialSummaryDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageCount!: number;
}

export class AdminTestimonialDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() quote!: string;
  @ApiProperty() authorName!: string;
  @ApiProperty() detail!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) photoUrl!: string | null;
  @ApiProperty() consentGiven!: boolean;
  @ApiProperty({ type: [String], enum: PLACEMENTS }) placement!: TestimonialPlacement[];
  @ApiProperty({ enum: PublishStatus, enumName: 'PublishStatus' }) status!: PublishStatus;
  @ApiProperty() displayOrder!: number;
}

export class UpdateTestimonialDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() quote?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() authorName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() detail?: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  photoUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() consentGiven?: boolean;
  @ApiPropertyOptional({ type: [String], enum: PLACEMENTS })
  @IsOptional()
  @IsArray()
  @IsIn(PLACEMENTS, { each: true })
  placement?: TestimonialPlacement[];
  @ApiPropertyOptional() @IsOptional() @IsInt() displayOrder?: number;
}

export class CreateTestimonialDto {
  @ApiProperty() @IsString() @IsNotEmpty() quote!: string;
  @ApiProperty() @IsString() @IsNotEmpty() authorName!: string;
  @ApiProperty() @IsString() @IsNotEmpty() detail!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() photoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() consentGiven?: boolean;
  @ApiPropertyOptional({ type: [String], enum: PLACEMENTS })
  @IsOptional()
  @IsArray()
  @IsIn(PLACEMENTS, { each: true })
  placement?: TestimonialPlacement[];
  @ApiPropertyOptional() @IsOptional() @IsInt() displayOrder?: number;
}
