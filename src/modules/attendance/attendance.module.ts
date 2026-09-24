import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminAttendanceController } from './admin-attendance.controller';
import { AttendanceRecord } from './entities/attendance-record.entity';
import { AttendanceService } from './attendance.service';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { Admin } from '../admins/entities/admin.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AttendanceRecord, Admin]), AdminAuthModule],
  controllers: [AdminAttendanceController],
  providers: [AttendanceService],
})
export class AttendanceModule {}
