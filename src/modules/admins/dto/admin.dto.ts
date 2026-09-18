import { AdminRoleSummaryDto } from './admin-role.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsUUID,
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { UserStatus } from '../../../contract/enums';

const PASSWORD_MIN = 8;

export class CreateAdminDto {
  @ApiProperty({ example: 'ada@rakuxon.com' })
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
      'Set directly by the creating admin. The new admin can change it via the password-reset flow.',
  })
  @IsString()
  @MinLength(PASSWORD_MIN)
  @MaxLength(256)
  password!: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Assign one reusable role.' })
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional({
    type: [String],
    deprecated: true,
    description: 'Legacy clients only. Cannot be combined with roleId.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionKeys?: string[];
}

export class UpdateAdminPermissionsDto {
  @ApiProperty({
    type: [String],
    example: ['tenants.view', 'tenants.approve'],
    description: 'Replaces the admin’s permission set exactly with this list.',
  })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionKeys!: string[];
}

export class AdminSummaryDto {
  @ApiProperty({ type: AdminRoleSummaryDto, nullable: true })
  role!: AdminRoleSummaryDto | null;

  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ada@rakuxon.com' })
  email!: string;

  @ApiProperty({ example: 'Ada' })
  firstName!: string;

  @ApiProperty({ example: 'Lovelace' })
  lastName!: string;

  @ApiProperty({ enum: UserStatus, enumName: 'UserStatus' })
  status!: UserStatus;

  @ApiProperty({ type: [String], example: ['tenants.view', 'tenants.approve'] })
  permissions!: string[];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

export class AdminListDto {
  @ApiProperty({ type: [AdminSummaryDto] })
  items!: AdminSummaryDto[];
}

export class PermissionDto {
  @ApiProperty({ example: 'tenants.approve' })
  key!: string;

  @ApiProperty({ example: 'Approve a pending tenant, or reinstate a suspended one.' })
  description!: string;
}
