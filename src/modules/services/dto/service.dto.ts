import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { PublishStatus } from '../../../contract/enums';
import type { ServiceFaq, ServiceStrand } from '../entities/service.entity';

const STRANDS: ServiceStrand[] = ['education', 'travel'];

class ServiceFaqDto implements ServiceFaq {
  @ApiProperty() @IsString() @IsNotEmpty() question!: string;
  @ApiProperty() @IsString() @IsNotEmpty() answer!: string;
}

/* -------------------------------------------------------------- public */

export class ServiceDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() iconName!: string;
  @ApiProperty() title!: string;
  @ApiProperty() summary!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ enum: STRANDS }) strand!: ServiceStrand;
  @ApiProperty() metaTitle!: string;
  @ApiProperty() metaDescription!: string;
  @ApiProperty({ type: [String] }) whatsIncluded!: string[];
  @ApiProperty({ type: [ServiceFaqDto] }) faqs!: ServiceFaq[];
  @ApiPropertyOptional({ type: [String], nullable: true }) relatedArticleSlugs!: string[] | null;
}

/* --------------------------------------------------------------- admin */

export class ListAdminServicesQueryDto {
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

export class AdminServiceSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: STRANDS }) strand!: ServiceStrand;
  @ApiProperty({ enum: PublishStatus, enumName: 'PublishStatus' }) status!: PublishStatus;
}

export class AdminServiceListDto {
  @ApiProperty({ type: [AdminServiceSummaryDto] }) items!: AdminServiceSummaryDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageCount!: number;
}

export class AdminServiceDetailDto extends ServiceDto {
  @ApiProperty({ enum: PublishStatus, enumName: 'PublishStatus' }) status!: PublishStatus;
  @ApiProperty() displayOrder!: number;
}

export class UpdateServiceDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() iconName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() summary?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() description?: string;
  @ApiPropertyOptional({ enum: STRANDS }) @IsOptional() @IsIn(STRANDS) strand?: ServiceStrand;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() metaTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() metaDescription?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) whatsIncluded?: string[];
  @ApiPropertyOptional({ type: [ServiceFaqDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceFaqDto)
  faqs?: ServiceFaq[];
  @ApiPropertyOptional({ type: [String], nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  relatedArticleSlugs?: string[] | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() displayOrder?: number;
}

export class CreateServiceDto {
  @ApiProperty() @IsString() @IsNotEmpty() slug!: string;
  @ApiProperty() @IsString() @IsNotEmpty() iconName!: string;
  @ApiProperty() @IsString() @IsNotEmpty() title!: string;
  @ApiProperty() @IsString() @IsNotEmpty() summary!: string;
  @ApiProperty() @IsString() @IsNotEmpty() description!: string;
  @ApiProperty({ enum: STRANDS }) @IsIn(STRANDS) strand!: ServiceStrand;
  @ApiProperty() @IsString() @IsNotEmpty() metaTitle!: string;
  @ApiProperty() @IsString() @IsNotEmpty() metaDescription!: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  whatsIncluded?: string[];
  @ApiPropertyOptional({ type: [ServiceFaqDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceFaqDto)
  faqs?: ServiceFaq[];
  @ApiPropertyOptional({ type: [String], nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  relatedArticleSlugs?: string[] | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() displayOrder?: number;
}
