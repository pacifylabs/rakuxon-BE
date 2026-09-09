import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CatalogueService } from './catalogue.service';
import { SearchQueryDto, SearchResponseDto } from './dto/search.dto';
import { Public } from '../../common/auth/public.decorator';

@ApiTags('catalogue')
@Controller('catalogue')
export class CatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  /**
   * Typeahead across the whole catalogue.
   *
   * Public: this feeds the search box on the marketing site, which has to work
   * before anyone has an account. It returns only published records and no
   * tenant-scoped data of any kind.
   */
  @Public()
  @Get('search')
  @ApiOperation({
    summary: 'Search universities, courses and guidance',
    description:
      'One ranked list across all three. Returns nothing for a query under two ' +
      'characters, since a shorter one matches most of the catalogue.',
  })
  @ApiOkResponse({ type: SearchResponseDto })
  search(@Query() query: SearchQueryDto): Promise<SearchResponseDto> {
    return this.catalogue.search(query.query, query.limit);
  }
}
