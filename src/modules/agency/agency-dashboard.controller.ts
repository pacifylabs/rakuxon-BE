import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AgencyService } from './agency.service';
import { AgencyDashboardSummaryDto } from './dto/agency.dto';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/rbac/roles.decorator';
import { AGENCY_ROLES } from '../../contract/enums';
import type { AuthenticatedUser } from '../../common/auth/authenticated-request';

/** An agency's own home-screen totals — never another agency's, `tenantId` always comes from the caller's own token. */
@ApiTags('agency-dashboard')
@ApiBearerAuth('access-token')
@Controller('agency/dashboard')
@Roles(...AGENCY_ROLES)
export class AgencyDashboardController {
  constructor(private readonly agency: AgencyService) {}

  @Get('summary')
  @ApiOperation({ summary: "The caller's own agency totals and status breakdown" })
  @ApiOkResponse({ type: AgencyDashboardSummaryDto })
  getSummary(@CurrentUser() user: AuthenticatedUser): Promise<AgencyDashboardSummaryDto> {
    return this.agency.getDashboardSummary(user.tenantId!);
  }
}
