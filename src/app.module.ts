import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';

import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { ConfigModule } from './common/config/config.module';
import { HealthModule } from './common/health/health.module';
import { RolesGuard } from './common/rbac/roles.guard';
import { TenantResolutionMiddleware } from './common/tenancy/tenant-resolution.middleware';
import { buildDataSourceOptions } from './database/data-source';
import { AuthModule } from './modules/auth/auth.module';
import { OnboardingLinksModule } from './modules/onboarding-links/onboarding-links.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({ useFactory: () => buildDataSourceOptions() }),
    HealthModule,
    AuthModule,
    OnboardingLinksModule,
  ],
  providers: [
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
