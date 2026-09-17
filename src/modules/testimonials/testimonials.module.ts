import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminTestimonialsController } from './admin-testimonials.controller';
import { Testimonial } from './entities/testimonial.entity';
import { TestimonialsController } from './testimonials.controller';
import { TestimonialsService } from './testimonials.service';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Testimonial]), AdminAuthModule],
  controllers: [TestimonialsController, AdminTestimonialsController],
  providers: [TestimonialsService],
})
export class TestimonialsModule {}
