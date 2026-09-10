/** The shapes stored inside `students`' jsonb columns. */

export interface Address {
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  countryCode?: string;
}

export interface EducationHistoryEntry {
  institutionName: string;
  qualification: string;
  fieldOfStudy?: string;
  startYear?: number;
  endYear?: number;
  grade?: string;
}
