import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminStudentsController } from './admin-students.controller';
import { Student } from './entities/student.entity';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { PasswordService } from '../auth/password.service';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Student, User]), AdminAuthModule],
  controllers: [StudentsController, AdminStudentsController],
  providers: [StudentsService, PasswordService],
  exports: [StudentsService],
})
export class StudentsModule {}
