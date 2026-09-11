import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type {
  AdminStudentDetailDto,
  AdminStudentSummaryDto,
  ListAdminStudentsQueryDto,
  UpdateStudentAdminDto,
} from './dto/admin-student.dto';
import type { UpdateStudentProfileDto } from './dto/student.dto';
import { Student } from './entities/student.entity';
import { definedEntries } from '../../common/utils/defined-entries';
import type { AuthenticatedUser } from '../../common/auth/authenticated-request';
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
  ) {}

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

    const saved = await this.students.save(this.applyPatch(student, patch));
    return this.getAdminDetail(saved.id);
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
        'u.email AS email',
        'u."firstName" AS "firstName"',
        'u."lastName" AS "lastName"',
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
        email: string;
        firstName: string;
        lastName: string;
      }>();

    return {
      items: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        email: row.email,
        fullName: `${row.firstName} ${row.lastName}`.trim(),
        tenantId: row.tenantId,
        profileCompletedAt: row.profileCompletedAt ? new Date(row.profileCompletedAt).toISOString() : null,
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
