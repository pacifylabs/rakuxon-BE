import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminApplicationsController } from './admin-applications.controller';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { ApplicationDocument } from './entities/application-document.entity';
import { Application } from './entities/application.entity';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { Course } from '../catalogue/entities/course.entity';
import { Institution } from '../catalogue/entities/institution.entity';
import { DocumentsModule } from '../documents/documents.module';
import { NotificationsInboxModule } from '../notifications-inbox/notifications-inbox.module';
import { NotificationTemplatesModule } from '../notification-templates/notification-templates.module';
import { StudentsModule } from '../students/students.module';
import { Tenant } from '../tenants/entities/tenant.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Application, ApplicationDocument, Course, Institution, Tenant]),
    StudentsModule,
    DocumentsModule,
    NotificationsInboxModule,
    NotificationTemplatesModule,
    AdminAuthModule,
    AuditLogModule,
  ],
  controllers: [ApplicationsController, AdminApplicationsController],
  providers: [ApplicationsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
