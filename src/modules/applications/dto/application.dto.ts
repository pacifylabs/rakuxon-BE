import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

import { ApplicationStatus, DocumentType } from '../../../contract/enums';

export class CreateApplicationDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  courseId!: string;
}

export class ApplicationDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  courseId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  institutionId!: string;

  @ApiProperty({ enum: ApplicationStatus, enumName: 'ApplicationStatus' })
  status!: ApplicationStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  submittedAt!: string | null;

  @ApiProperty({ type: [String] })
  attachedDocumentIds!: string[];

  @ApiProperty({
    type: [String],
    enum: DocumentType,
    enumName: 'DocumentType',
    description: 'Required document types not yet attached. Empty once ready to submit.',
  })
  missingDocumentTypes!: DocumentType[];

  @ApiProperty({ description: 'Whether the profile and document gates are both satisfied.' })
  readyToSubmit!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}
