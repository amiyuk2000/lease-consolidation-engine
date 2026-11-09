import { describe, expect, it } from "vitest";
import {
  NO_STANDARDS,
  PURPOSES,
  experienceAfter,
  experienceToday,
  type ExperienceStandards,
  type WorkplaceExperience,
} from "../experience";
import { evaluateScenario, type ScenarioInput } from "../scenarios";
import type { SiteInput, SpaceMix } from "../types";
import { TEST_MARKET_RENT, VALUATION_DATE, siteA, siteB, siteC } from "./fixtures";

// Worked examples. Every expected figure was computed by hand; the arithmetic is in the comments.
// Standards (invented): ≥ 1 workstation per peak occupant, ≤ 10 people per focus room,
// ≤ 25 per confidential room, all 4 space types, all 4 purposes, busy-to-quiet gap ≤ 40 points.

const STANDARDS: ExperienceStandards = {
  minSeatsPerPeakOccupant: 1,
  maxPeoplePerFocusRoom: 10,
  maxPeoplePerConfidentialRoom: 25,
  minSpaceTypes: 4,
  purposes: PURPOSES,
  maxBusyQuietGapPts: 40,
};

const mix = (workstations: number, focusRooms: number, confidentialRooms: number, collaborationSpaces: number, socialSpaces: number): SpaceMix => ({
  workstations,
  focusRooms,
  confidentialRooms,
  collaborationSpaces,
  socialSpaces,
});

const statuses = (w: WorkplaceExperience | undefined) => Object.fromEntries((w?.indicators ?? []).map((i) => [i.key, i.status]));
const indicator = (w: WorkplaceExperience | undefined, key: string) => w?.indicators.find((i) => i.key === key);

const common = { valuationDate: VALUATION_DATE, horizonYears: 3, discountRatePct: 0, targetDensity: 150 };

// A: 100 people × 60% = 60 peak, quietest day 30% = 30. B: 100 × 60% = 60 peak, quietest 25% = 25.
const a = (o: Partial<SiteInput> = {}) => siteA({ spaceMix: mix(100, 6, 3, 2, 1), quietestAttendancePct: 30, ...o });
const b = (o: Partial<SiteInput> = {}) => siteB({ spaceMix: mix(130, 10, 4, 5, 1), quietestAttendancePct: 25, ...o });

describe("experience today", () => {
  it("scores a site against every standard", () => {
    // 260 × 55% = 143 peak; 260 × 20% = 52 on the quietest day.
    // Seats: needs 143, has 230. Focus: 143 / 10 = 14.3 → 15, has 12, short 3.
    // Confidential: 143 / 25 = 5.72 → 6, has 6. Gap: (143 − 52) / 230 = 39.565… points ≤ 40.
    const site = siteA({ headcount: 260, peakAttendancePct: 55, quietestAttendancePct: 20, spaceMix: mix(230, 12, 6, 8, 2) });
    const w = experienceToday(site, STANDARDS);
    expect(w.peakOccupants).toBe(143);
    expect(w.quietOccupants).toBe(52);
    expect(statuses(w)).toEqual({
      busiest_day_seats: "met",
      focus: "not_met",
      confidential: "met",
      variety: "met",
      purpose: "met",
      busy_quiet_gap: "met",
    });
    expect(indicator(w, "focus")).toMatchObject({ have: 12, need: 15 });
    expect(indicator(w, "focus")?.detail).toContain("short 3");
    expect(indicator(w, "busy_quiet_gap")?.gapPts?.toFixed(3)).toBe("39.565");
    expect(w.score).toEqual({ met: 5, scored: 6, unknown: 0 });
  });

  it("reports unknown, never a guess, when the space mix is not recorded", () => {
    const w = experienceToday(siteA(), STANDARDS);
    expect(w.mixBasis).toBe("unknown");
    expect(Object.values(statuses(w))).toEqual(["unknown", "unknown", "unknown", "unknown", "unknown", "unknown"]);
    expect(w.score).toEqual({ met: 0, scored: 6, unknown: 6 });
  });

  it("does not score indicators without a standard", () => {
    const w = experienceToday(a(), NO_STANDARDS);
    expect(Object.values(statuses(w))).toEqual(["not_set", "not_set", "not_set", "not_set", "not_set", "not_set"]);
    expect(w.score).toEqual({ met: 0, scored: 0, unknown: 0 });
    expect(indicator(w, "busiest_day_seats")?.detail).toBe("100 workstations for 60 people on the busiest day.");
  });

  it("treats people-based indicators as not applicable at zero headcount", () => {
    const w = experienceToday(a({ headcount: 0 }), STANDARDS);
    expect(statuses(w)).toEqual({
      busiest_day_seats: "not_applicable",
      focus: "not_applicable",
      confidential: "not_applicable",
      variety: "met",
      purpose: "met",
      busy_quiet_gap: "not_applicable",
    });
    expect(w.score).toEqual({ met: 2, scored: 2, unknown: 0 });
  });

  it("fails variety and purpose when a space type is missing", () => {
    // Social 0: 3 of 4 types, and no space for socialising.
    const w = experienceToday(a({ spaceMix: mix(100, 6, 3, 2, 0) }), STANDARDS);
    expect(indicator(w, "variety")).toMatchObject({ status: "not_met", have: 3, need: 4 });
    expect(indicator(w, "purpose")?.status).toBe("not_met");
    expect(indicator(w, "purpose")?.detail).toContain("no space for socialising");
  });

  it("counts a site with no focus rooms as short by the full requirement", () => {
    // 60 / 10 = 6 focus rooms needed, 0 present.
    const w = experienceToday(a({ spaceMix: mix(100, 0, 3, 2, 1) }), STANDARDS);
    expect(indicator(w, "focus")).toMatchObject({ status: "not_met", have: 0, need: 6 });
  });

  it("leaves the busy-to-quiet gap unknown without quietest-day attendance", () => {
    const w = experienceToday(a({ quietestAttendancePct: null }), STANDARDS);
    expect(indicator(w, "busy_quiet_gap")?.status).toBe("unknown");
    expect(w.quietOccupants).toBeNull();
  });
});

describe("experience after the change", () => {
  const close: ScenarioInput = {
    ...common,
    type: "close_and_absorb",
    siteId: "a",
    exitMechanism: "expiry",
    effectiveDate: "2028-01-01",
    allocations: [{ receivingSiteId: "b", headcount: 100 }],
    oneTimeCosts: { moving: 30000, it: 10000 },
  };

  it("closing a site into another crowds the receiving workplace", () => {
    // B today: 60 peak, 25 quiet. Seats 60 ≤ 130; focus 6 ≤ 10; confidential 60/25 → 3 ≤ 4;
    // gap (60 − 25) / 130 = 26.9 points. Meets 6 of 6.
    // After: 60 + 60 = 120 peak, 25 + 30 = 55 quiet, same rooms.
    // Seats 120 ≤ 130 met. Focus 120/10 = 12 > 10, short 2. Confidential 120/25 = 4.8 → 5 > 4, short 1.
    // Gap (120 − 55) / 130 = 50 points > 40. Meets 3 of 6.
    const sites = [a(), b()];
    expect(experienceToday(b(), STANDARDS).score).toEqual({ met: 6, scored: 6, unknown: 0 });

    const result = evaluateScenario(close, { sites, benchmarks: [TEST_MARKET_RENT] });
    const [after, ...rest] = experienceAfter(result, sites, STANDARDS);
    expect(rest).toEqual([]);
    expect(after?.siteId).toBe("b");
    expect(after?.peakOccupants).toBe(120);
    expect(after?.quietOccupants).toBe(55);
    expect(after?.mixBasis).toBe("recorded");
    expect(statuses(after)).toEqual({
      busiest_day_seats: "met",
      focus: "not_met",
      confidential: "not_met",
      variety: "met",
      purpose: "met",
      busy_quiet_gap: "not_met",
    });
    expect(indicator(after, "focus")).toMatchObject({ have: 10, need: 12 });
    expect(indicator(after, "confidential")).toMatchObject({ have: 4, need: 5 });
    expect(indicator(after, "busy_quiet_gap")?.gapPts?.toString()).toBe("50");
    expect(after?.score).toEqual({ met: 3, scored: 6, unknown: 0 });
  });

  it("assumes the space mix shrinks with the area given back, and says so", () => {
    // A keeps 60 × 150 = 9,000 of 10,000 sq ft: share 0.9.
    // 100 → 90 workstations; 6 → 5.4 → 5 focus; 3 → 2.7 → 3; 2 → 1.8 → 2; 1 → 0.9 → 1.
    const sites = [a()];
    const result = evaluateScenario(
      { ...common, type: "partial_surrender_at_expiry", siteId: "a", effectiveDate: VALUATION_DATE },
      { sites, benchmarks: [TEST_MARKET_RENT] },
    );
    const [after] = experienceAfter(result, sites, STANDARDS);
    expect(after?.mixBasis).toBe("pro_rata");
    expect(after?.retainedShare?.toString()).toBe("0.9");
    expect(after?.mix).toEqual(mix(90, 5, 3, 2, 1));
  });

  it("flags that densifying will change today's mix", () => {
    const sites = [a()];
    const result = evaluateScenario({ ...common, type: "densify_in_place", siteId: "a", effectiveDate: VALUATION_DATE }, { sites, benchmarks: [] });
    expect(experienceAfter(result, sites, STANDARDS)[0]?.mixBasis).toBe("before_refit");
  });

  it("leaves new premises unknown until a test-fit gives their mix", () => {
    // A (60 peak, 30 quiet) and C (80 × 50% = 40 peak, 80 × 20% = 16 quiet) into 14,000 sq ft.
    const sites = [a(), siteC({ spaceMix: mix(60, 4, 2, 2, 1), quietestAttendancePct: 20 })];
    const result = evaluateScenario(
      {
        ...common,
        targetDensity: 130,
        type: "relocate_and_consolidate",
        effectiveDate: "2028-10-01",
        exits: [
          { siteId: "a", exitMechanism: "expiry" },
          { siteId: "c", exitMechanism: "expiry" },
        ],
        newLease: {
          name: "Sample New Premises",
          city: "Toronto",
          segment: "Class A",
          rentableArea: 14000,
          netRentPsf: 27,
          additionalRentPsf: 19,
          netEscalationPct: 0,
          additionalEscalationPct: 0,
          commencementDate: "2028-07-01",
          expiryDate: "2038-06-30",
          freeRentMonths: 6,
        },
        oneTimeCosts: { fitOut: 1400000, tiAllowance: 1000000, moving: 50000 },
      },
      { sites, benchmarks: [TEST_MARKET_RENT] },
    );
    const [after] = experienceAfter(result, sites, STANDARDS);
    expect(after?.siteId).toBeNull();
    expect(after?.peakOccupants).toBe(100);
    expect(after?.quietOccupants).toBe(46);
    expect(after?.mixBasis).toBe("unknown");
    expect(after?.score).toEqual({ met: 0, scored: 6, unknown: 6 });
  });

  it("produces nothing for an infeasible scenario", () => {
    // B at 9,000 sq ft has no spare capacity at 150 sq ft.
    const sites = [a(), b({ rentableArea: 9000 })];
    const result = evaluateScenario(close, { sites, benchmarks: [TEST_MARKET_RENT] });
    expect(result.feasible).toBe(false);
    expect(experienceAfter(result, sites, STANDARDS)).toEqual([]);
  });
});
