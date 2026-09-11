import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsString, IsUrl, MaxLength, Min } from 'class-validator';

import { DocumentStatus, DocumentType } from '../../../contract/enums';

export class UploadSignatureRequestDto {
  @ApiProperty({ enum: DocumentType, enumName: 'DocumentType' })
  @IsEnum(DocumentType)
  type!: DocumentType;

  @ApiProperty({ example: 'transcript.pdf' })
  @IsString()
  @IsNotEmpty()
  filename!: string;
}

export class UploadSignatureDto {
  @ApiProperty({ type: String, format: 'uuid' })
  documentId!: string;

  @ApiProperty()
  cloudName!: string;

  @ApiProperty()
  apiKey!: string;

  @ApiProperty({ description: 'Unix seconds. Signed alongside publicId — must be sent back unchanged.' })
  timestamp!: number;

  @ApiProperty()
  signature!: string;

  @ApiProperty()
  publicId!: string;

  @ApiProperty({ description: 'POST the file here as multipart form data.' })
  uploadUrl!: string;
}

export class ConfirmDocumentUploadDto {
  @ApiProperty({ description: "Cloudinary's `secure_url` from the upload response." })
  @IsUrl()
  secureUrl!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  bytes!: number;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  @IsNotEmpty()
  mimeType!: string;
}

export class DocumentDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: DocumentType, enumName: 'DocumentType' })
  type!: DocumentType;

  @ApiProperty({ enum: DocumentStatus, enumName: 'DocumentStatus' })
  status!: DocumentStatus;

  @ApiProperty()
  originalFilename!: string;

  @ApiProperty({ type: String, nullable: true })
  url!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  bytes!: number | null;

  @ApiProperty({ type: String, nullable: true })
  mimeType!: string | null;

  /** Set only when `status` is `rejected` — why, in the reviewer's own words. */
  @ApiProperty({ type: String, nullable: true })
  rejectionReason!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

export class RejectDocumentDto {
  @ApiProperty({ example: 'The scan is illegible — please re-upload a clearer copy.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
