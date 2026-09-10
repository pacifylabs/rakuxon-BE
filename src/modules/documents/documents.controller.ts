import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  ConfirmDocumentUploadDto,
  DocumentDto,
  UploadSignatureDto,
  UploadSignatureRequestDto,
} from './dto/document.dto';
import { DocumentsService } from './documents.service';
import type { Document } from './entities/document.entity';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../contract/enums';
import type { AuthenticatedUser } from '../../common/auth/authenticated-request';

@ApiTags('documents')
@ApiBearerAuth('access-token')
@Controller('documents')
@Roles(Role.Student)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post('upload-signature')
  @ApiOperation({
    summary: 'Get a signed Cloudinary upload for one document',
    description:
      'Creates a `pending_upload` record and returns everything the browser needs to POST the ' +
      'file straight to Cloudinary. The file never passes through this API.',
  })
  @ApiCreatedResponse({ type: UploadSignatureDto })
  async getUploadSignature(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UploadSignatureRequestDto,
  ): Promise<UploadSignatureDto> {
    return this.documents.createUploadSignature(user, dto);
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record that a signed upload actually completed' })
  @ApiOkResponse({ type: DocumentDto })
  async confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ConfirmDocumentUploadDto,
  ): Promise<DocumentDto> {
    return this.toDto(await this.documents.confirmUpload(user, id, dto));
  }

  @Get()
  @ApiOperation({ summary: "The caller's own documents" })
  @ApiOkResponse({ type: [DocumentDto] })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<DocumentDto[]> {
    return (await this.documents.listOwn(user)).map((document) => this.toDto(document));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete one of the caller\'s own documents' })
  @ApiNoContentResponse()
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.documents.remove(user, id);
  }

  private toDto(document: Document): DocumentDto {
    return {
      id: document.id,
      type: document.type,
      status: document.status,
      originalFilename: document.originalFilename,
      url: document.url,
      bytes: document.bytes,
      mimeType: document.mimeType,
      createdAt: document.createdAt.toISOString(),
    };
  }
}
