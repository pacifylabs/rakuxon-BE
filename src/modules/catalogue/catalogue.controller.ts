import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CatalogueService } from './catalogue.service';
import {
  CountryCountDto,
  CountryDto,
  InstitutionListDto,
  ListInstitutionsQueryDto,
} from './dto/institution.dto';
import { ArticleDetailDto, ArticleListDto, ListArticlesQueryDto } from './dto/article.dto';
import { CourseDetailDto, CourseListDto, ListCoursesQueryDto } from './dto/course.dto';
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

  /**
   * The full reference list — every country, not just the ones with a
   * published university. Feeds a profile or address form's dropdown, so a
   * student's nationality isn't limited to where the catalogue operates.
   */
  @Public()
  @Get('countries/reference')
  @ApiOperation({ summary: 'Every country, for a form dropdown' })
  @ApiOkResponse({ type: [CountryDto] })
  referenceCountries(): Promise<CountryDto[]> {
    return this.catalogue.referenceCountries();
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
  institution(@Param('slug') slug: string): Promise<Institution & { courseCount: number }> {
    return this.catalogue.institutionBySlug(slug);
  }

  @Public()
  @Get('courses')
  @ApiOperation({
    summary: 'Browse courses',
    description:
      'Filter by country, level, discipline, institution or free text. Only courses at ' +
      'published institutions are returned.',
  })
  @ApiOkResponse({ type: CourseListDto })
  listCourses(@Query() query: ListCoursesQueryDto): Promise<CourseListDto> {
    return this.catalogue.listCourses(query);
  }

  @Public()
  @Get('courses/:slug')
  @ApiOperation({ summary: 'One course, with its university' })
  @ApiOkResponse({ type: CourseDetailDto })
  @ApiNotFoundResponse({ description: 'No published course, at a published university, with that slug.' })
  course(@Param('slug') slug: string): Promise<CourseDetailDto> {
    return this.catalogue.courseBySlug(slug);
  }

  @Public()
  @Get('articles')
  @ApiOperation({
    summary: 'Published guidance, newest first',
    description: 'Filterable by destination or tag. Cards only — bodies come from the detail route.',
  })
  @ApiOkResponse({ type: ArticleListDto })
  listArticles(@Query() query: ListArticlesQueryDto): Promise<ArticleListDto> {
    return this.catalogue.listArticles(query);
  }

  @Public()
  @Get('articles/:slug')
  @ApiOperation({ summary: 'One article, with its body' })
  @ApiOkResponse({ type: ArticleDetailDto })
  @ApiNotFoundResponse({ description: 'No published article with that slug.' })
  article(@Param('slug') slug: string): Promise<ArticleDetailDto> {
    return this.catalogue.articleBySlug(slug);
  }
}
