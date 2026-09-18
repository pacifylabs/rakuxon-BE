import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { DestinationCardDto, DestinationDto } from './dto/destination.dto';
import { DestinationsService } from './destinations.service';
import { Public } from '../../common/auth/public.decorator';

/** Public: feeds /destinations and /destinations/[slug]. */
@ApiTags('destinations')
@Controller('destinations')
export class DestinationsController {
  constructor(private readonly destinations: DestinationsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List published destination guides, for the /destinations grid' })
  @ApiOkResponse({ type: [DestinationCardDto] })
  list(): Promise<DestinationCardDto[]> {
    return this.destinations.listPublished();
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'One published destination guide, in full' })
  @ApiOkResponse({ type: DestinationDto })
  getBySlug(@Param('slug') slug: string): Promise<DestinationDto> {
    return this.destinations.getPublishedBySlug(slug);
  }
}
