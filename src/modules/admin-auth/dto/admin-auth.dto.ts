import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** 8 characters, per NIST's length-over-composition guidance — same rule as the users-side auth DTOs. */
const PASSWORD_MIN = 8;

export class AdminLoginDto {
  @ApiProperty({ example: 'ada@rakuxon.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'correct-horse-battery' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class AdminRefreshDto {
  @ApiProperty({ description: 'The refresh token from the previous login or refresh.' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class AdminSessionDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ada@rakuxon.com' })
  email!: string;

  @ApiProperty({ example: 'Ada' })
  firstName!: string;

  @ApiProperty({ example: 'Lovelace' })
  lastName!: string;

  @ApiProperty({ type: [String], example: ['tenants.view', 'tenants.approve'] })
  permissions!: string[];
}

export class AdminAuthTokensDto {
  @ApiProperty({ description: 'Short-lived JWT. Send as `Authorization: Bearer <token>`.' })
  accessToken!: string;

  @ApiProperty({ description: 'Opaque, single-use. Rotated on every refresh.' })
  refreshToken!: string;

  @ApiProperty({ example: 900, description: 'Access token lifetime in seconds.' })
  expiresIn!: number;

  @ApiProperty({ type: AdminSessionDto })
  admin!: AdminSessionDto;
}

/**
 * Returned by `/admin-auth/login` instead of `AdminAuthTokensDto` when the
 * account has 2FA on — the password checked out, but the session is not
 * issued until `/admin-auth/login/verify-totp` also succeeds.
 */
export class AdminLoginChallengeDto {
  @ApiProperty({ enum: [true] })
  requiresTotp!: true;

  @ApiProperty({ description: 'Trade this, plus a TOTP or backup code, for a real session. Expires in 5 minutes.' })
  challengeToken!: string;
}

export class VerifyAdminTotpLoginDto {
  @ApiProperty({ description: 'From the `requiresTotp` login response.' })
  @IsString()
  @IsNotEmpty()
  challengeToken!: string;

  @ApiProperty({ example: '123456', description: 'A 6-digit authenticator code, or an unused backup code.' })
  @IsString()
  @IsNotEmpty()
  code!: string;
}

export class RequestAdminPasswordResetDto {
  @ApiProperty({ example: 'ada@rakuxon.com' })
  @IsEmail()
  email!: string;
}

export class ConfirmAdminPasswordResetDto {
  @ApiProperty({ description: 'The token from the reset link.' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ example: 'a-brand-new-passphrase', minLength: PASSWORD_MIN })
  @IsString()
  @MinLength(PASSWORD_MIN)
  @MaxLength(256)
  password!: string;
}
