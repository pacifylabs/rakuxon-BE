import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { Role } from '../../../contract/enums';

/** 12 characters, per NIST's length-over-composition guidance. */
const PASSWORD_MIN = 12;

export class RegisterAgencyDto {
  @ApiProperty({ example: 'Northwind Education', description: 'Agency name.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  agencyName!: string;

  @ApiProperty({
    example: 'northwind',
    description: 'Subdomain label. Lowercase letters, digits and hyphens.',
  })
  @IsString()
  @Matches(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, {
    message: 'slug must be 3-40 lowercase letters, digits or hyphens, and cannot start or end with a hyphen',
  })
  slug!: string;

  @ApiProperty({ example: 'ada@northwind.example' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({ example: 'correct-horse-battery', minLength: PASSWORD_MIN })
  @IsString()
  @MinLength(PASSWORD_MIN)
  @MaxLength(256)
  password!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'ada@northwind.example' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'correct-horse-battery' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class RefreshDto {
  @ApiProperty({ description: 'The refresh token from the previous login or refresh.' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class AuthUserDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ada@northwind.example' })
  email!: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  fullName!: string;

  @ApiProperty({ enum: Role, enumName: 'Role' })
  role!: Role;

  /* `type` is required alongside `nullable`: without it Swagger emits a
     schema with no type at all, which generates as Record<string, never>. */
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Null for a platform administrator.',
  })
  tenantId!: string | null;
}

export class AuthTokensDto {
  @ApiProperty({ description: 'Short-lived JWT. Send as `Authorization: Bearer <token>`.' })
  accessToken!: string;

  @ApiProperty({ description: 'Opaque, single-use. Rotated on every refresh.' })
  refreshToken!: string;

  @ApiProperty({ example: 900, description: 'Access token lifetime in seconds.' })
  expiresIn!: number;

  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
}
