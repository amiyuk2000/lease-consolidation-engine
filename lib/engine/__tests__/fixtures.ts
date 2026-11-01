// INVENTED SAMPLE DATA. Not real client leases or real market figures.
import type { Benchmark, SiteInput } from "../types";

export const VALUATION_DATE = "2027-01-01";

export function siteA(overrides: Partial<SiteInput> = {}): SiteInput {
  return {
    id: "a",
    name: "Sample Site A",
    city: "Toronto",
    segment: "Class A",
    rentableArea: 10000,
    usableArea: 8700,
    headcount: 100,
    peakAttendancePct: 60,
    netRentPsf: 30,
    additionalRentPsf: 20,
    netEscalationPct: 0,
    additionalEscalationPct: 0,
    leaseStart: "2019-01-01",
    leaseExpiry: "2028-12-31",
    breakDate: null,
    breakNoticeMonths: null,
    makeGoodPsf: 10,
    ...overrides,
  };
}

export function siteB(overrides: Partial<SiteInput> = {}): SiteInput {
  return siteA({
    id: "b",
    name: "Sample Site B",
    rentableArea: 20000,
    usableArea: 17400,
    leaseExpiry: "2031-12-31",
    ...overrides,
  });
}

export function siteC(overrides: Partial<SiteInput> = {}): SiteInput {
  return siteA({
    id: "c",
    name: "Sample Site C",
    rentableArea: 8000,
    usableArea: 7000,
    headcount: 80,
    peakAttendancePct: 50,
    netRentPsf: 28,
    additionalRentPsf: 18,
    makeGoodPsf: 12,
    ...overrides,
  });
}

/** Invented market rent used only in tests. */
export const TEST_MARKET_RENT: Benchmark = {
  segment: "Class A",
  market: "Toronto",
  period: "2026-Q3",
  vacancyPct: null,
  netRentPsf: 25,
  subletSharePct: null,
  source: "Invented test benchmark",
  sourceUrl: "https://example.invalid/benchmark",
};

/** Invented national sublet figure used only in tests. */
export const TEST_SUBLET_MARKET: Benchmark = {
  segment: "All office",
  market: "Canada",
  period: "2026-Q3",
  vacancyPct: null,
  netRentPsf: null,
  subletSharePct: 12.5,
  source: "Invented test benchmark",
  sourceUrl: "https://example.invalid/sublet",
};
