import { Module } from '@nestjs/common';

import { AdminUploadsController } from './admin-uploads.controller';
import { AdminUploadsService } from './uploads.service';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminUploadsController],
  providers: [AdminUploadsService],
})
export class UploadsModule {}
