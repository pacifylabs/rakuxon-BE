import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CatalogueService } from './catalogue.service';
import {
  CountryCountDto,
  InstitutionListDto,
  ListInstitutionsQueryDto,
} from './dto/institution.dto';
import { SearchQueryDto, SearchResponseDto } from './dto/search.dto';
import { Institution } from './entities/institution.entity';
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

  /**
   * The country menu.
   *
   * Counted from the same published set the listing reads, so a country in the
   * menu always has universities behind it.
   */
  @Public()
  @Get('countries')
  @ApiOperation({ summary: 'Destinations with a published institution count' })
  @ApiOkResponse({ type: [CountryCountDto] })
  countries(): Promise<CountryCountDto[]> {
    return this.catalogue.countries();
  }

  @Public()
  @Get('institutions')
  @ApiOperation({
    summary: 'Browse universities',
    description: 'Filter by country and free text. Only published records are returned.',
  })
  @ApiOkResponse({ type: InstitutionListDto })
  listInstitutions(@Query() query: ListInstitutionsQueryDto): Promise<InstitutionListDto> {
    return this.catalogue.listInstitutions(query);
  }

  /*
   * Declared after 'countries' and 'institutions' on purpose: Nest matches in
   * declaration order, so a parameter route placed first would swallow both.
   */
  @Public()
  @Get('institutions/:slug')
  @ApiOperation({ summary: 'One university' })
  @ApiOkResponse({ type: Institution })
  @ApiNotFoundResponse({ description: 'No published university with that slug.' })
  institution(@Param('slug') slug: string): Promise<Institution> {
    return this.catalogue.institutionBySlug(slug);
  }
}
