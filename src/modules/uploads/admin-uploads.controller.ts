import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminUploadSignatureDto, AdminUploadSignatureRequestDto } from './dto/admin-upload.dto';
import { AdminUploadsService } from './uploads.service';
import { AdminJwtAuthGuard } from '../../common/auth/admin-jwt-auth.guard';
import { Public } from '../../common/auth/public.decorator';

/**
 * No `@RequirePermission` here, deliberately: issuing a signature lets the
 * caller upload a file to Cloudinary, nothing more — it creates no row and
 * changes no record. The permission check that matters is on the endpoint
 * that actually saves the resulting URL onto a testimonial, institution or
 * article, which is already gated by `content.manage` / `catalogue.publish`.
 * Any signed-in admin may ask for a signature.
 */
@ApiTags('admin-uploads')
@Controller('admin/uploads')
@Public()
@UseGuards(AdminJwtAuthGuard)
@ApiBearerAuth('admin-access-token')
export class AdminUploadsController {
  constructor(private readonly uploads: AdminUploadsService) {}

  @Post('signature')
  @ApiOperation({ summary: 'Issue a signed Cloudinary upload for an admin-authored content image' })
  @ApiOkResponse({ type: AdminUploadSignatureDto })
  createSignature(@Body() dto: AdminUploadSignatureRequestDto): AdminUploadSignatureDto {
    return this.uploads.createSignature(dto.folder);
  }
}
