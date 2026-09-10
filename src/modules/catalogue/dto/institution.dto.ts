import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class ListInstitutionsQueryDto {
  @ApiPropertyOptional({ example: 'GB', description: 'ISO 3166-1 alpha-2.' })
  @IsOptional()
  @Transform(({ value }) => String(value).toUpperCase())
  @IsString()
  @Length(2, 2)
  country?: string;

  @ApiPropertyOptional({ description: 'Free text over name, acronyms and city.' })
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

  @ApiPropertyOptional({ enum: ['name', 'city'], default: 'name' })
  @IsOptional()
  @IsIn(['name', 'city'])
  sort?: 'name' | 'city';
}

export class InstitutionSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: [String], description: 'Acronyms and alternates.' })
  aka!: string[];
  @ApiProperty() country!: string;
  @ApiProperty({ example: 'GB' }) countryCode!: string;
  @ApiPropertyOptional() city?: string;
  @ApiPropertyOptional() website?: string;
  @ApiPropertyOptional({ description: 'Only where licensed; the flag is the fallback.' })
  logoUrl?: string;
  @ApiProperty() fastTrackOffer!: boolean;
  @ApiProperty({ description: 'Published courses at this institution.' })
  courseCount!: number;
}

export class InstitutionListDto {
  @ApiProperty({ type: [InstitutionSummaryDto] }) items!: InstitutionSummaryDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageCount!: number;
}

/** One row of the country menu. */
export class CountryCountDto {
  @ApiProperty({ example: 'GB' }) countryCode!: string;
  @ApiProperty({ example: 'United Kingdom' }) country!: string;
  @ApiProperty({ example: 456 }) institutions!: number;
}

/** One row of the full reference list, for a form dropdown. */
export class CountryDto {
  @ApiProperty({ example: 'GB' }) code!: string;
  @ApiProperty({ example: 'United Kingdom' }) name!: string;
  @ApiProperty({ description: 'Whether the catalogue has universities here.' })
  isDestination!: boolean;
  @ApiProperty({ example: '🇬🇧' }) flagEmoji!: string;
}
