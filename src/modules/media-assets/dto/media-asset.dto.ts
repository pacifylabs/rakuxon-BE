import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { MediaAssetCategory } from '../../../contract/enums';

export class ListMediaAssetsQueryDto {
  @ApiPropertyOptional({ enum: MediaAssetCategory, enumName: 'MediaAssetCategory' })
  @IsOptional()
  @IsEnum(MediaAssetCategory)
  category?: MediaAssetCategory;

  @ApiPropertyOptional({ description: 'Free text over the title and description.' })
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

export class MediaAssetDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ enum: MediaAssetCategory, enumName: 'MediaAssetCategory' }) category!: MediaAssetCategory;
  @ApiProperty() fileUrl!: string;
  @ApiProperty({ type: String, nullable: true }) mimeType!: string | null;
  @ApiProperty({ type: Number, nullable: true }) bytes!: number | null;
  @ApiProperty({ type: String, nullable: true }) uploadedByAdminName!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}

export class MediaAssetListDto {
  @ApiProperty({ type: [MediaAssetDto] }) items!: MediaAssetDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageCount!: number;
}

/** `fileUrl`/`cloudinaryPublicId` come from a completed `/admin/uploads/signature` upload, not chosen by the caller. */
export class CreateMediaAssetDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) title!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;

  @ApiProperty({ enum: MediaAssetCategory, enumName: 'MediaAssetCategory' })
  @IsEnum(MediaAssetCategory)
  category!: MediaAssetCategory;

  @ApiProperty() @IsString() @IsNotEmpty() fileUrl!: string;

  @ApiProperty() @IsString() @IsNotEmpty() cloudinaryPublicId!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() mimeType?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) bytes?: number;
}

export class UpdateMediaAssetDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) title?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ enum: MediaAssetCategory, enumName: 'MediaAssetCategory' })
  @IsOptional()
  @IsEnum(MediaAssetCategory)
  category?: MediaAssetCategory;
}
