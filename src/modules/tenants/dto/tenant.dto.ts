import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { AGENCY_ROLES, Role, TenantStatus, UserStatus } from '../../../contract/enums';

const PASSWORD_MIN = 8;
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const SLUG_MESSAGE =
  'slug must be 3-40 lowercase letters, digits or hyphens, and cannot start or end with a hyphen';

export class ListTenantsQueryDto {
  @ApiPropertyOptional({ enum: TenantStatus, enumName: 'TenantStatus' })
  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @ApiPropertyOptional({ description: 'Free text over name and slug.' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 24, minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class TenantDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty() name!: string;

  @ApiProperty() slug!: string;

  @ApiProperty({ enum: TenantStatus, enumName: 'TenantStatus' })
  status!: TenantStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

export class TenantListDto {
  @ApiProperty({ type: [TenantDto] }) items!: TenantDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageCount!: number;
}

/**
 * An admin bringing in a partner the client already has a relationship with
 * — no self-service signup, no pending-approval wait. The tenant starts
 * active immediately: an admin creating it directly has already vetted it,
 * unlike the self-service path which starts `pending`.
 */
export class AdminCreateTenantDto {
  @ApiProperty({ example: 'Northwind Education', description: 'Partner name.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    example: 'northwind',
    description: 'Subdomain label. Lowercase letters, digits and hyphens.',
  })
  @IsString()
  @Matches(SLUG_PATTERN, { message: SLUG_MESSAGE })
  slug!: string;

  @ApiProperty({ example: 'ada@northwind.example', description: "The first staff user's email." })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Ada' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  firstName!: string;

  @ApiProperty({ example: 'Lovelace' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  lastName!: string;

  @ApiProperty({
    example: 'correct-horse-battery',
    minLength: PASSWORD_MIN,
    description:
      'Set directly by the creating admin. The new staff user can change it via the reset flow.',
  })
  @IsString()
  @MinLength(PASSWORD_MIN)
  @MaxLength(256)
  password!: string;
}

/** Adding a further staff user to a partner that already exists. */
export class CreateTenantStaffDto {
  @ApiProperty({ example: 'ada@northwind.example' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Ada' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  firstName!: string;

  @ApiProperty({ example: 'Lovelace' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  lastName!: string;

  @ApiProperty({ example: 'correct-horse-battery', minLength: PASSWORD_MIN })
  @IsString()
  @MinLength(PASSWORD_MIN)
  @MaxLength(256)
  password!: string;

  @ApiPropertyOptional({
    enum: AGENCY_ROLES,
    default: Role.AgencyAdmin,
    description: 'Defaults to agency_admin.',
  })
  @IsOptional()
  @IsIn(AGENCY_ROLES)
  role?: (typeof AGENCY_ROLES)[number];
}

export class SetTenantStaffPasswordDto {
  @ApiProperty({ example: 'correct-horse-battery', minLength: PASSWORD_MIN })
  @IsString()
  @MinLength(PASSWORD_MIN)
  @MaxLength(256)
  password!: string;
}

export class UpdateTenantDto {
  @ApiPropertyOptional({ example: 'Northwind Education' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'northwind' })
  @IsOptional()
  @IsString()
  @Matches(SLUG_PATTERN, { message: SLUG_MESSAGE })
  slug?: string;
}

/** One row of a partner's staff list. */
export class TenantStaffDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ enum: Role, enumName: 'Role' }) role!: Role;
  @ApiProperty({ enum: UserStatus, enumName: 'UserStatus' }) status!: UserStatus;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}

export class TenantStaffListDto {
  @ApiProperty({ type: [TenantStaffDto] }) items!: TenantStaffDto[];
}
