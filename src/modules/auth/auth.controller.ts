import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
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
import { AuthTokensDto, LoginDto, RefreshDto, RegisterAgencyDto } from './dto/auth.dto';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Public } from '../../common/auth/public.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-request';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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
