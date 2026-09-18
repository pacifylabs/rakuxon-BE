import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Tenant } from './entities/tenant.entity';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { PasswordService } from '../auth/password.service';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, User]), AdminAuthModule, AuditLogModule],
  controllers: [TenantsController],
  providers: [TenantsService, PasswordService],
  exports: [TenantsService],
})
export class TenantsModule {}
