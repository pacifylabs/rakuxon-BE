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

/* ------------------------------------------------------------- catalogue */

/**
 * Whether a record is visible to the public site.
 *
 * Everything imported lands as `draft`. Publishing is a deliberate act,
 * because a wrong fee or deadline on a real university is something a student
 * plans around.
 */
export enum PublishStatus {
  Draft = 'draft',
  Published = 'published',
  Suspended = 'suspended',
}

export enum StudyLevel {
  Foundation = 'foundation',
  Undergraduate = 'undergraduate',
  Postgraduate = 'postgraduate',
  Research = 'research',
}

export enum StudyMode {
  FullTime = 'full_time',
  PartTime = 'part_time',
  Online = 'online',
  Hybrid = 'hybrid',
}

/** Whether a tuition figure covers one year or the whole course. */
export enum TuitionPeriod {
  Year = 'year',
  Course = 'course',
}

export enum IntakeStatus {
  Open = 'open',
  ClosingSoon = 'closing_soon',
  Closed = 'closed',
}

/* --------------------------------------------------------------- documents */

export enum DocumentType {
  AcademicCertificate = 'academic_certificate',
  EnglishTest = 'english_test',
  Identity = 'identity',
  Medical = 'medical',
  SecondaryMarksheet = 'secondary_marksheet',
  SeniorSecondaryMarksheet = 'senior_secondary_marksheet',
}

export enum DocumentStatus {
  PendingUpload = 'pending_upload',
  Uploaded = 'uploaded',
  Deleted = 'deleted',
  Rejected = 'rejected',
}

/* ------------------------------------------------------------ applications */

/**
 * Stops at `submitted` deliberately. Everything past it (`under_review`,
 * offers, rejection) belongs to the counselor/institution review pipeline —
 * separate, later work — and extending this enum then is not a migration
 * touching existing rows.
 */
export enum ApplicationStatus {
  Draft = 'draft',
  Submitted = 'submitted',
}
