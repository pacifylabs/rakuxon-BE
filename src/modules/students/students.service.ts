import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { UpdateStudentProfileDto } from './dto/student.dto';
import { Student } from './entities/student.entity';
import type { AuthenticatedUser } from '../../common/auth/authenticated-request';

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
  constructor(@InjectRepository(Student) private readonly students: Repository<Student>) {}

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

    /*
     * class-transformer's plainToInstance sets every declared DTO field as an
     * own property, `undefined` where the request omitted it — so `...patch`
     * would overwrite an already-saved value with `undefined` for every field
     * this particular request didn't touch. definedEntries() is what makes a
     * PATCH partial rather than "whatever the client didn't mention gets
     * wiped in memory" (TypeORM's save() ignores undefined columns, so only
     * the in-memory object and the immediate response were ever wrong — the
     * database itself was never actually corrupted by this).
     */
    const merged: Student = {
      ...student,
      ...this.definedEntries(patch),
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

    return this.students.save(merged);
  }

  private isComplete(student: Student): boolean {
    return (
      REQUIRED_FOR_COMPLETION.every((field) => Boolean(student[field])) &&
      student.educationHistory.length > 0
    );
  }

  /** Only the keys the request actually set, dropping class-transformer's undefined fill-ins. */
  private definedEntries<T extends object>(source: T): Partial<T> {
    return Object.fromEntries(
      Object.entries(source).filter(([, value]) => value !== undefined),
    ) as Partial<T>;
  }
}
