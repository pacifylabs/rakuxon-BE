import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminCatalogueService } from './admin-catalogue.service';
import {
  AdminArticleDetailDto,
  AdminArticleListDto,
  AdminArticleSummaryDto,
  AdminCountryDto,
  AdminCourseDetailDto,
  AdminCourseListDto,
  AdminCourseSummaryDto,
  AdminInstitutionDetailDto,
  AdminInstitutionListDto,
  AdminInstitutionSummaryDto,
  CreateArticleDto,
  CreateCourseDto,
  CreateInstitutionDto,
  ListAdminArticlesQueryDto,
  ListAdminCoursesQueryDto,
  ListAdminInstitutionsQueryDto,
  UpdateArticleDto,
  UpdateCourseDto,
  UpdateInstitutionDto,
} from './dto/admin-catalogue.dto';
import { AdminJwtAuthGuard } from '../../common/auth/admin-jwt-auth.guard';
import { Public } from '../../common/auth/public.decorator';
import { PermissionGuard } from '../../common/rbac/permission.guard';
import { RequirePermission } from '../../common/rbac/require-permission.decorator';
import { PublishStatus } from '../../contract/enums';

/**
 * Catalogue moderation. @Public() opts every route out of the global,
 * users-table JwtAuthGuard; AdminJwtAuthGuard + PermissionGuard do the real
 * auth here. Addressed by id, not slug: a draft may have no stable
 * public-facing slug workflow yet.
 */
@ApiTags('admin-catalogue')
@Controller('admin/catalogue')
@Public()
@UseGuards(AdminJwtAuthGuard, PermissionGuard)
@ApiBearerAuth('admin-access-token')
export class AdminCatalogueController {
  constructor(private readonly catalogue: AdminCatalogueService) {}

  @Post('institutions')
  @RequirePermission('catalogue.publish')
  @ApiOperation({ summary: 'Create an institution', description: 'Starts life as draft, with just the required fields — everything else is filled in on the edit screen afterwards.' })
  @ApiCreatedResponse({ type: AdminInstitutionDetailDto })
  @ApiConflictResponse({ description: 'That slug is already taken.' })
  createInstitution(@Body() dto: CreateInstitutionDto): Promise<AdminInstitutionDetailDto> {
    return this.catalogue.createInstitution(dto);
  }

  @Get('institutions')
  @RequirePermission('catalogue.view')
  @ApiOperation({ summary: 'List institutions, including drafts and suspended records' })
  @ApiOkResponse({ type: AdminInstitutionListDto })
  listInstitutions(@Query() query: ListAdminInstitutionsQueryDto): Promise<AdminInstitutionListDto> {
    return this.catalogue.listInstitutions(query);
  }

  @Get('institutions/:id/detail')
  @RequirePermission('catalogue.view')
  @ApiOperation({ summary: 'One institution, every field' })
  @ApiOkResponse({ type: AdminInstitutionDetailDto })
  @ApiNotFoundResponse({ description: 'No institution with that id.' })
  getInstitutionDetail(@Param('id') id: string): Promise<AdminInstitutionDetailDto> {
    return this.catalogue.getInstitutionDetail(id);
  }

  @Patch('institutions/:id')
  @RequirePermission('catalogue.publish')
  @ApiOperation({ summary: "Update an institution's own fields" })
  @ApiOkResponse({ type: AdminInstitutionDetailDto })
  @ApiNotFoundResponse({ description: 'No institution with that id.' })
  @ApiConflictResponse({ description: 'That slug is already taken.' })
  updateInstitution(@Param('id') id: string, @Body() dto: UpdateInstitutionDto): Promise<AdminInstitutionDetailDto> {
    return this.catalogue.updateInstitution(id, dto);
  }

  @Get('institutions/:id')
  @RequirePermission('catalogue.view')
  @ApiOperation({ summary: 'One institution, any status' })
  @ApiOkResponse({ type: AdminInstitutionSummaryDto })
  @ApiNotFoundResponse({ description: 'No institution with that id.' })
  getInstitution(@Param('id') id: string): Promise<AdminInstitutionSummaryDto> {
    return this.catalogue.getInstitution(id);
  }

  @Post('institutions/:id/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('catalogue.publish')
  @ApiOperation({ summary: 'Publish an institution' })
  @ApiOkResponse({ type: AdminInstitutionSummaryDto })
  @ApiForbiddenResponse({ description: 'Missing the catalogue.publish permission.' })
  publishInstitution(@Param('id') id: string): Promise<AdminInstitutionSummaryDto> {
    return this.catalogue.setInstitutionStatus(id, PublishStatus.Published);
  }

  @Post('institutions/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('catalogue.suspend')
  @ApiOperation({ summary: 'Suspend an institution' })
  @ApiOkResponse({ type: AdminInstitutionSummaryDto })
  suspendInstitution(@Param('id') id: string): Promise<AdminInstitutionSummaryDto> {
    return this.catalogue.setInstitutionStatus(id, PublishStatus.Suspended);
  }

  @Post('institutions/:id/revert-to-draft')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('catalogue.publish')
  @ApiOperation({ summary: 'Revert an institution to draft' })
  @ApiOkResponse({ type: AdminInstitutionSummaryDto })
  revertInstitutionToDraft(@Param('id') id: string): Promise<AdminInstitutionSummaryDto> {
    return this.catalogue.setInstitutionStatus(id, PublishStatus.Draft);
  }

  @Post('courses')
  @RequirePermission('catalogue.publish')
  @ApiOperation({ summary: 'Create a course', description: 'Starts life as draft, with just the required fields — everything else is filled in on the edit screen afterwards.' })
  @ApiCreatedResponse({ type: AdminCourseDetailDto })
  @ApiConflictResponse({ description: 'That slug is already taken.' })
  @ApiNotFoundResponse({ description: 'No institution with that id.' })
  createCourse(@Body() dto: CreateCourseDto): Promise<AdminCourseDetailDto> {
    return this.catalogue.createCourse(dto);
  }

  @Get('courses')
  @RequirePermission('catalogue.view')
  @ApiOperation({ summary: 'List courses, including drafts and suspended records' })
  @ApiOkResponse({ type: AdminCourseListDto })
  listCourses(@Query() query: ListAdminCoursesQueryDto): Promise<AdminCourseListDto> {
    return this.catalogue.listCourses(query);
  }

  @Get('courses/:id/detail')
  @RequirePermission('catalogue.view')
  @ApiOperation({ summary: 'One course, every field' })
  @ApiOkResponse({ type: AdminCourseDetailDto })
  @ApiNotFoundResponse({ description: 'No course with that id.' })
  getCourseDetail(@Param('id') id: string): Promise<AdminCourseDetailDto> {
    return this.catalogue.getCourseDetail(id);
  }

  @Patch('courses/:id')
  @RequirePermission('catalogue.publish')
  @ApiOperation({ summary: "Update a course's own fields" })
  @ApiOkResponse({ type: AdminCourseDetailDto })
  @ApiNotFoundResponse({ description: 'No course with that id.' })
  @ApiConflictResponse({ description: 'That slug is already taken.' })
  updateCourse(@Param('id') id: string, @Body() dto: UpdateCourseDto): Promise<AdminCourseDetailDto> {
    return this.catalogue.updateCourse(id, dto);
  }

  @Get('courses/:id')
  @RequirePermission('catalogue.view')
  @ApiOperation({ summary: 'One course, any status' })
  @ApiOkResponse({ type: AdminCourseSummaryDto })
  @ApiNotFoundResponse({ description: 'No course with that id.' })
  getCourse(@Param('id') id: string): Promise<AdminCourseSummaryDto> {
    return this.catalogue.getCourse(id);
  }

  @Post('courses/:id/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('catalogue.publish')
  @ApiOperation({ summary: 'Publish a course' })
  @ApiOkResponse({ type: AdminCourseSummaryDto })
  publishCourse(@Param('id') id: string): Promise<AdminCourseSummaryDto> {
    return this.catalogue.setCourseStatus(id, PublishStatus.Published);
  }

  @Post('courses/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('catalogue.suspend')
  @ApiOperation({ summary: 'Suspend a course' })
  @ApiOkResponse({ type: AdminCourseSummaryDto })
  suspendCourse(@Param('id') id: string): Promise<AdminCourseSummaryDto> {
    return this.catalogue.setCourseStatus(id, PublishStatus.Suspended);
  }

  @Post('courses/:id/revert-to-draft')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('catalogue.publish')
  @ApiOperation({ summary: 'Revert a course to draft' })
  @ApiOkResponse({ type: AdminCourseSummaryDto })
  revertCourseToDraft(@Param('id') id: string): Promise<AdminCourseSummaryDto> {
    return this.catalogue.setCourseStatus(id, PublishStatus.Draft);
  }

  @Post('articles')
  @RequirePermission('catalogue.publish')
  @ApiOperation({ summary: 'Create an article', description: 'Starts life as draft.' })
  @ApiCreatedResponse({ type: AdminArticleDetailDto })
  @ApiConflictResponse({ description: 'That slug is already taken.' })
  createArticle(@Body() dto: CreateArticleDto): Promise<AdminArticleDetailDto> {
    return this.catalogue.createArticle(dto);
  }

  @Get('articles')
  @RequirePermission('catalogue.view')
  @ApiOperation({ summary: 'List articles, including drafts and suspended records' })
  @ApiOkResponse({ type: AdminArticleListDto })
  listArticles(@Query() query: ListAdminArticlesQueryDto): Promise<AdminArticleListDto> {
    return this.catalogue.listArticles(query);
  }

  @Get('articles/:id/detail')
  @RequirePermission('catalogue.view')
  @ApiOperation({ summary: 'One article, every field' })
  @ApiOkResponse({ type: AdminArticleDetailDto })
  @ApiNotFoundResponse({ description: 'No article with that id.' })
  getArticleDetail(@Param('id') id: string): Promise<AdminArticleDetailDto> {
    return this.catalogue.getArticleDetail(id);
  }

  @Patch('articles/:id')
  @RequirePermission('catalogue.publish')
  @ApiOperation({ summary: "Update an article's own fields" })
  @ApiOkResponse({ type: AdminArticleDetailDto })
  @ApiNotFoundResponse({ description: 'No article with that id.' })
  @ApiConflictResponse({ description: 'That slug is already taken.' })
  updateArticle(@Param('id') id: string, @Body() dto: UpdateArticleDto): Promise<AdminArticleDetailDto> {
    return this.catalogue.updateArticle(id, dto);
  }

  @Get('articles/:id')
  @RequirePermission('catalogue.view')
  @ApiOperation({ summary: 'One article, any status' })
  @ApiOkResponse({ type: AdminArticleSummaryDto })
  @ApiNotFoundResponse({ description: 'No article with that id.' })
  getArticle(@Param('id') id: string): Promise<AdminArticleSummaryDto> {
    return this.catalogue.getArticle(id);
  }

  @Post('articles/:id/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('catalogue.publish')
  @ApiOperation({ summary: 'Publish an article' })
  @ApiOkResponse({ type: AdminArticleSummaryDto })
  publishArticle(@Param('id') id: string): Promise<AdminArticleSummaryDto> {
    return this.catalogue.setArticleStatus(id, PublishStatus.Published);
  }

  @Post('articles/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('catalogue.suspend')
  @ApiOperation({ summary: 'Suspend an article' })
  @ApiOkResponse({ type: AdminArticleSummaryDto })
  suspendArticle(@Param('id') id: string): Promise<AdminArticleSummaryDto> {
    return this.catalogue.setArticleStatus(id, PublishStatus.Suspended);
  }

  @Post('articles/:id/revert-to-draft')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('catalogue.publish')
  @ApiOperation({ summary: 'Revert an article to draft' })
  @ApiOkResponse({ type: AdminArticleSummaryDto })
  revertArticleToDraft(@Param('id') id: string): Promise<AdminArticleSummaryDto> {
    return this.catalogue.setArticleStatus(id, PublishStatus.Draft);
  }

  @Get('countries')
  @RequirePermission('catalogue.view')
  @ApiOperation({ summary: 'Every reference country, not just the destinations' })
  @ApiOkResponse({ type: [AdminCountryDto] })
  listCountries(): Promise<AdminCountryDto[]> {
    return this.catalogue.listCountries();
  }

  @Post('countries/:code/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('catalogue.publish')
  @ApiOperation({ summary: 'Mark a country as one Rakuxon serves', description: 'Adds it to the "where do you want to study" dropdown.' })
  @ApiOkResponse({ type: AdminCountryDto })
  @ApiNotFoundResponse({ description: 'No country with that code.' })
  activateCountry(@Param('code') code: string): Promise<AdminCountryDto> {
    return this.catalogue.setCountryDestination(code, true);
  }

  @Post('countries/:code/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('catalogue.publish')
  @ApiOperation({ summary: 'Mark a country as one Rakuxon no longer serves' })
  @ApiOkResponse({ type: AdminCountryDto })
  @ApiNotFoundResponse({ description: 'No country with that code.' })
  deactivateCountry(@Param('code') code: string): Promise<AdminCountryDto> {
    return this.catalogue.setCountryDestination(code, false);
  }
}
