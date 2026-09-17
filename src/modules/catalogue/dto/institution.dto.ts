import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

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

  @ApiPropertyOptional({ description: 'Only institutions featured on the homepage, in their set order.' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  featured?: boolean;

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
  @ApiPropertyOptional({ description: 'From Wikidata. Absent for institutions it does not cover.' })
  heroImageUrl?: string;
  @ApiPropertyOptional({ description: 'From Wikidata. Absent for institutions it does not cover.' })
  foundedYear?: number;
  @ApiPropertyOptional() studentCount?: number;
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

/**
 * One value of a course filter, with how many courses carry it.
 *
 * The count travels with the value because a filter that leads to an empty
 * list is worse than no filter: "Archaeology (47)" is a decision a visitor can
 * make, "Archaeology" is a guess they find out about after the click.
 */
export class CourseFacetDto {
  @ApiProperty({ example: 'business' }) value!: string;
  @ApiProperty({ example: 63 }) count!: number;
}

/** One row of the country menu. */
export class CountryCountDto {
  @ApiProperty({ example: 'GB' }) countryCode!: string;
  @ApiProperty({ example: 'United Kingdom' }) country!: string;
  @ApiProperty({ example: 456 }) institutions!: number;
  @ApiPropertyOptional({ example: '🇬🇧', description: 'Only set when reading the featured list.' })
  flagEmoji?: string;
}

/** One row of the full reference list, for a form dropdown. */
export class CountryDto {
  @ApiProperty({ example: 'GB' }) code!: string;
  @ApiProperty({ example: 'United Kingdom' }) name!: string;
  @ApiProperty({ description: 'Whether the catalogue has universities here.' })
  isDestination!: boolean;
  @ApiProperty({ example: '🇬🇧' }) flagEmoji!: string;
}
