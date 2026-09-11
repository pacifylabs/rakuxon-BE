import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminDashboardService } from './admin-dashboard.service';
import { AdminDashboardSummaryDto } from './dto/admin-dashboard.dto';
import { AdminJwtAuthGuard } from '../../common/auth/admin-jwt-auth.guard';
import { Public } from '../../common/auth/public.decorator';

/**
 * No PermissionGuard here, deliberately: these are aggregate counts, not the
 * records behind them, so any signed-in admin gets the platform's shape on
 * their home screen regardless of which `*.view` permissions they hold.
 */
@ApiTags('admin-dashboard')
@Controller('admin/dashboard')
@Public()
@UseGuards(AdminJwtAuthGuard)
@ApiBearerAuth('admin-access-token')
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Platform totals and status breakdowns, for the admin home screen' })
  @ApiOkResponse({ type: AdminDashboardSummaryDto })
  getSummary(): Promise<AdminDashboardSummaryDto> {
    return this.dashboard.getSummary();
  }
}
