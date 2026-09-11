import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { Application } from '../applications/entities/application.entity';
import { Article } from '../catalogue/entities/article.entity';
import { Course } from '../catalogue/entities/course.entity';
import { Institution } from '../catalogue/entities/institution.entity';
import { Student } from '../students/entities/student.entity';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { Tenant } from '../tenants/entities/tenant.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, Institution, Course, Article, Student, Application]),
    AdminAuthModule,
  ],
  controllers: [AdminDashboardController],
  providers: [AdminDashboardService],
})
export class AdminDashboardModule {}
