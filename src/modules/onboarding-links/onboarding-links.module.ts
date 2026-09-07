import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OnboardingLink } from './entities/onboarding-link.entity';
import { OnboardingLinksController } from './onboarding-links.controller';
import { OnboardingLinksService } from './onboarding-links.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([OnboardingLink]), AuthModule],
  controllers: [OnboardingLinksController],
  providers: [OnboardingLinksService],
})
export class OnboardingLinksModule {}
