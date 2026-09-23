import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AgencyApplicationsController } from './agency-applications.controller';
import { AgencyDashboardController } from './agency-dashboard.controller';
import { AgencyStaffController } from './agency-staff.controller';
import { AgencyStudentsController } from './agency-students.controller';
import { AgencyService } from './agency.service';
import { ApplicationsModule } from '../applications/applications.module';
import { Application } from '../applications/entities/application.entity';
import { DocumentsModule } from '../documents/documents.module';
import { Student } from '../students/entities/student.entity';
import { StudentsModule } from '../students/students.module';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Student, Application]),
    StudentsModule,
    ApplicationsModule,
    TenantsModule,
    DocumentsModule,
  ],
  controllers: [
    AgencyDashboardController,
    AgencyStudentsController,
    AgencyApplicationsController,
    AgencyStaffController,
  ],
  providers: [AgencyService],
})
export class AgencyModule {}
