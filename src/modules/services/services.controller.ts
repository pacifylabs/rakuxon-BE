import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ServiceDto } from './dto/service.dto';
import { ServicesService } from './services.service';
import { Public } from '../../common/auth/public.decorator';

/** Public: feeds the /services page and its per-service detail pages. */
@ApiTags('services')
@Controller('services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List published services' })
  @ApiOkResponse({ type: [ServiceDto] })
  list(): Promise<ServiceDto[]> {
    return this.services.listPublished();
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Get a published service by slug' })
  @ApiOkResponse({ type: ServiceDto })
  getBySlug(@Param('slug') slug: string): Promise<ServiceDto> {
    return this.services.getPublishedBySlug(slug);
  }
}
