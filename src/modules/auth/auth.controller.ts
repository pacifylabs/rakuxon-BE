import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AuthService } from './auth.service';
import {
  AuthTokensDto,
  ConfirmEmailVerificationDto,
  ConfirmPasswordResetDto,
  LoginDto,
  RefreshDto,
  RegisterAgencyDto,
  RegisterStudentDto,
  RequestPasswordResetDto,
  SsoCallbackDto,
} from './dto/auth.dto';
import { SSO_PROVIDERS } from './sso/sso.port';
import type { SsoProvider } from './sso/sso.port';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Public } from '../../common/auth/public.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-request';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(SSO_PROVIDERS) private readonly ssoProviders: Map<string, SsoProvider>,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Register an agency and its first administrator',
    description:
      'Creates the tenant and its `agency_admin` in one transaction and returns a session. ' +
      'The tenant starts as `pending` until an administrator vets it.',
  })
  @ApiCreatedResponse({ type: AuthTokensDto })
  @ApiConflictResponse({ description: 'The subdomain is already taken.' })
  async register(@Body() dto: RegisterAgencyDto): Promise<AuthTokensDto> {
    return this.auth.registerAgency(dto);
  }

  @Public()
  @Post('register/student')
  @ApiOperation({
    summary: 'Register directly as a student, with no agency',
    description:
      'Creates the account under the shared house tenant and returns a session. For a ' +
      "student joining through an agency's invitation, use POST /onboarding-links/register instead.",
  })
  @ApiCreatedResponse({ type: AuthTokensDto })
  @ApiConflictResponse({ description: 'That email is already registered.' })
  async registerStudent(@Body() dto: RegisterStudentDto): Promise<AuthTokensDto> {
    return this.auth.registerDirectStudent(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange credentials for a token pair',
    description:
      'Returns the same message whether the address is unknown or the password is wrong, so ' +
      'the response cannot be used to discover which addresses are registered.',
  })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiUnauthorizedResponse({ description: 'Credentials are not valid, or the account is inactive.' })
  async login(@Body() dto: LoginDto): Promise<AuthTokensDto> {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate a refresh token',
    description:
      'Refresh tokens are single-use. Presenting one that has already been rotated revokes ' +
      'every token in its family, because a replay and a stolen token are indistinguishable.',
  })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiUnauthorizedResponse({ description: 'Token unknown, expired, or already used.' })
  async refresh(@Body() dto: RefreshDto): Promise<AuthTokensDto> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'End the session behind a refresh token',
    description: 'Idempotent: an unknown token succeeds rather than reporting whether it existed.',
  })
  @ApiNoContentResponse()
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Public()
  @Post('password-reset/request')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Request a password reset link',
    description:
      'Always answers 204, whether or not the address has an account. Reporting which is ' +
      'which would make this an account-enumeration endpoint.',
  })
  @ApiNoContentResponse()
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto): Promise<void> {
    await this.auth.requestPasswordReset(dto.email);
  }

  @Public()
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Set a new password from a reset link',
    description:
      'Single-use, and every existing session is revoked. If the reset was triggered by a ' +
      'compromise, leaving the attacker signed in would defeat the point.',
  })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ description: 'The link is unknown, expired or already used.' })
  async confirmPasswordReset(@Body() dto: ConfirmPasswordResetDto): Promise<void> {
    await this.auth.confirmPasswordReset(dto.token, dto.password);
  }

  @Post('verify-email/resend')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Re-send the verification link to the signed-in user',
    description: 'A no-op if the address is already verified — never reports which.',
  })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token.' })
  async resendEmailVerification(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.auth.resendEmailVerification(user);
  }

  @Public()
  @Post('verify-email/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Confirm an email address from a verification link',
    description: 'Single-use. Unlike a password reset, existing sessions are left alone.',
  })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ description: 'The link is unknown, expired or already used.' })
  async confirmEmailVerification(@Body() dto: ConfirmEmailVerificationDto): Promise<void> {
    await this.auth.confirmEmailVerification(dto.token);
  }

  @Public()
  @Post('sso/:provider/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete a single sign-on redirect',
    description:
      'Exchanges the authorization code server-side, so no client secret reaches a browser. ' +
      'An address the provider has not verified is refused, and an address that already has ' +
      'an account is linked rather than duplicated. SSO does not create tenants.',
  })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiUnauthorizedResponse({ description: 'Provider refused, address unverified, or no account.' })
  async ssoCallback(
    @Param('provider') provider: string,
    @Body() dto: SsoCallbackDto,
  ): Promise<AuthTokensDto> {
    const adapter = this.ssoProviders.get(provider);
    if (!adapter) {
      throw new BadRequestException(`Sign-in through "${provider}" is not configured.`);
    }

    const profile = await adapter.exchangeCode(dto.code, dto.redirectUri);
    return this.auth.signInWithSso(provider, profile);
  }

  @Post('me')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'The identity behind the current access token' })
  @ApiOkResponse({ description: 'The authenticated user.' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired bearer token.' })
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
