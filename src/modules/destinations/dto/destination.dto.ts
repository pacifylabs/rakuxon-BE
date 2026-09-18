import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { PublishStatus } from '../../../contract/enums';
import type { DestinationFact } from '../entities/destination.entity';

/* -------------------------------------------------------------- public */

export class DestinationFactDto implements DestinationFact {
  @ApiProperty() @IsString() @IsNotEmpty() label!: string;
  @ApiProperty() @IsString() @IsNotEmpty() value!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() hint?: string;
}

/** The full written guide, for /destinations/[slug]. */
export class DestinationDto {
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty() shortName!: string;
  @ApiProperty({ type: String, nullable: true }) cardImageUrl!: string | null;
  @ApiProperty() cardImageAlt!: string;
  @ApiProperty({ type: String, nullable: true }) heroImageUrl!: string | null;
  @ApiProperty() heroImageAlt!: string;
  @ApiProperty() tagline!: string;
  @ApiProperty() intro!: string;
  @ApiProperty() whyHeading!: string;
  @ApiProperty() why!: string;
  @ApiProperty({ type: [String] }) whyPoints!: string[];
  @ApiProperty({ type: [DestinationFactDto] }) facts!: DestinationFact[];
  @ApiProperty({ type: [String] }) universities!: string[];
  @ApiProperty({ type: [String] }) helpPoints!: string[];
}

/** One row on /destinations — enough for a card, no written-guide fields. */
export class DestinationCardDto {
  @ApiProperty() slug!: string;
  @ApiProperty() shortName!: string;
  @ApiProperty({ type: String, nullable: true }) cardImageUrl!: string | null;
  @ApiProperty() cardImageAlt!: string;
  @ApiProperty() tagline!: string;
}

/* --------------------------------------------------------------- admin */

export class ListAdminDestinationsQueryDto {
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

export class AdminDestinationSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() shortName!: string;
  @ApiProperty() tagline!: string;
  @ApiProperty({ enum: PublishStatus, enumName: 'PublishStatus' }) status!: PublishStatus;
  @ApiProperty() displayOrder!: number;
}

export class AdminDestinationListDto {
  @ApiProperty({ type: [AdminDestinationSummaryDto] }) items!: AdminDestinationSummaryDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageCount!: number;
}

export class AdminDestinationDetailDto extends DestinationDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ enum: PublishStatus, enumName: 'PublishStatus' }) status!: PublishStatus;
  @ApiProperty() displayOrder!: number;
}

export class UpdateDestinationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() shortName?: string;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() cardImageUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() cardImageAlt?: string;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() heroImageUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() heroImageAlt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() tagline?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() intro?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() whyHeading?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() why?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  whyPoints?: string[];

  @ApiPropertyOptional({ type: [DestinationFactDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DestinationFactDto)
  facts?: DestinationFactDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  universities?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  helpPoints?: string[];

  @ApiPropertyOptional() @IsOptional() @IsInt() displayOrder?: number;
}

export class CreateDestinationDto {
  @ApiProperty() @IsString() @IsNotEmpty() slug!: string;
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiProperty() @IsString() @IsNotEmpty() shortName!: string;
  @ApiProperty() @IsString() @IsNotEmpty() tagline!: string;
  @ApiProperty() @IsString() @IsNotEmpty() intro!: string;
  @ApiProperty() @IsString() @IsNotEmpty() whyHeading!: string;
  @ApiProperty() @IsString() @IsNotEmpty() why!: string;
}
