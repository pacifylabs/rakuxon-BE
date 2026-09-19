import { Admin } from '../admins/entities/admin.entity';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
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
import { ENV } from '../../common/config/config.module';
import { appUrlForRole } from '../../common/config/env.schema';
import type { Env } from '../../common/config/env.schema';
import { NOTIFICATION_PORT } from '../../common/notifications/notification.port';
import type { NotificationPort } from '../../common/notifications/notification.port';
import {
  ApplicationStatus,
  DocumentStatus,
  DocumentType,
  IntakeStatus,
  PublishStatus,
  Role,
  UserStatus,
} from '../../contract/enums';
import { AuditLogService } from '../audit-log/audit-log.service';
import { DocumentsService } from '../documents/documents.service';
import { NotificationsInboxService } from '../notifications-inbox/notifications-inbox.service';
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
  private readonly logger = new Logger('Notifications');

  constructor(
    @InjectRepository(Application) private readonly applications: Repository<Application>,
    @InjectRepository(ApplicationDocument)
    private readonly applicationDocuments: Repository<ApplicationDocument>,
    @InjectRepository(Course) private readonly courses: Repository<Course>,
    @InjectRepository(Institution) private readonly institutions: Repository<Institution>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly students: StudentsService,
    private readonly documents: DocumentsService,
    private readonly auditLog: AuditLogService,
    private readonly inbox: NotificationsInboxService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private async logStudentAction(
    user: AuthenticatedUser,
    applicationId: string,
    action: string,
    description: string,
  ): Promise<void> {
    const summaries = await this.students.getSummariesForAdmin([
      (await this.students.getOwnProfile(user)).id,
    ]);
    await this.auditLog.record({
      actorType: 'student',
      actorId: user.id,
      actorName: [...summaries.values()][0]?.fullName ?? null,
      action,
      description,
      resourceType: 'application',
      resourceId: applicationId,
    });
  }

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

  /**
   * Who currently owns working this application — not a review decision, so
   * it's allowed regardless of status (a submitted application still needs
   * a caseworker). `adminId: null` unassigns.
   */
  async assign(applicationId: string, adminId: string | null): Promise<ApplicationWithGates> {
    const application = await this.applicationById(applicationId);
    const previousAdminId = application.assignedAdminId;
    application.assignedAdminId = adminId;
    const saved = await this.applications.save(application);

    if (adminId && adminId !== previousAdminId) {
      await this.notifyCaseAssigned(saved, adminId);
    }

    return this.withGates(saved);
  }

  /** In-app + best-effort email to the newly-assigned admin only — reassigning to the same admin, or unassigning, notifies no one. */
  private async notifyCaseAssigned(application: Application, adminId: string): Promise<void> {
    const admin = await this.applications.manager.findOne(Admin, { where: { id: adminId } });
    if (!admin) return;

    const [studentDetail, { courseName, institutionName }] = await Promise.all([
      this.students.getAdminDetail(application.studentId),
      this.courseAndInstitutionNames(application),
    ]);
    const reviewUrl = `${appUrlForRole(this.env, Role.PlatformAdmin)}/dashboard/applications/${application.id}`;

    await this.inbox.create({
      adminId: admin.id,
      type: 'case_assigned',
      title: 'A case was assigned to you',
      body: `${studentDetail.fullName}'s application for ${courseName} at ${institutionName} is now yours.`,
      link: `/dashboard/applications/${application.id}`,
    });

    try {
      await this.notifications.sendCaseAssigned({
        to: admin.email,
        studentName: studentDetail.fullName,
        courseName,
        institutionName,
        reviewUrl,
      });
    } catch (error) {
      this.logger.warn(`Could not send case-assigned email to ${admin.email}: ${String(error)}`);
    }
  }

  /** Name-only, for an "assign to" picker — `admins.manage`'s full admin list is a higher trust tier than assigning needs. */
  async listAssignableAdmins(): Promise<{ id: string; firstName: string; lastName: string }[]> {
    const admins = await this.applications.manager.find(Admin, {
      where: { status: UserStatus.Active },
      order: { firstName: 'ASC', lastName: 'ASC' },
    });
    return admins.map((admin) => ({ id: admin.id, firstName: admin.firstName, lastName: admin.lastName }));
  }

  async attachDocument(
    user: AuthenticatedUser,
    applicationId: string,
    documentId: string,
  ): Promise<ApplicationWithGates> {
    const application = await this.ownedDraftApplication(user, applicationId);
    const document = await this.documents.getOwnDocument(user, documentId);

    if (document.status !== DocumentStatus.Uploaded && document.status !== DocumentStatus.Approved) {
      throw new BadRequestException('Only a fully uploaded document can be attached.');
    }

    await this.applicationDocuments.save(
      this.applicationDocuments.create({ applicationId: application.id, documentId: document.id }),
    );
    await this.logStudentAction(user, application.id, 'application.document.attach', 'Attached a document.');

    return this.withGates(application);
  }

  async detachDocument(
    user: AuthenticatedUser,
    applicationId: string,
    documentId: string,
  ): Promise<ApplicationWithGates> {
    const application = await this.ownedDraftApplication(user, applicationId);
    await this.applicationDocuments.delete({ applicationId: application.id, documentId });
    await this.logStudentAction(user, application.id, 'application.document.detach', 'Detached a document.');

    return this.withGates(application);
  }

  /**
   * The admin equivalent of `attachDocument`/`detachDocument` — no student
   * to own the request, so the ownership check is replaced with an explicit
   * "this document is actually this application's student's" check, which
   * the student path gets for free by construction (`getOwnDocument` already
   * scopes to the caller). Without it, an admin could attach any student's
   * document to any application.
   */
  async attachDocumentAdmin(applicationId: string, documentId: string): Promise<ApplicationWithGates> {
    const application = await this.draftApplicationById(applicationId);
    const document = await this.documents.getById(documentId);

    if (document.studentId !== application.studentId) {
      throw new BadRequestException('That document does not belong to this application\'s student.');
    }
    if (document.status !== DocumentStatus.Uploaded && document.status !== DocumentStatus.Approved) {
      throw new BadRequestException('Only a fully uploaded document can be attached.');
    }

    await this.applicationDocuments.save(
      this.applicationDocuments.create({ applicationId: application.id, documentId: document.id }),
    );

    return this.withGates(application);
  }

  async detachDocumentAdmin(applicationId: string, documentId: string): Promise<ApplicationWithGates> {
    const application = await this.draftApplicationById(applicationId);
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
    await this.logStudentAction(user, saved.id, 'application.submit', 'Submitted the application.');
    await this.notifyApplicationSubmitted(saved);

    return this.withGates(saved);
  }

  /**
   * In-app + best-effort email to the student, mirroring
   * `DocumentsService.reject()`'s own "never fails the parent action"
   * shape — a submission that succeeded but failed to notify is still a
   * submission that succeeded.
   */
  private async notifyApplicationSubmitted(application: Application): Promise<void> {
    const [studentDetail, { courseName, institutionName }] = await Promise.all([
      this.students.getAdminDetail(application.studentId),
      this.courseAndInstitutionNames(application),
    ]);
    const reviewUrl = `${appUrlForRole(this.env, Role.Student)}/dashboard/applications/${application.id}`;

    await this.inbox.create({
      userId: studentDetail.userId,
      type: 'application_submitted',
      title: 'Application submitted',
      body: `Your application for ${courseName} at ${institutionName} has been submitted.`,
      link: `/dashboard/applications/${application.id}`,
    });

    try {
      await this.notifications.sendApplicationSubmitted({
        to: studentDetail.email,
        courseName,
        institutionName,
        reviewUrl,
      });
    } catch (error) {
      this.logger.warn(
        `Could not send application-submitted email to ${studentDetail.email}: ${String(error)}`,
      );
    }
  }

  private async courseAndInstitutionNames(
    application: Application,
  ): Promise<{ courseName: string; institutionName: string }> {
    const [course, institution] = await Promise.all([
      this.courses.findOne({ where: { id: application.courseId } }),
      this.institutions.findOne({ where: { id: application.institutionId } }),
    ]);
    return {
      courseName: course?.title ?? 'their course',
      institutionName: institution?.name ?? 'the institution',
    };
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

  /** Unscoped counterpart to `ownedDraftApplication`, for admin call sites. */
  private async draftApplicationById(id: string): Promise<Application> {
    const application = await this.applicationById(id);
    if (application.status !== ApplicationStatus.Draft) {
      throw new ConflictException('Documents can only be attached while the application is a draft.');
    }
    return application;
  }

  /** Unscoped, status-agnostic lookup — for admin call sites that aren't limited to drafts. */
  private async applicationById(id: string): Promise<Application> {
    const application = await this.applications.findOne({ where: { id } });
    if (!application) throw new NotFoundException('No application with that id.');
    return application;
  }

  /**
   * `readyToSubmit` requires every required type to be *approved*, not
   * merely attached — attaching only ever required `uploaded`
   * (`attachDocument`), so a freshly-attached document pending review
   * still leaves its type in `missingDocumentTypes` here.
   */
  private async withGates(application: Application): Promise<ApplicationWithGates> {
    const links = await this.applicationDocuments.find({ where: { applicationId: application.id } });
    const attachedDocumentIds = links.map((link) => link.documentId);

    const attached = await this.documents.findApprovedByStudentId(
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

    const adminIds = [...new Set(applications.flatMap(row => row.assignedAdminId ? [row.assignedAdminId] : []))];
    const [studentSummaries, courses, institutions, tenants, admins] = await Promise.all([
      this.students.getSummariesForAdmin(studentIds),
      this.courses.find({ where: { id: In(courseIds) } }),
      this.institutions.find({ where: { id: In(institutionIds) } }),
      this.tenants.find({ where: { id: In(tenantIds) } }),
      adminIds.length ? this.applications.manager.findBy(Admin, { id: In(adminIds) }) : Promise.resolve([]),
    ]);

    const courseTitleById = new Map(courses.map((course) => [course.id, course.title]));
    const institutionNameById = new Map(institutions.map((institution) => [institution.id, institution.name]));
    const tenantNameById = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));

    const adminNames = new Map(admins.map(admin => [admin.id, `${admin.firstName} ${admin.lastName}`]));
    return applications.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      tenantName: tenantNameById.get(row.tenantId) ?? 'Unknown tenant',
      assignedAdminId: row.assignedAdminId ?? null,
      assignedAdminName: row.assignedAdminId ? adminNames.get(row.assignedAdminId) ?? null : null,
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
