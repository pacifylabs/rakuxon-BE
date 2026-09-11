import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminsController } from './admins.controller';
import { AdminsService } from './admins.service';
import { Admin } from './entities/admin.entity';
import { AdminPermission } from './entities/admin-permission.entity';
import { Permission } from './entities/permission.entity';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { PasswordService } from '../auth/password.service';

@Module({
  imports: [TypeOrmModule.forFeature([Admin, AdminPermission, Permission]), AdminAuthModule],
  controllers: [AdminsController],
  providers: [AdminsService, PasswordService],
})
export class AdminsModule {}
