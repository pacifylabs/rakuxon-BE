import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

import { StatusCountDto } from '../../dashboard/dto/admin-dashboard.dto';
import { TenantStatus } from '../../../contract/enums';

const PASSWORD_MIN = 8;

/**
 * The agency's own home-screen totals — same shape idea as
 * `AdminDashboardSummaryDto`, scoped to the caller's tenant instead of the
 * whole platform, plus the tenant's own approval status so the dashboard
 * can show a "pending approval" banner without a second request.
 */
export class AgencyDashboardSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' }) tenantId!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty({ enum: TenantStatus, enumName: 'TenantStatus' }) tenantStatus!: TenantStatus;
  @ApiProperty() totalStudents!: number;
  @ApiProperty() totalApplications!: number;
  @ApiProperty({ type: [StatusCountDto] }) applicationsByStatus!: StatusCountDto[];
  @ApiProperty() studentsWithCompleteProfile!: number;
  @ApiProperty() studentsWithIncompleteProfile!: number;
}

/**
 * An `agency_admin` inviting a counselor into their own agency —
 * deliberately without `CreateTenantStaffDto`'s `role` field: self-service
 * can only ever create a `counselor`, never mint a second `agency_admin`
 * (that stays a platform-admin action via `/admin/tenants/:id/staff`).
 */
export class CreateAgencyStaffDto {
  @ApiProperty({ example: 'counselor@example.com' })
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
    description: 'A temporary password the counselor can change via the reset flow.',
  })
  @IsString()
  @MinLength(PASSWORD_MIN)
  @MaxLength(256)
  password!: string;
}
