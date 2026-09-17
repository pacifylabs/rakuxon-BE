import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  AdminTestimonialDetailDto,
  AdminTestimonialListDto,
  AdminTestimonialSummaryDto,
  CreateTestimonialDto,
  ListAdminTestimonialsQueryDto,
  UpdateTestimonialDto,
} from './dto/testimonial.dto';
import { TestimonialsService } from './testimonials.service';
import { AdminJwtAuthGuard } from '../../common/auth/admin-jwt-auth.guard';
import { Public } from '../../common/auth/public.decorator';
import { PermissionGuard } from '../../common/rbac/permission.guard';
import { RequirePermission } from '../../common/rbac/require-permission.decorator';
import { PublishStatus } from '../../contract/enums';

/**
 * @Public() opts every route out of the global, users-table JwtAuthGuard;
 * AdminJwtAuthGuard + PermissionGuard do the real auth here — same shape as
 * AdminCatalogueController.
 */
@ApiTags('admin-testimonials')
@Controller('admin/testimonials')
@Public()
@UseGuards(AdminJwtAuthGuard, PermissionGuard)
@ApiBearerAuth('admin-access-token')
export class AdminTestimonialsController {
  constructor(private readonly testimonials: TestimonialsService) {}

  @Post()
  @RequirePermission('content.manage')
  @ApiOperation({ summary: 'Create a testimonial', description: 'Starts life as draft.' })
  @ApiCreatedResponse({ type: AdminTestimonialDetailDto })
  create(@Body() dto: CreateTestimonialDto): Promise<AdminTestimonialDetailDto> {
    return this.testimonials.create(dto);
  }

  @Get()
  @RequirePermission('content.view')
  @ApiOperation({ summary: 'List testimonials, including drafts and suspended records' })
  @ApiOkResponse({ type: AdminTestimonialListDto })
  list(@Query() query: ListAdminTestimonialsQueryDto): Promise<AdminTestimonialListDto> {
    return this.testimonials.listAdmin(query);
  }

  @Get(':id')
  @RequirePermission('content.view')
  @ApiOkResponse({ type: AdminTestimonialDetailDto })
  getDetail(@Param('id') id: string): Promise<AdminTestimonialDetailDto> {
    return this.testimonials.getDetail(id);
  }

  @Patch(':id')
  @RequirePermission('content.manage')
  @ApiOkResponse({ type: AdminTestimonialDetailDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTestimonialDto,
  ): Promise<AdminTestimonialDetailDto> {
    return this.testimonials.update(id, dto);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('content.manage')
  @ApiOkResponse({ type: AdminTestimonialSummaryDto })
  publish(@Param('id') id: string): Promise<AdminTestimonialSummaryDto> {
    return this.testimonials.setStatus(id, PublishStatus.Published);
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('content.manage')
  @ApiOkResponse({ type: AdminTestimonialSummaryDto })
  suspend(@Param('id') id: string): Promise<AdminTestimonialSummaryDto> {
    return this.testimonials.setStatus(id, PublishStatus.Suspended);
  }

  @Post(':id/revert-to-draft')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('content.manage')
  @ApiOkResponse({ type: AdminTestimonialSummaryDto })
  revertToDraft(@Param('id') id: string): Promise<AdminTestimonialSummaryDto> {
    return this.testimonials.setStatus(id, PublishStatus.Draft);
  }
}
