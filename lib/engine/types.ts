import type { Decimal, DecimalValue } from "./decimal";

export const CURRENCY = "CAD" as const;

export interface SiteInput {
  id: string;
  name: string;
  city: string;
  segment: string;
  rentableArea: DecimalValue;
  usableArea: DecimalValue;
  headcount: number;
  peakAttendancePct: DecimalValue;
  netRentPsf: DecimalValue;
  additionalRentPsf: DecimalValue;
  netEscalationPct: DecimalValue;
  additionalEscalationPct: DecimalValue;
  leaseStart: string;
  leaseExpiry: string;
  breakDate: string | null;
  breakNoticeMonths: number | null;
  makeGoodPsf: DecimalValue;
  /** Workplace inventory, for the experience scorecard. Null or absent fields are unknown, never assumed. */
  spaceMix?: SpaceMix;
  /** Quietest normal weekday, as a percentage of headcount. */
  quietestAttendancePct?: DecimalValue | null;
}

export interface SpaceMix {
  workstations: number | null;
  focusRooms: number | null;
  /** Enclosed rooms that can hold a confidential meeting. */
  confidentialRooms: number | null;
  collaborationSpaces: number | null;
  socialSpaces: number | null;
}

/** A row from the benchmarks table. Every figure carries its source and period. */
export interface Benchmark {
  segment: string;
  market: string;
  period: string;
  vacancyPct: DecimalValue | null;
  netRentPsf: DecimalValue | null;
  subletSharePct: DecimalValue | null;
  source: string;
  sourceUrl: string;
}

export type ConstraintSeverity = "infeasible" | "warning" | "info";

export interface Constraint {
  code: string;
  severity: ConstraintSeverity;
  message: string;
  siteId?: string;
}

export interface Assumption {
  key: string;
  label: string;
  value: string;
  /** "default" means the engine supplied it, not the user. Must be labelled in the UI. */
  source: "user" | "default" | "benchmark";
}

export interface OneTimeCostInput {
  fitOut?: DecimalValue;
  tiAllowance?: DecimalValue;
  moving?: DecimalValue;
  it?: DecimalValue;
  furniture?: DecimalValue;
  signage?: DecimalValue;
  surrenderPremium?: DecimalValue;
  terminationPenalty?: DecimalValue;
  /** Only if the user supplies an estimate. Never invented. */
  businessDisruption?: DecimalValue | null;
  professionalFeesPct?: DecimalValue;
}

export interface OneTimeCostBreakdown {
  makeGood: Decimal;
  fitOutNetOfTi: Decimal;
  moving: Decimal;
  it: Decimal;
  furniture: Decimal;
  signage: Decimal;
  surrenderPremium: Decimal;
  terminationPenalty: Decimal;
  doubleRunning: Decimal | null;
  professionalFees: Decimal | null;
  businessDisruption: Decimal | null;
  total: Decimal | null;
}
