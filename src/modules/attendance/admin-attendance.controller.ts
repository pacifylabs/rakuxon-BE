import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  AttendanceRecordDto,
  AttendanceRecordListDto,
  ListAttendanceQueryDto,
  TodayAttendanceDto,
} from './dto/attendance.dto';
import { AttendanceService } from './attendance.service';
import { AdminJwtAuthGuard } from '../../common/auth/admin-jwt-auth.guard';
import { CurrentAdmin } from '../../common/auth/current-admin.decorator';
import { Public } from '../../common/auth/public.decorator';
import { PermissionGuard } from '../../common/rbac/permission.guard';
import { RequirePermission } from '../../common/rbac/require-permission.decorator';
import type { AuthenticatedAdmin } from '../../common/auth/authenticated-admin-request';

/**
 * Attendance — the client's clock-in/out request. `me/*` routes act on the
 * caller's own record, so (like AdminAccountController) they carry no
 * `@RequirePermission`: being a signed-in admin is the only gate that makes
 * sense there. The team-wide log is `attendance.view`-gated.
 */
@ApiTags('admin-attendance')
@Controller('admin/attendance')
@Public()
@UseGuards(AdminJwtAuthGuard, PermissionGuard)
@ApiBearerAuth('admin-access-token')
export class AdminAttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('me/clock-in')
  @ApiOperation({ summary: 'Clock the caller in for today' })
  @ApiOkResponse({ type: AttendanceRecordDto })
  clockIn(@CurrentAdmin() admin: AuthenticatedAdmin): Promise<AttendanceRecordDto> {
    return this.attendance.clockIn(admin.id);
  }

  @Post('me/clock-out')
  @ApiOperation({ summary: 'Clock the caller out for today' })
  @ApiOkResponse({ type: AttendanceRecordDto })
  clockOut(@CurrentAdmin() admin: AuthenticatedAdmin): Promise<AttendanceRecordDto> {
    return this.attendance.clockOut(admin.id);
  }

  @Get('me/today')
  @ApiOperation({ summary: "The caller's attendance record for today, if any" })
  @ApiOkResponse({ type: TodayAttendanceDto })
  async today(@CurrentAdmin() admin: AuthenticatedAdmin): Promise<TodayAttendanceDto> {
    return { record: await this.attendance.today(admin.id) };
  }

  @Get('me')
  @ApiOperation({ summary: "The caller's own attendance history" })
  @ApiOkResponse({ type: AttendanceRecordListDto })
  listMine(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Query() query: ListAttendanceQueryDto,
  ): Promise<AttendanceRecordListDto> {
    return this.attendance.listMine(admin.id, query);
  }

  @Get()
  @RequirePermission('attendance.view')
  @ApiOperation({ summary: "Every admin's clock-in/out log, filterable by admin and date range" })
  @ApiOkResponse({ type: AttendanceRecordListDto })
  list(@Query() query: ListAttendanceQueryDto): Promise<AttendanceRecordListDto> {
    return this.attendance.list(query);
  }
}
