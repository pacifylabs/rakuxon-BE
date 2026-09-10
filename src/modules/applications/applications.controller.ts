import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApplicationsService } from './applications.service';
import type { ApplicationWithGates } from './applications.service';
import { ApplicationDto, CreateApplicationDto } from './dto/application.dto';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../contract/enums';
import type { AuthenticatedUser } from '../../common/auth/authenticated-request';

@ApiTags('applications')
@ApiBearerAuth('access-token')
@Controller('applications')
@Roles(Role.Student)
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Post()
  @ApiOperation({
    summary: 'Start a draft application to one course',
    description: 'Does not require a completed profile yet — that gate applies at submit time.',
  })
  @ApiCreatedResponse({ type: ApplicationDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateApplicationDto,
  ): Promise<ApplicationDto> {
    return this.toDto(await this.applications.create(user, dto));
  }

  @Get()
  @ApiOperation({ summary: "The caller's own applications" })
  @ApiOkResponse({ type: [ApplicationDto] })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<ApplicationDto[]> {
    return (await this.applications.list(user)).map((entry) => this.toDto(entry));
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of the caller\'s own applications' })
  @ApiOkResponse({ type: ApplicationDto })
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ApplicationDto> {
    return this.toDto(await this.applications.get(user, id));
  }

  @Post(':id/documents/:documentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Attach an uploaded document to a draft application' })
  @ApiOkResponse({ type: ApplicationDto })
  async attachDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ): Promise<ApplicationDto> {
    return this.toDto(await this.applications.attachDocument(user, id, documentId));
  }

  @Delete(':id/documents/:documentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Detach a document from a draft application' })
  @ApiOkResponse({ type: ApplicationDto })
  async detachDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ): Promise<ApplicationDto> {
    return this.toDto(await this.applications.detachDocument(user, id, documentId));
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit a draft application',
    description:
      'Requires a completed profile and every required document type attached. Not idempotent ' +
      '— resubmitting an already-submitted application is a conflict.',
  })
  @ApiOkResponse({ type: ApplicationDto })
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ApplicationDto> {
    return this.toDto(await this.applications.submit(user, id));
  }

  private toDto(entry: ApplicationWithGates): ApplicationDto {
    return {
      id: entry.application.id,
      courseId: entry.application.courseId,
      institutionId: entry.application.institutionId,
      status: entry.application.status,
      submittedAt: entry.application.submittedAt?.toISOString() ?? null,
      attachedDocumentIds: entry.attachedDocumentIds,
      missingDocumentTypes: entry.missingDocumentTypes,
      readyToSubmit: entry.readyToSubmit,
      createdAt: entry.application.createdAt.toISOString(),
    };
  }
}
