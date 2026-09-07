import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ConfigModule } from './common/config/config.module';
import { HealthModule } from './common/health/health.module';
import { buildDataSourceOptions } from './database/data-source';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({ useFactory: () => buildDataSourceOptions() }),
    HealthModule,
  ],
})
export class AppModule {}
