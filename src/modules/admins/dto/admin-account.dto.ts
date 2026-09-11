import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** 8 characters, per NIST's length-over-composition guidance — same rule the reset flow uses. */
const PASSWORD_MIN = 8;

export class AdminAccountDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ description: 'Whether 2FA is currently on for this account.' }) totpEnabled!: boolean;
}

/** Every field optional — a partial save is expected. Email is not editable here: it is the sign-in identity. */
export class UpdateAdminProfileDto {
  @ApiPropertyOptional({ example: 'Ada' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Lovelace' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;
}

export class ChangeAdminPasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({ example: 'a-brand-new-passphrase', minLength: PASSWORD_MIN })
  @IsString()
  @MinLength(PASSWORD_MIN)
  @MaxLength(256)
  newPassword!: string;
}

export class TotpSetupDto {
  @ApiProperty({ description: 'The base32 secret, shown as a fallback to typing it in by hand.' })
  secret!: string;

  @ApiProperty({ description: 'otpauth:// URI encoded in the QR code — most apps can also take this directly.' })
  otpauthUrl!: string;

  @ApiProperty({ description: 'A data: URI PNG. Render it directly as an <img> src.' })
  qrCodeDataUrl!: string;
}

export class VerifyTotpDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  code!: string;
}

export class TotpEnabledDto {
  @ApiProperty({
    type: [String],
    description: 'Shown once, right after enabling — store them somewhere safe. Each works exactly one time in place of an authenticator code.',
  })
  backupCodes!: string[];
}

export class DisableTotpDto {
  @ApiProperty({ description: 'Re-confirms the account before turning 2FA off.' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
