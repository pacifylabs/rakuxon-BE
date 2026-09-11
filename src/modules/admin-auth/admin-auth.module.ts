import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminPasswordResetToken } from './entities/admin-password-reset-token.entity';
import { AdminRefreshToken } from './entities/admin-refresh-token.entity';
import { AdminTokenService } from './admin-token.service';
import { AdminJwtAuthGuard } from '../../common/auth/admin-jwt-auth.guard';
import { PermissionGuard } from '../../common/rbac/permission.guard';
import { Admin } from '../admins/entities/admin.entity';
import { AdminPermission } from '../admins/entities/admin-permission.entity';
import { Permission } from '../admins/entities/permission.entity';
import { PasswordService } from '../auth/password.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Admin, AdminRefreshToken, AdminPasswordResetToken, Permission, AdminPermission]),
    JwtModule.register({}),
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminTokenService, PasswordService, AdminJwtAuthGuard, PermissionGuard],
  /*
   * AdminJwtAuthGuard and PermissionGuard are exported so every admin-facing
   * controller module (tenants, admin-catalogue, admin-applications, admins)
   * can import this module and reference them in @UseGuards — the same way
   * OnboardingLinksModule already imports AuthModule for AuthService.
   */
  exports: [AdminAuthService, AdminTokenService, AdminJwtAuthGuard, PermissionGuard],
})
export class AdminAuthModule {}
