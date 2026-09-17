import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/* -------------------------------------------------------------- public */

export class IntakeTermDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'September 2026' }) label!: string;
}

/* --------------------------------------------------------------- admin */

export class AdminIntakeTermDto {
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() active!: boolean;
}

export class CreateIntakeTermDto {
  @ApiProperty({ example: 'September 2026' }) @IsString() @IsNotEmpty() label!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class UpdateIntakeTermDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() label?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
