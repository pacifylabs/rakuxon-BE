import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditLogController } from './audit-log.controller';
import { AuditLogInterceptor } from './audit-log.interceptor';
import { AuditLogService } from './audit-log.service';
import { AuditLog } from './entities/audit-log.entity';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { Admin } from '../admins/entities/admin.entity';
import { Permission } from '../admins/entities/permission.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, Admin, Permission]), AdminAuthModule],
  controllers: [AuditLogController],
  providers: [
    AuditLogService,
    /* Registered here, not in AppModule: AuditLogInterceptor's own dependencies
       (the Admin/Permission repositories) only resolve within this module's
       injector scope. */
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  ],
  exports: [AuditLogService],
})
export class AuditLogModule {}
