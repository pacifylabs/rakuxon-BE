import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminApplicationsController } from './admin-applications.controller';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { ApplicationDocument } from './entities/application-document.entity';
import { Application } from './entities/application.entity';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { Course } from '../catalogue/entities/course.entity';
import { Institution } from '../catalogue/entities/institution.entity';
import { DocumentsModule } from '../documents/documents.module';
import { StudentsModule } from '../students/students.module';
import { Tenant } from '../tenants/entities/tenant.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Application, ApplicationDocument, Course, Institution, Tenant]),
    StudentsModule,
    DocumentsModule,
    AdminAuthModule,
  ],
  controllers: [ApplicationsController, AdminApplicationsController],
  providers: [ApplicationsService],
})
export class ApplicationsModule {}
