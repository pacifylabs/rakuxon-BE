import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ListTestimonialsQueryDto, TestimonialDto } from './dto/testimonial.dto';
import { TestimonialsService } from './testimonials.service';
import { Public } from '../../common/auth/public.decorator';

/** Public: feeds the homepage and students-page testimonial sections. */
@ApiTags('testimonials')
@Controller('testimonials')
export class TestimonialsController {
  constructor(private readonly testimonials: TestimonialsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List published testimonials for a page placement' })
  @ApiOkResponse({ type: [TestimonialDto] })
  list(@Query() query: ListTestimonialsQueryDto): Promise<TestimonialDto[]> {
    return this.testimonials.listPublished(query);
  }
}
