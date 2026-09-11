import { ApiProperty } from '@nestjs/swagger';

/** One bucket of a group-by-status count — the shape both bar and pie charts need. */
export class StatusCountDto {
  @ApiProperty() key!: string;
  @ApiProperty() count!: number;
}

/**
 * The platform at a glance — total counts plus a status breakdown for the
 * entities that have one. Every admin can see this regardless of their
 * permission set: it is aggregate, non-identifying counts, not the records
 * behind them (each of which stays behind its own `*.view` permission).
 */
export class AdminDashboardSummaryDto {
  @ApiProperty() totalTenants!: number;
  @ApiProperty() totalInstitutions!: number;
  @ApiProperty() totalCourses!: number;
  @ApiProperty() totalArticles!: number;
  @ApiProperty() totalStudents!: number;
  @ApiProperty() totalApplications!: number;
  @ApiProperty({ type: [StatusCountDto] }) tenantsByStatus!: StatusCountDto[];
  @ApiProperty({ type: [StatusCountDto] }) institutionsByStatus!: StatusCountDto[];
  @ApiProperty({ type: [StatusCountDto] }) applicationsByStatus!: StatusCountDto[];
  @ApiProperty() studentsWithCompleteProfile!: number;
  @ApiProperty() studentsWithIncompleteProfile!: number;
}
