import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

import { ApplicationStatus, DocumentType } from '../../../contract/enums';

/*
 * A UUID shape, not `@IsUUID()`: the house tenant's id (HOUSE_TENANT_ID,
 * src/contract/constants.ts) is a fixed, human-readable constant with an
 * all-zero version nibble, which fails class-validator's strict version
 * check. Filtering admin/applications?tenantId=<house tenant> is a real,
 * expected query, so the check only needs to reject obvious garbage.
 */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ListAdminApplicationsQueryDto {
  @ApiPropertyOptional({ enum: ApplicationStatus, enumName: 'ApplicationStatus' })
  @IsOptional()
  @IsEnum(ApplicationStatus)
  status?: ApplicationStatus;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @Matches(UUID_SHAPE, { message: 'tenantId must be a UUID' })
  tenantId?: string;

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

/**
 * Deliberately without the document-attachment gates (attachedDocumentIds /
 * missingDocumentTypes / readyToSubmit) that the student-facing ApplicationDto
 * carries — computing those needs a per-row query, and a paginated admin list
 * would turn into one N+1 gate check per page. AdminApplicationDetailDto
 * below carries them for the single-`get` route instead.
 */
export class AdminApplicationSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) tenantId!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty({ type: String, format: 'uuid' }) studentId!: string;
  @ApiProperty() studentName!: string;
  @ApiProperty() studentEmail!: string;
  @ApiProperty({ type: String, format: 'uuid' }) courseId!: string;
  @ApiProperty() courseTitle!: string;
  @ApiProperty({ type: String, format: 'uuid' }) institutionId!: string;
  @ApiProperty() institutionName!: string;
  @ApiProperty({ enum: ApplicationStatus, enumName: 'ApplicationStatus' }) status!: ApplicationStatus;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) submittedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}

export class AdminApplicationListDto {
  @ApiProperty({ type: [AdminApplicationSummaryDto] }) items!: AdminApplicationSummaryDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageCount!: number;
}

export class AdminApplicationDetailDto extends AdminApplicationSummaryDto {
  @ApiProperty({ type: [String] }) attachedDocumentIds!: string[];
  @ApiProperty({ type: [String], enum: DocumentType, enumName: 'DocumentType' })
  missingDocumentTypes!: DocumentType[];
  @ApiProperty() readyToSubmit!: boolean;
}
