import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class SaveAdminRoleDto {
  @ApiProperty({ example: 'Customer Support' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'Helps students with their applications.' })
  @IsString()
  @MaxLength(1000)
  description!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionKeys!: string[];

  @ApiProperty({
    default: false,
    description: 'Eligible for automatic case assignment when a student submits an application.',
  })
  @IsBoolean()
  isSuccessManagerPool!: boolean;
}

export class AssignAdminRoleDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  roleId!: string;
}

export class AdminRoleSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty()
  description!: string;
  @ApiProperty({ type: [String] })
  permissions!: string[];
  @ApiProperty()
  adminCount!: number;
  @ApiProperty()
  isSuccessManagerPool!: boolean;
}
