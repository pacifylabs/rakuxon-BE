/**
 * The tenant a direct (non-agency) student signup belongs to.
 *
 * Fixed rather than looked up, seeded by `StudentsAndHouseTenant1757000800000`.
 * See that migration for why students stay per-tenant-unique rather than
 * globally unique.
 */
export const HOUSE_TENANT_ID = '00000000-0000-0000-0000-000000000001';
