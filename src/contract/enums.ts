/**
 * Shared enums. Published to the FE with the DTOs, so both sides compare the
 * same strings — see docs/07-api-contract.md.
 */

export enum Role {
  PlatformAdmin = 'platform_admin',
  AgencyAdmin = 'agency_admin',
  Counselor = 'counselor',
  InstitutionUser = 'institution_user',
  Student = 'student',
}

/** Roles that belong to an agency tenant, in descending authority. */
export const AGENCY_ROLES = [Role.AgencyAdmin, Role.Counselor] as const;

export enum TenantStatus {
  Pending = 'pending',
  Active = 'active',
  Suspended = 'suspended',
}

export enum UserStatus {
  Invited = 'invited',
  Active = 'active',
  Suspended = 'suspended',
}
