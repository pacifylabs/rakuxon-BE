import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { ApplicationDocument } from './entities/application-document.entity';
import { Application } from './entities/application.entity';
import { Course } from '../catalogue/entities/course.entity';
import { DocumentsModule } from '../documents/documents.module';
import { StudentsModule } from '../students/students.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Application, ApplicationDocument, Course]),
    StudentsModule,
    DocumentsModule,
  ],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
})
export class ApplicationsModule {}
