import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { TenantStatus } from '../../../contract/enums';

export class ListTenantsQueryDto {
  @ApiPropertyOptional({ enum: TenantStatus, enumName: 'TenantStatus' })
  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @ApiPropertyOptional({ description: 'Free text over name and slug.' })
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

export class TenantDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty() name!: string;

  @ApiProperty() slug!: string;

  @ApiProperty({ enum: TenantStatus, enumName: 'TenantStatus' })
  status!: TenantStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

export class TenantListDto {
  @ApiProperty({ type: [TenantDto] }) items!: TenantDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageCount!: number;
}
