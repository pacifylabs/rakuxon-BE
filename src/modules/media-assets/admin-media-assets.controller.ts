import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  CreateMediaAssetDto,
  ListMediaAssetsQueryDto,
  MediaAssetDto,
  MediaAssetListDto,
  UpdateMediaAssetDto,
} from './dto/media-asset.dto';
import { MediaAssetsService } from './media-assets.service';
import { AdminJwtAuthGuard } from '../../common/auth/admin-jwt-auth.guard';
import { CurrentAdmin } from '../../common/auth/current-admin.decorator';
import { Public } from '../../common/auth/public.decorator';
import { PermissionGuard } from '../../common/rbac/permission.guard';
import { RequirePermission } from '../../common/rbac/require-permission.decorator';
import type { AuthenticatedAdmin } from '../../common/auth/authenticated-admin-request';

/**
 * The shared media library — social toolkits, brand assets, design files
 * and anything else worth keeping in one place. `@Public()` opts every
 * route out of the global users-table `JwtAuthGuard`; `AdminJwtAuthGuard` +
 * `PermissionGuard` do the real auth here, same shape as
 * `AdminTestimonialsController`.
 */
@ApiTags('admin-media-assets')
@Controller('admin/media-assets')
@Public()
@UseGuards(AdminJwtAuthGuard, PermissionGuard)
@ApiBearerAuth('admin-access-token')
export class AdminMediaAssetsController {
  constructor(private readonly assets: MediaAssetsService) {}

  @Get()
  @RequirePermission('media.view')
  @ApiOperation({ summary: 'Browse the media library, filterable by category' })
  @ApiOkResponse({ type: MediaAssetListDto })
  list(@Query() query: ListMediaAssetsQueryDto): Promise<MediaAssetListDto> {
    return this.assets.list(query);
  }

  @Get(':id')
  @RequirePermission('media.view')
  @ApiOkResponse({ type: MediaAssetDto })
  get(@Param('id') id: string): Promise<MediaAssetDto> {
    return this.assets.get(id);
  }

  @Post()
  @RequirePermission('media.manage')
  @ApiOperation({
    summary: 'Add a file to the media library',
    description: "The file itself goes through /admin/uploads/signature first — this saves the result's metadata.",
  })
  @ApiCreatedResponse({ type: MediaAssetDto })
  create(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: CreateMediaAssetDto,
  ): Promise<MediaAssetDto> {
    return this.assets.create(admin.id, dto);
  }

  @Patch(':id')
  @RequirePermission('media.manage')
  @ApiOperation({ summary: "Edit a file's title, description or category" })
  @ApiOkResponse({ type: MediaAssetDto })
  update(@Param('id') id: string, @Body() dto: UpdateMediaAssetDto): Promise<MediaAssetDto> {
    return this.assets.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('media.manage')
  @ApiOperation({ summary: 'Remove a file from the library' })
  @ApiNoContentResponse()
  async remove(@Param('id') id: string): Promise<void> {
    await this.assets.remove(id);
  }
}
