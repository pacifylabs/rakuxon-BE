import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';

import { AdminAuthService } from './admin-auth.service';
import {
  AdminAuthTokensDto,
  AdminLoginChallengeDto,
  AdminLoginDto,
  AdminRefreshDto,
  ConfirmAdminPasswordResetDto,
  RequestAdminPasswordResetDto,
  VerifyAdminTotpLoginDto,
} from './dto/admin-auth.dto';
import { Public } from '../../common/auth/public.decorator';

/**
 * Everything here is @Public(): there is no session yet at any of these
 * calls, the same way the users-side /auth/* endpoints are. This is a
 * fully separate identity system from /auth/* — no route here ever touches
 * the `users` table, and no route under /auth/* ever touches `admins`.
 */
@ApiTags('admin-auth')
@Controller('admin-auth')
@ApiExtraModels(AdminAuthTokensDto, AdminLoginChallengeDto)
export class AdminAuthController {
  constructor(private readonly adminAuth: AdminAuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange admin credentials for a token pair',
    description:
      'Returns the same message whether the address is unknown or the password is wrong, so ' +
      'the response cannot be used to discover which addresses are registered. When the account ' +
      'has 2FA on, this returns `{ requiresTotp: true, challengeToken }` instead of tokens — ' +
      'call `/admin-auth/login/verify-totp` next.',
  })
  @ApiOkResponse({ schema: { oneOf: [{ $ref: getSchemaPath(AdminAuthTokensDto) }, { $ref: getSchemaPath(AdminLoginChallengeDto) }] } })
  @ApiUnauthorizedResponse({ description: 'Credentials are not valid, or the account is inactive.' })
  async login(@Body() dto: AdminLoginDto): Promise<AdminAuthTokensDto | AdminLoginChallengeDto> {
    return this.adminAuth.login(dto.email, dto.password);
  }

  @Public()
  @Post('login/verify-totp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Finish a 2FA login',
    description: 'Trades the challenge token from `/admin-auth/login` plus a TOTP or backup code for a real session.',
  })
  @ApiOkResponse({ type: AdminAuthTokensDto })
  @ApiUnauthorizedResponse({ description: 'The challenge has expired, or the code is not valid.' })
  async verifyTotpLogin(@Body() dto: VerifyAdminTotpLoginDto): Promise<AdminAuthTokensDto> {
    return this.adminAuth.verifyTotpLogin(dto.challengeToken, dto.code);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate an admin refresh token',
    description:
      'Single-use. Presenting one that has already been rotated revokes every token in its ' +
      'family. Permission keys on the returned access token are reloaded fresh, so a permission ' +
      'change takes effect the next time the admin refreshes, at the latest.',
  })
  @ApiOkResponse({ type: AdminAuthTokensDto })
  @ApiUnauthorizedResponse({ description: 'Token unknown, expired, or already used.' })
  async refresh(@Body() dto: AdminRefreshDto): Promise<AdminAuthTokensDto> {
    return this.adminAuth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'End the admin session behind a refresh token',
    description: 'Idempotent: an unknown token succeeds rather than reporting whether it existed.',
  })
  @ApiNoContentResponse()
  async logout(@Body() dto: AdminRefreshDto): Promise<void> {
    await this.adminAuth.logout(dto.refreshToken);
  }

  @Public()
  @Post('password-reset/request')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Request an admin password reset link',
    description: 'Always answers 204, whether or not the address has an admin account.',
  })
  @ApiNoContentResponse()
  async requestPasswordReset(@Body() dto: RequestAdminPasswordResetDto): Promise<void> {
    await this.adminAuth.requestPasswordReset(dto.email);
  }

  @Public()
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Set a new admin password from a reset link',
    description: 'Single-use, and every existing admin session for that account is revoked.',
  })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ description: 'The link is unknown, expired or already used.' })
  async confirmPasswordReset(@Body() dto: ConfirmAdminPasswordResetDto): Promise<void> {
    await this.adminAuth.confirmPasswordReset(dto.token, dto.password);
  }
}
