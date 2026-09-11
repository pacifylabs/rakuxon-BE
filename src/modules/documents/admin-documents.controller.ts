import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  ConfirmDocumentUploadDto,
  DocumentDto,
  RejectDocumentDto,
  UploadSignatureDto,
  UploadSignatureRequestDto,
} from './dto/document.dto';
import { DocumentsService } from './documents.service';
import type { Document } from './entities/document.entity';
import { AdminJwtAuthGuard } from '../../common/auth/admin-jwt-auth.guard';
import { CurrentAdmin } from '../../common/auth/current-admin.decorator';
import { Public } from '../../common/auth/public.decorator';
import { PermissionGuard } from '../../common/rbac/permission.guard';
import { RequirePermission } from '../../common/rbac/require-permission.decorator';
import type { AuthenticatedAdmin } from '../../common/auth/authenticated-admin-request';

/**
 * Reject a student's uploaded document, or upload one on their behalf — both
 * behind the single `documents.review` permission (see the migration that
 * added it: reviewing trust extends to supplying what's missing, the same
 * screen either way).
 */
@ApiTags('admin-documents')
@Controller('admin')
@Public()
@UseGuards(AdminJwtAuthGuard, PermissionGuard)
@ApiBearerAuth('admin-access-token')
@RequirePermission('documents.review')
export class AdminDocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('students/:studentId/documents')
  @ApiOperation({ summary: "One student's documents, for review" })
  @ApiOkResponse({ type: [DocumentDto] })
  async list(@Param('studentId') studentId: string): Promise<DocumentDto[]> {
    return (await this.documents.listForAdmin(studentId)).map((document) => this.toDto(document));
  }

  @Post('students/:studentId/documents/upload-signature')
  @ApiOperation({ summary: 'Issue an upload signature for a student who cannot upload it themselves' })
  @ApiOkResponse({ type: UploadSignatureDto })
  async getUploadSignature(
    @Param('studentId') studentId: string,
    @Body() dto: UploadSignatureRequestDto,
  ): Promise<UploadSignatureDto> {
    return this.documents.createUploadSignatureForStudent(studentId, dto);
  }

  @Post('documents/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record that an admin-issued upload actually completed' })
  @ApiOkResponse({ type: DocumentDto })
  async confirm(@Param('id') id: string, @Body() dto: ConfirmDocumentUploadDto): Promise<DocumentDto> {
    return this.toDto(await this.documents.confirmUploadForAdmin(id, dto));
  }

  @Post('documents/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject an uploaded document',
    description: 'Notifies the student in-app and by email with the given reason.',
  })
  @ApiOkResponse({ type: DocumentDto })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectDocumentDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<DocumentDto> {
    return this.toDto(await this.documents.reject(id, dto.reason, admin.id));
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
      rejectionReason: document.rejectionReason,
      createdAt: document.createdAt.toISOString(),
    };
  }
}
