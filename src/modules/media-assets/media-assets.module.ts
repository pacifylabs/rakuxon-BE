import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminMediaAssetsController } from './admin-media-assets.controller';
import { MediaAsset } from './entities/media-asset.entity';
import { MediaAssetsService } from './media-assets.service';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { Admin } from '../admins/entities/admin.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MediaAsset, Admin]), AdminAuthModule],
  controllers: [AdminMediaAssetsController],
  providers: [MediaAssetsService],
})
export class MediaAssetsModule {}
