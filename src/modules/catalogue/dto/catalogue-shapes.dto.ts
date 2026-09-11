import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

/**
 * Validation classes for the jsonb array shapes shared across institutions
 * and courses (`src/modules/catalogue/entities/shared.types.ts`). One class
 * per shape, field-for-field — reused by both entities' create/update DTOs
 * rather than restated, since `EnglishTest` and the requirement-group shape
 * are identical on both. `IntakeDto` is deliberately not redefined here — a
 * class of that name already exists in `dto/course.dto.ts` for the public
 * course response shape, and a second one would collide in the generated
 * OpenAPI schema (both are named `IntakeDto`); the course authoring DTOs
 * import that existing class instead.
 */

export class RequirementItemDto {
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiPropertyOptional({ type: Number }) @IsOptional() @IsInt() @Min(0) minPercentage?: number;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() note?: string;
}

export class RequirementGroupDto {
  @ApiProperty() @IsString() @IsNotEmpty() id!: string;
  @ApiProperty() @IsString() @IsNotEmpty() label!: string;
  @ApiProperty({ type: [RequirementItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequirementItemDto)
  items!: RequirementItemDto[];
}

export class EnglishTestDto {
  @ApiProperty({ enum: ['IELTS', 'TOEFL', 'PTE', 'Duolingo'] })
  @IsIn(['IELTS', 'TOEFL', 'PTE', 'Duolingo'])
  test!: 'IELTS' | 'TOEFL' | 'PTE' | 'Duolingo';

  @ApiProperty() @IsString() @IsNotEmpty() minScore!: string;
}

export class ScholarshipDto {
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiPropertyOptional({ type: Number }) @IsOptional() @IsInt() @Min(0) amount?: number;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() note?: string;
}

export class CampusDto {
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiProperty() @IsString() @IsNotEmpty() city!: string;
  @ApiProperty({ example: 'GB' }) @IsString() @IsNotEmpty() countryCode!: string;
}

export class QualityRatingDto {
  @ApiProperty() @IsString() @IsNotEmpty() scheme!: string;
  @ApiProperty() @IsString() @IsNotEmpty() level!: string;
  @ApiProperty() @IsInt() year!: number;
}

export class FaqDto {
  @ApiProperty() @IsString() @IsNotEmpty() question!: string;
  @ApiProperty() @IsString() @IsNotEmpty() answer!: string;
}
