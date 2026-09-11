import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';

import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { ConfigModule } from './common/config/config.module';
import { HealthModule } from './common/health/health.module';
import { NotificationsModule } from './common/notifications/notifications.module';
import { RolesGuard } from './common/rbac/roles.guard';
import { TenantResolutionMiddleware } from './common/tenancy/tenant-resolution.middleware';
import { SyncIndexesService } from './database/sync-indexes.service';
import { buildDataSourceOptions } from './database/data-source';
import { AdminAuthModule } from './modules/admin-auth/admin-auth.module';
import { AdminsModule } from './modules/admins/admins.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogueModule } from './modules/catalogue/catalogue.module';
import { AdminDashboardModule } from './modules/dashboard/admin-dashboard.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { OnboardingLinksModule } from './modules/onboarding-links/onboarding-links.module';
import { StudentsModule } from './modules/students/students.module';
import { TenantsModule } from './modules/tenants/tenants.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({ useFactory: () => buildDataSourceOptions() }),
    NotificationsModule,
    HealthModule,
    AuthModule,
    CatalogueModule,
    OnboardingLinksModule,
    StudentsModule,
    DocumentsModule,
    ApplicationsModule,
    AdminAuthModule,
    AdminsModule,
    TenantsModule,
    AdminDashboardModule,
  ],
  providers: [
    SyncIndexesService,
    /* Closed by default: a route is authenticated unless it says @Public(). */
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantResolutionMiddleware).forRoutes('*');
  }
}
