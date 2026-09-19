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
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogueModule } from './modules/catalogue/catalogue.module';
import { AdminDashboardModule } from './modules/dashboard/admin-dashboard.module';
import { DestinationsModule } from './modules/destinations/destinations.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { NotificationsInboxModule } from './modules/notifications-inbox/notifications-inbox.module';
import { NotificationTemplatesModule } from './modules/notification-templates/notification-templates.module';
import { OnboardingLinksModule } from './modules/onboarding-links/onboarding-links.module';
import { StudentsModule } from './modules/students/students.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { ServicesModule } from './modules/services/services.module';
import { SiteSettingsModule } from './modules/site-settings/site-settings.module';
import { TestimonialsModule } from './modules/testimonials/testimonials.module';
import { UploadsModule } from './modules/uploads/uploads.module';

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
    NotificationsInboxModule,
    NotificationTemplatesModule,
    DocumentsModule,
    ApplicationsModule,
    AuditLogModule,
    AdminAuthModule,
    AdminsModule,
    TenantsModule,
    AdminDashboardModule,
    TestimonialsModule,
    ServicesModule,
    SiteSettingsModule,
    UploadsModule,
    DestinationsModule,
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
