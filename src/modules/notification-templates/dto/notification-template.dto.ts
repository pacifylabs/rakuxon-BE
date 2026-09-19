import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

import type { NotificationChannel } from '../entities/notification-template.entity';

export class NotificationTemplateSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() key!: string;
  @ApiProperty() channel!: NotificationChannel;
  @ApiProperty() heading!: string;
  @ApiProperty() enabled!: boolean;
}

export class NotificationTemplateDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() key!: string;
  @ApiProperty() channel!: NotificationChannel;
  @ApiPropertyOptional({ type: String, nullable: true }) subject!: string | null;
  @ApiProperty() heading!: string;
  @ApiProperty({ type: [String] }) body!: string[];
  @ApiPropertyOptional({ type: String, nullable: true }) ctaLabel!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) ctaUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) footnote!: string | null;
  @ApiProperty() enabled!: boolean;
  /** The `{{tokens}}` this key's call site actually fills in — everything else renders as literal text. */
  @ApiProperty({ type: [String] }) availableTokens!: string[];
}

export class UpdateNotificationTemplateDto {
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() subject?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() heading?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) body?: string[];
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() ctaLabel?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() ctaUrl?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() footnote?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
}

/** The editor's in-progress, not-yet-saved field values — previewed as-is, against that key's sample data. */
export class PreviewNotificationTemplateDto {
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() subject?: string | null;
  @ApiProperty() @IsString() heading!: string;
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) body!: string[];
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() ctaLabel?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() ctaUrl?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() footnote?: string | null;
}

export class NotificationTemplatePreviewDto {
  @ApiProperty() subject!: string;
  @ApiProperty() html!: string;
  @ApiProperty() text!: string;
  @ApiProperty() inAppTitle!: string;
  @ApiProperty() inAppBody!: string;
}
