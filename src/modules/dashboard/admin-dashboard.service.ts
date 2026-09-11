import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, ObjectLiteral, Repository } from 'typeorm';

import { AdminDashboardSummaryDto, StatusCountDto } from './dto/admin-dashboard.dto';
import { Application } from '../applications/entities/application.entity';
import { Article } from '../catalogue/entities/article.entity';
import { Course } from '../catalogue/entities/course.entity';
import { Institution } from '../catalogue/entities/institution.entity';
import { Student } from '../students/entities/student.entity';
import { Tenant } from '../tenants/entities/tenant.entity';

@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(Institution) private readonly institutions: Repository<Institution>,
    @InjectRepository(Course) private readonly courses: Repository<Course>,
    @InjectRepository(Article) private readonly articles: Repository<Article>,
    @InjectRepository(Student) private readonly students: Repository<Student>,
    @InjectRepository(Application) private readonly applications: Repository<Application>,
  ) {}

  async getSummary(): Promise<AdminDashboardSummaryDto> {
    const [
      totalTenants,
      totalInstitutions,
      totalCourses,
      totalArticles,
      totalStudents,
      totalApplications,
      tenantsByStatus,
      institutionsByStatus,
      applicationsByStatus,
      studentsWithCompleteProfile,
      studentsWithIncompleteProfile,
    ] = await Promise.all([
      this.tenants.count(),
      this.institutions.count(),
      this.courses.count(),
      this.articles.count(),
      this.students.count(),
      this.applications.count(),
      this.countByStatus(this.tenants),
      this.countByStatus(this.institutions),
      this.countByStatus(this.applications),
      this.students.count({ where: { profileCompletedAt: Not(IsNull()) } }),
      this.students.count({ where: { profileCompletedAt: IsNull() } }),
    ]);

    return {
      totalTenants,
      totalInstitutions,
      totalCourses,
      totalArticles,
      totalStudents,
      totalApplications,
      tenantsByStatus,
      institutionsByStatus,
      applicationsByStatus,
      studentsWithCompleteProfile,
      studentsWithIncompleteProfile,
    };
  }

  private async countByStatus<T extends ObjectLiteral>(repo: Repository<T>): Promise<StatusCountDto[]> {
    const rows = await repo
      .createQueryBuilder('row')
      .select('row.status', 'key')
      .addSelect('COUNT(*)', 'count')
      .groupBy('row.status')
      .getRawMany<{ key: string; count: string }>();

    return rows.map((row) => ({ key: row.key, count: Number(row.count) }));
  }
}
