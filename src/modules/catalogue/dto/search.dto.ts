import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SearchQueryDto {
  @ApiProperty({ example: 'un', description: 'What the visitor has typed so far.' })
  @IsString()
  @MaxLength(120)
  query!: string;

  @ApiPropertyOptional({ default: 7, minimum: 1, maximum: 20 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

/**
 * One piece of a result's name, marked as matching or not.
 *
 * Segments rather than a pre-marked HTML string. Returning "<em>Uni</em>versity"
 * forces every consumer to render the field as raw HTML, which turns any
 * imported name containing a tag into stored XSS — and the API cannot know
 * whether a given client escapes it. Segments carry the same information and
 * cannot execute.
 */
export class HighlightSegmentDto {
  @ApiProperty({ example: 'Uni' })
  text!: string;

  @ApiProperty({ example: true, description: 'True where this segment matched the query.' })
  match!: boolean;
}

export class SearchResultDto {
  @ApiProperty({ enum: ['institution', 'course', 'article'] })
  type!: 'institution' | 'course' | 'article';

  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'Route key. /universities/[slug], /courses/[slug], /resources/[slug].' })
  slug!: string;

  @ApiProperty({ example: 'University of Manchester' })
  name!: string;

  @ApiPropertyOptional({ example: 'Manchester, United Kingdom' })
  subtitle?: string;

  @ApiPropertyOptional({ example: 'GB', description: 'ISO 3166-1 alpha-2, for the flag.' })
  countryCode?: string;

  @ApiProperty({ type: [HighlightSegmentDto] })
  highlight!: HighlightSegmentDto[];
}

export class SearchResponseDto {
  @ApiProperty({ type: [SearchResultDto] })
  items!: SearchResultDto[];

  @ApiProperty({ description: 'Total matches before the limit, so the UI can offer "see all".' })
  total!: number;
}
