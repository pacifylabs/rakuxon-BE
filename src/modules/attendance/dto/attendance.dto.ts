import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ListAttendanceQueryDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  adminId?: string;

  @ApiPropertyOptional({ example: '2026-09-01', description: 'Inclusive start date.' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30', description: 'Inclusive end date.' })
  @IsOptional()
  @IsDateString()
  to?: string;

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

export class AttendanceRecordDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) adminId!: string;
  @ApiProperty() adminName!: string;
  @ApiProperty({ example: '2026-09-24' }) date!: string;
  @ApiProperty({ type: String, format: 'date-time' }) clockInAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) clockOutAt!: string | null;
}

export class AttendanceRecordListDto {
  @ApiProperty({ type: [AttendanceRecordDto] }) items!: AttendanceRecordDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageCount!: number;
}

export class TodayAttendanceDto {
  @ApiProperty({ type: AttendanceRecordDto, nullable: true }) record!: AttendanceRecordDto | null;
}
