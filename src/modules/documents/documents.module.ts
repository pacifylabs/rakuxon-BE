import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminDocumentsController } from './admin-documents.controller';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { Document } from './entities/document.entity';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { NotificationsInboxModule } from '../notifications-inbox/notifications-inbox.module';
import { StudentsModule } from '../students/students.module';

@Module({
  imports: [TypeOrmModule.forFeature([Document]), StudentsModule, NotificationsInboxModule, AdminAuthModule],
  controllers: [DocumentsController, AdminDocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
