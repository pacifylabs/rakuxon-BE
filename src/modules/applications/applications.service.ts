import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import type { AdminApplicationSummaryDto } from './dto/admin-application.dto';
import type { CreateApplicationDto } from './dto/application.dto';
import { ApplicationDocument } from './entities/application-document.entity';
import { Application } from './entities/application.entity';
import { Course } from '../catalogue/entities/course.entity';
import { Institution } from '../catalogue/entities/institution.entity';
import {
  ApplicationStatus,
  DocumentStatus,
  DocumentType,
  IntakeStatus,
  PublishStatus,
} from '../../contract/enums';
import { DocumentsService } from '../documents/documents.service';
import { StudentsService } from '../students/students.service';
import { Tenant } from '../tenants/entities/tenant.entity';
import type { AuthenticatedUser } from '../../common/auth/authenticated-request';

/**
 * What a course actually asks most applicants for. Institution-specific
 * requirements (catalogue's own `requiredDocuments` per course) are a richer
 * future source of truth than this fixed list — see the plan's note on
 * widening this once that wiring exists.
 */
const REQUIRED_DOCUMENT_TYPES = [
  DocumentType.Identity,
  DocumentType.AcademicCertificate,
  DocumentType.EnglishTest,
];

export interface ApplicationWithGates {
  application: Application;
  attachedDocumentIds: string[];
  missingDocumentTypes: DocumentType[];
  readyToSubmit: boolean;
}

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectRepository(Application) private readonly applications: Repository<Application>,
    @InjectRepository(ApplicationDocument)
    private readonly applicationDocuments: Repository<ApplicationDocument>,
    @InjectRepository(Course) private readonly courses: Repository<Course>,
    @InjectRepository(Institution) private readonly institutions: Repository<Institution>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly students: StudentsService,
    private readonly documents: DocumentsService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateApplicationDto): Promise<ApplicationWithGates> {
    const student = await this.students.getOwnProfile(user);
    const course = await this.courses.findOne({ where: { id: dto.courseId } });

    if (!course) throw new NotFoundException('No course with that id.');
    if (course.status !== PublishStatus.Published) {
      throw new BadRequestException('This course is not open for applications.');
    }

    /*
     * No specific intake is chosen yet at this MVP stage — a course with at
     * least one intake that isn't explicitly closed is enough to start a
     * draft. Imported records commonly carry no intake data at all; treating
     * that as "closed" would block applying to courses the catalogue simply
     * hasn't enriched yet, which is a data-completeness gap, not a real
     * admissions closure.
     */
    const hasOpenIntake =
      course.intakes.length === 0 || course.intakes.some((intake) => intake.status !== IntakeStatus.Closed);
    if (!hasOpenIntake) {
      throw new ConflictException(
        'This course is no longer accepting applications for its published intakes.',
      );
    }

    const saved = await this.applications.save(
      this.applications.create({
        tenantId: student.tenantId,
        studentId: student.id,
        courseId: course.id,
        institutionId: course.institutionId,
      }),
    );

    return this.withGates(saved);
  }

  async list(user: AuthenticatedUser): Promise<ApplicationWithGates[]> {
    const student = await this.students.getOwnProfile(user);
    const found = await this.applications.find({
      where: { studentId: student.id },
      order: { createdAt: 'DESC' },
    });

    return Promise.all(found.map((application) => this.withGates(application)));
  }

  async get(user: AuthenticatedUser, id: string): Promise<ApplicationWithGates> {
    return this.withGates(await this.ownedApplication(user, id));
  }

  /**
   * Admin oversight — unscoped by student or tenant, unlike every method
   * above. Kept as its own pair of methods rather than reusing
   * `ownedApplication()`/`list()`, so the student-facing ownership check can
   * never accidentally be relaxed by a change made for the admin path.
   */
  async listAdmin(
    query: { status?: ApplicationStatus; tenantId?: string; page?: number; limit?: number },
  ): Promise<{ items: Application[]; total: number; page: number; pageCount: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;

    const builder = this.applications.createQueryBuilder('a');
    if (query.status) builder.andWhere('a.status = :status', { status: query.status });
    if (query.tenantId) builder.andWhere('a."tenantId" = :tenantId', { tenantId: query.tenantId });

    builder.orderBy('a.createdAt', 'DESC').skip((page - 1) * limit).take(limit);

    const [items, total] = await builder.getManyAndCount();

    return { items, total, page, pageCount: Math.max(1, Math.ceil(total / limit)) };
  }

  async getAdmin(id: string): Promise<ApplicationWithGates> {
    const application = await this.applications.findOne({ where: { id } });
    if (!application) throw new NotFoundException('No application with that id.');
    return this.withGates(application);
  }

  async attachDocument(
    user: AuthenticatedUser,
    applicationId: string,
    documentId: string,
  ): Promise<ApplicationWithGates> {
    const application = await this.ownedDraftApplication(user, applicationId);
    const document = await this.documents.getOwnDocument(user, documentId);

    if (document.status !== DocumentStatus.Uploaded) {
      throw new BadRequestException('Only a fully uploaded document can be attached.');
    }

    await this.applicationDocuments.save(
      this.applicationDocuments.create({ applicationId: application.id, documentId: document.id }),
    );

    return this.withGates(application);
  }

  async detachDocument(
    user: AuthenticatedUser,
    applicationId: string,
    documentId: string,
  ): Promise<ApplicationWithGates> {
    const application = await this.ownedDraftApplication(user, applicationId);
    await this.applicationDocuments.delete({ applicationId: application.id, documentId });

    return this.withGates(application);
  }

  async submit(user: AuthenticatedUser, applicationId: string): Promise<ApplicationWithGates> {
    const application = await this.ownedApplication(user, applicationId);

    /* Not idempotent: a resubmission is a conflict, the same way a spent
       onboarding-link token is — replaying a state transition means
       something different than replaying a side-effect-free read. */
    if (application.status !== ApplicationStatus.Draft) {
      throw new ConflictException('This application has already been submitted.');
    }

    const student = await this.students.getOwnProfile(user);
    if (!student.profileCompletedAt) {
      throw new BadRequestException('Complete your profile before submitting an application.');
    }
    const gated = await this.withGates(application);
    if (!gated.readyToSubmit) {
      throw new BadRequestException(
        `Attach the required documents before submitting: ${gated.missingDocumentTypes.join(', ')}`,
      );
    }

    application.status = ApplicationStatus.Submitted;
    application.submittedAt = new Date();
    const saved = await this.applications.save(application);

    return this.withGates(saved);
  }

  private async ownedApplication(user: AuthenticatedUser, id: string): Promise<Application> {
    const student = await this.students.getOwnProfile(user);
    const application = await this.applications.findOne({ where: { id } });

    if (!application) throw new NotFoundException('No application with that id.');
    if (application.studentId !== student.id) {
      throw new ForbiddenException('That application does not belong to you.');
    }

    return application;
  }

  private async ownedDraftApplication(user: AuthenticatedUser, id: string): Promise<Application> {
    const application = await this.ownedApplication(user, id);
    if (application.status !== ApplicationStatus.Draft) {
      throw new ConflictException('Documents can only be attached while the application is a draft.');
    }
    return application;
  }

  private async withGates(application: Application): Promise<ApplicationWithGates> {
    const links = await this.applicationDocuments.find({ where: { applicationId: application.id } });
    const attachedDocumentIds = links.map((link) => link.documentId);

    const attached = await this.documents.findUploadedByStudentId(
      application.studentId,
      attachedDocumentIds,
    );
    const attachedTypes = new Set(attached.map((document) => document.type));
    const missingDocumentTypes = REQUIRED_DOCUMENT_TYPES.filter((type) => !attachedTypes.has(type));

    return {
      application,
      attachedDocumentIds,
      missingDocumentTypes,
      readyToSubmit: missingDocumentTypes.length === 0,
    };
  }

  /**
   * A raw `Application` row only carries ids — every admin screen needs the
   * names behind them. Batched here (one query per related table) rather
   * than resolved per row, which is what the summary DTO's own doc comment
   * already warned an admin list must avoid.
   */
  async enrichSummaries(applications: Application[]): Promise<AdminApplicationSummaryDto[]> {
    if (applications.length === 0) return [];

    const studentIds = [...new Set(applications.map((row) => row.studentId))];
    const courseIds = [...new Set(applications.map((row) => row.courseId))];
    const institutionIds = [...new Set(applications.map((row) => row.institutionId))];
    const tenantIds = [...new Set(applications.map((row) => row.tenantId))];

    const [studentSummaries, courses, institutions, tenants] = await Promise.all([
      this.students.getSummariesForAdmin(studentIds),
      this.courses.find({ where: { id: In(courseIds) } }),
      this.institutions.find({ where: { id: In(institutionIds) } }),
      this.tenants.find({ where: { id: In(tenantIds) } }),
    ]);

    const courseTitleById = new Map(courses.map((course) => [course.id, course.title]));
    const institutionNameById = new Map(institutions.map((institution) => [institution.id, institution.name]));
    const tenantNameById = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));

    return applications.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      tenantName: tenantNameById.get(row.tenantId) ?? 'Unknown tenant',
      studentId: row.studentId,
      studentName: studentSummaries.get(row.studentId)?.fullName ?? 'Unknown student',
      studentEmail: studentSummaries.get(row.studentId)?.email ?? '',
      courseId: row.courseId,
      courseTitle: courseTitleById.get(row.courseId) ?? 'Unknown course',
      institutionId: row.institutionId,
      institutionName: institutionNameById.get(row.institutionId) ?? 'Unknown institution',
      status: row.status,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
