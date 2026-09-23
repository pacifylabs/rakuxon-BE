import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';

import { AgencyDashboardSummaryDto, CreateAgencyStaffDto, CreateAgencyStudentDto } from './dto/agency.dto';
import type {
  AdminApplicationDetailDto,
  AdminApplicationListDto,
  ListAdminApplicationsQueryDto,
} from '../applications/dto/admin-application.dto';
import { ApplicationsService } from '../applications/applications.service';
import { Application } from '../applications/entities/application.entity';
import { AuthService } from '../auth/auth.service';
import { DocumentDto } from '../documents/dto/document.dto';
import type { Document } from '../documents/entities/document.entity';
import { DocumentsService } from '../documents/documents.service';
import type {
  AdminStudentDetailDto,
  AdminStudentListDto,
  ListAdminStudentsQueryDto,
} from '../students/dto/admin-student.dto';
import { Student } from '../students/entities/student.entity';
import { StudentsService } from '../students/students.service';
import type { TenantStaffDto, TenantStaffListDto } from '../tenants/dto/tenant.dto';
import { TenantsService } from '../tenants/tenants.service';
import { Role, UserStatus } from '../../contract/enums';

@Injectable()
export class AgencyService {
  constructor(
    @InjectRepository(Student) private readonly students: Repository<Student>,
    @InjectRepository(Application) private readonly applications: Repository<Application>,
    private readonly studentsService: StudentsService,
    private readonly applicationsService: ApplicationsService,
    private readonly tenants: TenantsService,
    private readonly documents: DocumentsService,
    private readonly auth: AuthService,
  ) {}

  /* -------------------------------------------------------------- dashboard */

  async getDashboardSummary(tenantId: string): Promise<AgencyDashboardSummaryDto> {
    const [tenant, totalStudents, totalApplications, applicationsByStatus, complete, incomplete] =
      await Promise.all([
        this.tenants.get(tenantId),
        this.students.count({ where: { tenantId } }),
        this.applications.count({ where: { tenantId } }),
        this.applications
          .createQueryBuilder('a')
          .select('a.status', 'key')
          .addSelect('COUNT(*)', 'count')
          .where('a."tenantId" = :tenantId', { tenantId })
          .groupBy('a.status')
          .getRawMany<{ key: string; count: string }>(),
        this.students.count({ where: { tenantId, profileCompletedAt: Not(IsNull()) } }),
        this.students.count({ where: { tenantId, profileCompletedAt: IsNull() } }),
      ]);

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantStatus: tenant.status,
      totalStudents,
      totalApplications,
      applicationsByStatus: applicationsByStatus.map((row) => ({ key: row.key, count: Number(row.count) })),
      studentsWithCompleteProfile: complete,
      studentsWithIncompleteProfile: incomplete,
    };
  }

  /* ---------------------------------------------------------------- students */

  listStudents(tenantId: string, query: ListAdminStudentsQueryDto): Promise<AdminStudentListDto> {
    return this.studentsService.listAdmin({ ...query, tenantId });
  }

  async getStudent(tenantId: string, id: string): Promise<AdminStudentDetailDto> {
    const student = await this.studentsService.getAdminDetail(id);
    if (student.tenantId !== tenantId) {
      /* Not found, not forbidden — whether another agency's student exists
         at all is not something an agency should be able to probe for. */
      throw new NotFoundException('No student with that id.');
    }
    return student;
  }

  /** A student the agency already has, brought in directly — no invite link round trip. */
  async createStudent(tenantId: string, dto: CreateAgencyStudentDto): Promise<AdminStudentDetailDto> {
    const { studentId, user } = await this.studentsService.createByAgency(tenantId, dto);
    await this.auth.sendVerificationEmailBestEffort(user);
    return this.studentsService.getAdminDetail(studentId);
  }

  /**
   * So the attach-document screen has something to attach — an agency has
   * no other way to see what a student has uploaded, since `/documents` is
   * student-only and `/admin/students/:id/documents` sits behind the
   * separate admin-permission system. Read-only: reject/approve/upload
   * stay platform-admin actions.
   */
  async listStudentDocuments(tenantId: string, studentId: string): Promise<DocumentDto[]> {
    await this.getStudent(tenantId, studentId);
    return (await this.documents.listForAdmin(studentId)).map((document) => this.toDocumentDto(document));
  }

  private toDocumentDto(document: Document): DocumentDto {
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

  /* ------------------------------------------------------------ applications */

  async listApplications(
    tenantId: string,
    query: ListAdminApplicationsQueryDto,
  ): Promise<AdminApplicationListDto> {
    const { items, total, page, pageCount } = await this.applicationsService.listAdmin({
      ...query,
      tenantId,
    });
    return { items: await this.applicationsService.enrichSummaries(items), total, page, pageCount };
  }

  async getApplication(tenantId: string, id: string): Promise<AdminApplicationDetailDto> {
    return this.toDetail(await this.applicationsService.getForTenant(tenantId, id));
  }

  async attachDocument(
    tenantId: string,
    applicationId: string,
    documentId: string,
  ): Promise<AdminApplicationDetailDto> {
    return this.toDetail(
      await this.applicationsService.attachDocumentForTenant(tenantId, applicationId, documentId),
    );
  }

  async detachDocument(
    tenantId: string,
    applicationId: string,
    documentId: string,
  ): Promise<AdminApplicationDetailDto> {
    return this.toDetail(
      await this.applicationsService.detachDocumentForTenant(tenantId, applicationId, documentId),
    );
  }

  /** Submitting a draft on a student's behalf — same rules `submit()` enforces for the student themselves. */
  async submitApplication(tenantId: string, applicationId: string): Promise<AdminApplicationDetailDto> {
    return this.toDetail(await this.applicationsService.submitForTenant(tenantId, applicationId));
  }

  private async toDetail(
    entry: Awaited<ReturnType<ApplicationsService['getForTenant']>>,
  ): Promise<AdminApplicationDetailDto> {
    const [summary] = await this.applicationsService.enrichSummaries([entry.application]);
    return {
      ...summary!,
      attachedDocumentIds: entry.attachedDocumentIds,
      missingDocumentTypes: entry.missingDocumentTypes,
      readyToSubmit: entry.readyToSubmit,
    };
  }

  /* ------------------------------------------------------------------ staff */

  async listStaff(tenantId: string): Promise<TenantStaffListDto> {
    return { items: await this.tenants.listStaff(tenantId) };
  }

  /** Always a counselor — self-service can never mint a second agency_admin (see `CreateAgencyStaffDto`'s own doc comment). */
  addStaff(tenantId: string, dto: CreateAgencyStaffDto): Promise<TenantStaffDto> {
    return this.tenants.addStaff(tenantId, { ...dto, role: Role.Counselor });
  }

  suspendStaff(tenantId: string, userId: string): Promise<TenantStaffDto> {
    return this.tenants.setStaffStatus(tenantId, userId, UserStatus.Suspended);
  }

  reactivateStaff(tenantId: string, userId: string): Promise<TenantStaffDto> {
    return this.tenants.setStaffStatus(tenantId, userId, UserStatus.Active);
  }
}
