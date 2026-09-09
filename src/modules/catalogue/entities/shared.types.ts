import { IntakeStatus } from '../../../contract/enums';

/**
 * The shapes stored inside jsonb columns.
 *
 * These are stored as documents rather than as their own tables. They are
 * always read with their parent, never queried across rows, and never joined —
 * so a table each would add migrations and joins for nothing. The moment one
 * needs its own index or its own query, it earns a table.
 */

export interface Intake {
  /** Short month name, e.g. "Sep". */
  month: string;
  year: number;
  /** ISO date, e.g. "2026-07-06". Omit if the institution has not published one. */
  applicationDeadline?: string;
  status: IntakeStatus;
}

export interface RequirementItem {
  name: string;
  /** Minimum percentage, where the institution states one. */
  minPercentage?: number;
  note?: string;
}

/** Requirements arrive grouped, because that is how an applicant gathers them. */
export interface RequirementGroup {
  id: string;
  label: string;
  items: RequirementItem[];
}

export interface EnglishTest {
  test: 'IELTS' | 'TOEFL' | 'PTE' | 'Duolingo';
  minScore: string;
}

export interface Scholarship {
  name: string;
  amount?: number;
  currency?: string;
  note?: string;
}

export interface Campus {
  name: string;
  city: string;
  countryCode: string;
}

/** A published rating, named by its scheme so it is never presented as ours. */
export interface QualityRating {
  scheme: string;
  level: string;
  year: number;
}

export interface Faq {
  question: string;
  answer: string;
}
