import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminDestinationsController } from './admin-destinations.controller';
import { Destination } from './entities/destination.entity';
import { DestinationsController } from './destinations.controller';
import { DestinationsService } from './destinations.service';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Destination]), AdminAuthModule],
  controllers: [DestinationsController, AdminDestinationsController],
  providers: [DestinationsService],
})
export class DestinationsModule {}
