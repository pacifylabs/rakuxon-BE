import { randomUUID } from 'node:crypto';

import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { v2 as cloudinary } from 'cloudinary';
import { In, Repository } from 'typeorm';

import type { ConfirmDocumentUploadDto, UploadSignatureDto, UploadSignatureRequestDto } from './dto/document.dto';
import { Document } from './entities/document.entity';
import { ENV } from '../../common/config/config.module';
import { DocumentStatus } from '../../contract/enums';
import { StudentsService } from '../students/students.service';
import type { Env } from '../../common/config/env.schema';
import type { AuthenticatedUser } from '../../common/auth/authenticated-request';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(Document) private readonly documents: Repository<Document>,
    private readonly students: StudentsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async createUploadSignature(
    user: AuthenticatedUser,
    dto: UploadSignatureRequestDto,
  ): Promise<UploadSignatureDto> {
    const { cloudName, apiKey, apiSecret } = this.credentials();
    const student = await this.students.getOwnProfile(user);

    /* Namespaced by tenant and student, never guessable — the id alone
       would let one student's upload collide with or overwrite another's if
       either ever chose the same original filename. */
    const publicId = `tenants/${student.tenantId}/students/${student.id}/${randomUUID()}`;
    const timestamp = Math.round(Date.now() / 1000);

    const saved = await this.documents.save(
      this.documents.create({
        tenantId: student.tenantId,
        studentId: student.id,
        type: dto.type,
        status: DocumentStatus.PendingUpload,
        originalFilename: dto.filename,
        cloudinaryPublicId: publicId,
      }),
    );

    /* Only the parameters actually sent to Cloudinary's /upload endpoint are
       signed — signing extras that never reach the request would just make
       the signature Cloudinary computes on receipt disagree with this one. */
    const signature = cloudinary.utils.api_sign_request({ public_id: publicId, timestamp }, apiSecret);

    return {
      documentId: saved.id,
      cloudName,
      apiKey,
      timestamp,
      signature,
      publicId,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
    };
  }

  async confirmUpload(
    user: AuthenticatedUser,
    documentId: string,
    dto: ConfirmDocumentUploadDto,
  ): Promise<Document> {
    const document = await this.getOwnDocument(user, documentId);

    document.status = DocumentStatus.Uploaded;
    document.url = dto.secureUrl;
    document.bytes = dto.bytes;
    document.mimeType = dto.mimeType;

    return this.documents.save(document);
  }

  async listOwn(user: AuthenticatedUser): Promise<Document[]> {
    const student = await this.students.getOwnProfile(user);

    return this.documents.find({
      where: { studentId: student.id, tenantId: student.tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Soft delete: the row (and its audit trail) stays, Cloudinary cleanup is best-effort. */
  async remove(user: AuthenticatedUser, documentId: string): Promise<void> {
    const document = await this.getOwnDocument(user, documentId);
    document.status = DocumentStatus.Deleted;
    await this.documents.save(document);

    try {
      await cloudinary.uploader.destroy(document.cloudinaryPublicId, {
        resource_type: document.cloudinaryResourceType,
      });
    } catch {
      /* A local record of "deleted" is the guarantee that matters to the
         student; a stray file on Cloudinary is a storage-hygiene concern to
         clean up later, not something worth failing this request over. */
    }
  }

  /**
   * Looks up a document and confirms it belongs to the caller.
   *
   * Public: applications also attach/detach documents, and need the exact
   * same ownership check before doing so — one place that decides what
   * "belongs to you" means, not a second copy of the comparison.
   */
  async getOwnDocument(user: AuthenticatedUser, documentId: string): Promise<Document> {
    const student = await this.students.getOwnProfile(user);
    const document = await this.documents.findOne({ where: { id: documentId } });

    if (!document) throw new NotFoundException('No document with that id.');
    if (document.studentId !== student.id) {
      /* Not found, not forbidden, would also work — but issuing the
         signature and confirming it are both actions only the owner ever
         has a reason to take, so there is no ambiguity here worth hiding
         behind a 404 the way, say, another tenant's whole record would be. */
      throw new ForbiddenException('That document does not belong to you.');
    }

    return document;
  }

  /**
   * The uploaded documents among the given ids that belong to `studentId`.
   *
   * Takes the student row's id directly rather than an `AuthenticatedUser` —
   * a caller that already resolved the student (applications, checking a
   * set of attachments that are its own by construction) has no user to
   * re-derive one from, and `getOwnProfile` looks up by the *user's* id,
   * which `studentId` is not.
   */
  async findUploadedByStudentId(studentId: string, ids: string[]): Promise<Document[]> {
    if (ids.length === 0) return [];

    return this.documents.find({
      where: { id: In(ids), studentId, status: DocumentStatus.Uploaded },
    });
  }

  private credentials(): { cloudName: string; apiKey: string; apiSecret: string } {
    const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } =
      this.env;

    if (!cloudName || !apiKey || !apiSecret) {
      throw new BadRequestException('Document upload is not configured on this deployment yet.');
    }

    return { cloudName, apiKey, apiSecret };
  }
}
