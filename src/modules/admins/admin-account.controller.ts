import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { AdminAccountService } from './admin-account.service';
import {
  AdminAccountDto,
  ChangeAdminPasswordDto,
  DisableTotpDto,
  TotpEnabledDto,
  TotpSetupDto,
  UpdateAdminProfileDto,
  VerifyTotpDto,
} from './dto/admin-account.dto';
import type { Admin } from './entities/admin.entity';
import { AdminJwtAuthGuard } from '../../common/auth/admin-jwt-auth.guard';
import { CurrentAdmin } from '../../common/auth/current-admin.decorator';
import { Public } from '../../common/auth/public.decorator';
import type { AuthenticatedAdmin } from '../../common/auth/authenticated-admin-request';

/**
 * An admin's own account — profile, password, 2FA. No `PermissionGuard`
 * here: every route acts on the caller's own account, so being a signed-in
 * admin at all is the only gate that makes sense (contrast `admins.manage`,
 * which is for changing *someone else's* account).
 */
@ApiTags('admin-account')
@Controller('admin/account')
@Public()
@UseGuards(AdminJwtAuthGuard)
@ApiBearerAuth('admin-access-token')
export class AdminAccountController {
  constructor(private readonly account: AdminAccountService) {}

  @Get('me')
  @ApiOperation({ summary: "The caller's own account" })
  @ApiOkResponse({ type: AdminAccountDto })
  async getAccount(@CurrentAdmin() admin: AuthenticatedAdmin): Promise<AdminAccountDto> {
    return this.toDto(await this.account.getAccount(admin.id));
  }

  @Patch('me')
  @ApiOperation({ summary: "Update the caller's own name" })
  @ApiOkResponse({ type: AdminAccountDto })
  async updateProfile(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: UpdateAdminProfileDto,
  ): Promise<AdminAccountDto> {
    return this.toDto(await this.account.updateProfile(admin.id, dto));
  }

  @Post('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Change the caller's own password" })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ description: 'The current password is not correct.' })
  async changePassword(@CurrentAdmin() admin: AuthenticatedAdmin, @Body() dto: ChangeAdminPasswordDto): Promise<void> {
    await this.account.changePassword(admin.id, dto);
  }

  @Post('me/2fa/setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start 2FA setup',
    description: 'Generates a secret and returns a QR code to scan. 2FA is not on yet — call .../2fa/enable with a code from the app to confirm it.',
  })
  @ApiOkResponse({ type: TotpSetupDto })
  async setupTotp(@CurrentAdmin() admin: AuthenticatedAdmin): Promise<TotpSetupDto> {
    return this.account.setupTotp(admin.id);
  }

  @Post('me/2fa/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm 2FA setup and turn it on', description: 'Returns one-time backup codes — shown only this once.' })
  @ApiOkResponse({ type: TotpEnabledDto })
  @ApiUnauthorizedResponse({ description: 'The code is not valid.' })
  async enableTotp(@CurrentAdmin() admin: AuthenticatedAdmin, @Body() dto: VerifyTotpDto): Promise<TotpEnabledDto> {
    return this.account.verifyAndEnableTotp(admin.id, dto.code);
  }

  @Post('me/2fa/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Turn 2FA off' })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ description: 'The current password is not correct.' })
  async disableTotp(@CurrentAdmin() admin: AuthenticatedAdmin, @Body() dto: DisableTotpDto): Promise<void> {
    await this.account.disableTotp(admin.id, dto.password);
  }

  private toDto(admin: Admin): AdminAccountDto {
    return {
      id: admin.id,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
      totpEnabled: admin.totpEnabled,
    };
  }
}
