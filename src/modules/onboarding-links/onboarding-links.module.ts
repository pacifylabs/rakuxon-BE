import { Module } from '@nestjs/common';
import { OnboardingLinksController } from './onboarding-links.controller';
import { OnboardingLinksService } from './onboarding-links.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [OnboardingLinksController],
  providers: [OnboardingLinksService],
})
export class OnboardingLinksModule {}
