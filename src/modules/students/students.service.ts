import { adminSetPassword } from '../auth/admin-set-password';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import type {
  AdminCreateStudentDto,
  AdminStudentDetailDto,
  AdminStudentSummaryDto,
  ListAdminStudentsQueryDto,
  UpdateStudentAdminDto,
} from './dto/admin-student.dto';
import type { UpdateStudentProfileDto } from './dto/student.dto';
import { Student } from './entities/student.entity';
import { definedEntries } from '../../common/utils/defined-entries';
import type { AuthenticatedUser } from '../../common/auth/authenticated-request';
import { PasswordService } from '../auth/password.service';
import { HOUSE_TENANT_ID } from '../../contract/constants';
import { Role, UserStatus } from '../../contract/enums';
import { User } from '../users/entities/user.entity';

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageCount: number;
}

/** Fields that gate `profileCompletedAt` — what admission processing needs. */
const REQUIRED_FOR_COMPLETION = [
  'dateOfBirth',
  'nationality',
  'phone',
  'intendedStudyLevel',
  'intendedCountry',
  'preferredIntake',
] as const;

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(Student) private readonly students: Repository<Student>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly passwords: PasswordService,
  ) {}

  /**
   * An admin bringing in a student the partner already has elsewhere — a
   * real password set directly, no self-verification needed since the admin
   * is vouching for the account. Mirrors `AuthService.createStudentAccount`
   * (User + Student in one transaction) but issues no session: the admin is
   * not the student, and should never end up signed in as one.
   */
  async createByAdmin(dto: AdminCreateStudentDto): Promise<AdminStudentDetailDto> {
    const tenantId = dto.tenantId ?? HOUSE_TENANT_ID;
    const passwordHash = await this.passwords.hash(dto.password);

    const studentId = await this.dataSource.transaction(async (m) => {
      if (await m.exists(User, { where: { tenantId, email: dto.email } })) {
        throw new ConflictException('That email is already registered.');
      }

      const user = await m.save(
        User,
        m.create(User, {
          tenantId,
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          passwordHash,
          role: Role.Student,
          status: UserStatus.Active,
          emailVerifiedAt: new Date(),
        }),
      );

      const student = await m.save(Student, m.create(Student, { tenantId, userId: user.id }));
      return student.id;
    });

    return this.getAdminDetail(studentId);
  }

  /** An admin setting a student's password directly — a reset done for them, not by them. */
  async setPassword(id: string, password: string): Promise<void> {
    const student = await this.students.findOne({ where: { id } });
    if (!student) throw new NotFoundException('No student with that id.');

    const passwordHash = await this.passwords.hash(password);
    await adminSetPassword(this.dataSource, student.userId, passwordHash);
  }

  /** A cheap, frequent poll — updates `lastSeenAt` only, never a full entity save. */
  async heartbeat(user: AuthenticatedUser): Promise<void> {
    await this.users.update({ id: user.id }, { lastSeenAt: new Date() });
  }

  async getOwnProfile(user: AuthenticatedUser): Promise<Student> {
    const student = await this.students.findOne({
      where: { userId: user.id, tenantId: user.tenantId ?? undefined },
    });

    /* Should not happen post-registration — createStudentAccount() always
       creates the matching row in the same transaction as the User. */
    if (!student) throw new NotFoundException('No student profile for this account.');

    return student;
  }

  async updateOwnProfile(
    user: AuthenticatedUser,
    patch: UpdateStudentProfileDto,
  ): Promise<Student> {
    const student = await this.getOwnProfile(user);
    return this.students.save(this.applyPatch(student, patch));
  }

  /**
   * Same partial-update contract as `updateOwnProfile`, for an admin acting
   * on a student's behalf — a phoned-in correction, or a document the
   * student cannot upload themselves. No separate trust check here: the
   * controller's `students.manage` permission is the gate.
   */
  async updateAdmin(id: string, patch: UpdateStudentAdminDto): Promise<AdminStudentDetailDto> {
    const student = await this.students.findOne({ where: { id } });
    if (!student) throw new NotFoundException('No student with that id.');

    const { email, firstName, lastName, ...profilePatch } = patch;
    if (email !== undefined || firstName !== undefined || lastName !== undefined) {
      await this.updateAccountFields(student, { email, firstName, lastName });
    }

    const saved = await this.students.save(this.applyPatch(student, profilePatch));
    return this.getAdminDetail(saved.id);
  }

  /** The `User` half of an admin edit — email/name live on the account, not the applicant profile. */
  private async updateAccountFields(
    student: Student,
    patch: { email?: string; firstName?: string; lastName?: string },
  ): Promise<void> {
    const user = await this.users.findOne({ where: { id: student.userId } });
    if (!user) throw new NotFoundException('No student with that id.');

    if (patch.email !== undefined && patch.email !== user.email) {
      if (await this.users.exist({ where: { tenantId: student.tenantId, email: patch.email } })) {
        throw new ConflictException('That email is already registered.');
      }
      user.email = patch.email;
    }
    if (patch.firstName !== undefined) user.firstName = patch.firstName;
    if (patch.lastName !== undefined) user.lastName = patch.lastName;

    await this.users.save(user);
  }

  private applyPatch(student: Student, patch: UpdateStudentProfileDto | UpdateStudentAdminDto): Student {
    const merged: Student = {
      ...student,
      ...definedEntries(patch),
      /* A patch replaces the whole address/list, it does not deep-merge one
         field into it — the client always sends what it wants the field to
         become, same as every other column here. */
      address: patch.address ?? student.address,
      educationHistory: patch.educationHistory ?? student.educationHistory,
    };

    /* Sticky: once complete, a later edit that blanks a field (e.g. clearing
       a typo) does not silently re-lock a submission that is already in
       flight. Re-verification, if ever needed, is a deliberate product
       decision, not a side effect of an edit. */
    if (!student.profileCompletedAt && this.isComplete(merged)) {
      merged.profileCompletedAt = new Date();
    }

    return merged;
  }

  private isComplete(student: Student): boolean {
    return (
      REQUIRED_FOR_COMPLETION.every((field) => Boolean(student[field])) &&
      student.educationHistory.length > 0
    );
  }

  async listAdmin(query: ListAdminStudentsQueryDto): Promise<Paged<AdminStudentSummaryDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;

    const builder = this.students
      .createQueryBuilder('s')
      .innerJoin(User, 'u', 'u.id = s."userId"')
      .select([
        's.id AS id',
        's."userId" AS "userId"',
        's."tenantId" AS "tenantId"',
        's."profileCompletedAt" AS "profileCompletedAt"',
        's."createdAt" AS "createdAt"',
        'u.email AS email',
        'u."firstName" AS "firstName"',
        'u."lastName" AS "lastName"',
        '(SELECT COUNT(*) FROM applications a WHERE a."studentId" = s.id) AS "applicationsCount"',
      ]);

    if (query.q?.trim()) {
      const term = `%${query.q.trim()}%`;
      builder.andWhere('(u."firstName" ILIKE :term OR u."lastName" ILIKE :term OR u.email ILIKE :term)', {
        term,
      });
    }

    const total = await builder.getCount();

    const rows = await builder
      .orderBy('u."lastName"', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<{
        id: string;
        userId: string;
        tenantId: string;
        profileCompletedAt: Date | null;
        createdAt: Date;
        email: string;
        firstName: string;
        lastName: string;
        applicationsCount: string;
      }>();

    return {
      items: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        email: row.email,
        fullName: `${row.firstName} ${row.lastName}`.trim(),
        tenantId: row.tenantId,
        profileCompletedAt: row.profileCompletedAt ? new Date(row.profileCompletedAt).toISOString() : null,
        createdAt: new Date(row.createdAt).toISOString(),
        applicationsCount: Number(row.applicationsCount),
      })),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getAdminDetail(id: string): Promise<AdminStudentDetailDto> {
    const student = await this.students.findOne({ where: { id } });
    if (!student) throw new NotFoundException('No student with that id.');

    const user = await this.users.findOne({ where: { id: student.userId } });
    if (!user) throw new NotFoundException('No student with that id.');

    return {
      id: student.id,
      userId: student.userId,
      tenantId: student.tenantId,
      email: user.email,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      firstName: user.firstName,
      lastName: user.lastName,
      dateOfBirth: student.dateOfBirth,
      nationality: student.nationality,
      phone: student.phone,
      passportNumber: student.passportNumber,
      address: student.address,
      educationHistory: student.educationHistory,
      intendedStudyLevel: student.intendedStudyLevel,
      intendedCountry: student.intendedCountry,
      preferredIntake: student.preferredIntake,
      profileCompletedAt: student.profileCompletedAt ? student.profileCompletedAt.toISOString() : null,
    };
  }

  /** Batched name/email lookup for enriching another list (e.g. applications) — one query, not N. */
  async getSummariesForAdmin(ids: string[]): Promise<Map<string, { fullName: string; email: string }>> {
    if (ids.length === 0) return new Map();

    const rows = await this.students
      .createQueryBuilder('s')
      .innerJoin(User, 'u', 'u.id = s."userId"')
      .select(['s.id AS id', 'u.email AS email', 'u."firstName" AS "firstName"', 'u."lastName" AS "lastName"'])
      .where('s.id IN (:...ids)', { ids })
      .getRawMany<{ id: string; email: string; firstName: string; lastName: string }>();

    return new Map(
      rows.map((row) => [row.id, { fullName: `${row.firstName} ${row.lastName}`.trim(), email: row.email }]),
    );
  }
}
