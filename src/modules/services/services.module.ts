import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminServicesController } from './admin-services.controller';
import { Service } from './entities/service.entity';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Service]), AdminAuthModule],
  controllers: [ServicesController, AdminServicesController],
  providers: [ServicesService],
})
export class ServicesModule {}
