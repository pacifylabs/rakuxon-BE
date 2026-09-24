import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

/** Where the uploaded image will be used — namespaces the Cloudinary public id, nothing more. */
export const ADMIN_UPLOAD_FOLDERS = ['testimonials', 'institutions', 'articles', 'site-settings', 'destinations', 'media-assets'] as const;
export type AdminUploadFolder = (typeof ADMIN_UPLOAD_FOLDERS)[number];

export class AdminUploadSignatureRequestDto {
  @ApiProperty({ enum: ADMIN_UPLOAD_FOLDERS })
  @IsIn(ADMIN_UPLOAD_FOLDERS)
  folder!: AdminUploadFolder;
}

export class AdminUploadSignatureDto {
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
