import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import type { AuditActorType } from '../entities/audit-log.entity';

const ACTOR_TYPES: AuditActorType[] = ['admin', 'student', 'system'];

export class ListAuditLogQueryDto {
  @ApiPropertyOptional({ enum: ACTOR_TYPES })
  @IsOptional()
  @IsIn(ACTOR_TYPES)
  actorType?: AuditActorType;

  @ApiPropertyOptional({ description: 'e.g. application, student, tenant, admin, document' })
  @IsOptional()
  @IsString()
  resourceType?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class AuditLogEntryDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ACTOR_TYPES }) actorType!: AuditActorType;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) actorId!: string | null;
  @ApiProperty({ type: String, nullable: true }) actorName!: string | null;
  @ApiProperty() action!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ type: String, nullable: true }) resourceType!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) resourceId!: string | null;
  @ApiProperty({ type: Object }) metadata!: Record<string, unknown>;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}

export class AuditLogListDto {
  @ApiProperty({ type: [AuditLogEntryDto] }) items!: AuditLogEntryDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageCount!: number;
}

/** One resource's own history — unpaginated, since a single application/student/tenant/admin's trail is never long enough to need it. */
export class ResourceAuditLogDto {
  @ApiProperty({ type: [AuditLogEntryDto] }) items!: AuditLogEntryDto[];
}
