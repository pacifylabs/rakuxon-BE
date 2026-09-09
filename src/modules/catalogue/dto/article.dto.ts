import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class ListArticlesQueryDto {
  @ApiPropertyOptional({ example: 'GB', description: 'ISO 3166-1 alpha-2.' })
  @IsOptional()
  @Transform(({ value }) => String(value).toUpperCase())
  @IsString()
  @Length(2, 2)
  country?: string;

  @ApiPropertyOptional({ description: 'Single tag, matched exactly.' })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 12, minimum: 1, maximum: 50 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

/**
 * A card. Deliberately without `body`.
 *
 * A listing of twelve articles that each carry their full markdown is a
 * several-hundred-kilobyte response to render twelve headlines, and the body
 * is the one field a card never shows.
 */
export class ArticleSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional() excerpt?: string;
  @ApiPropertyOptional() heroImageUrl?: string;
  @ApiPropertyOptional({ example: 'GB' }) countryCode?: string;
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiPropertyOptional() readMinutes?: number;
  @ApiPropertyOptional() author?: string;
  @ApiPropertyOptional({ type: String, format: 'date-time' }) publishedAt?: string;
}

export class ArticleListDto {
  @ApiProperty({ type: [ArticleSummaryDto] }) items!: ArticleSummaryDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageCount!: number;
  @ApiProperty({ type: [String], description: 'Every tag in the published set.' })
  tags!: string[];
}

export class ArticleDetailDto extends ArticleSummaryDto {
  @ApiProperty({ description: 'Markdown. Never raw HTML.' }) body!: string;
  @ApiPropertyOptional() source?: string;
  @ApiPropertyOptional() sourceUrl?: string;
}
