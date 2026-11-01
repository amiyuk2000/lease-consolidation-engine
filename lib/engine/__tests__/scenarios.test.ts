import { describe, expect, it } from "vitest";
import type { Decimal } from "../decimal";
import { evaluateScenario, type ScenarioInput, type ScenarioResult } from "../scenarios";
import type { SiteInput } from "../types";
import { TEST_MARKET_RENT, TEST_SUBLET_MARKET, VALUATION_DATE, siteA, siteB, siteC } from "./fixtures";

// Worked examples. Every expected figure below was computed by hand and is
// written as a literal; the arithmetic is in the comments.
// Common setup: valuation 2027-01-01, 3-year horizon, 0% discount (so NPV
// equals the cumulative delta and can be checked by hand), target 150 sq ft.
// Site A: 10,000 sq ft, net $30 + additional $20, expires 2028-12-31 (month 24),
// renews at market net $25. Baseline A: 500,000 / 500,000 / 450,000.

const common = { valuationDate: VALUATION_DATE, horizonYears: 3, discountRatePct: 0, targetDensity: 150 };

function run(input: ScenarioInput, sites: SiteInput[] = [siteA()], benchmarks = [TEST_MARKET_RENT]) {
  return evaluateScenario(input, { sites, benchmarks });
}

const fixed = (v: Decimal | null | undefined) => (v === null || v === undefined ? null : v.toFixed(2));
const column = (r: ScenarioResult, key: "delta" | "cumulativeDelta" | "scenarioOccupancyCost" | "oneTimeCost" | "subletIncome") =>
  r.financials?.years.map((y) => fixed(y[key]));
const codes = (r: ScenarioResult) => r.constraints.map((c) => c.code);

describe("densify in place", () => {
  it("costs the fit-out and saves no rent", () => {
    // One-time: fit-out 60,000 + furniture 20,000 = 80,000; fees 6% = 4,800; total 84,800 in month 0.
    const r = run({ ...common, type: "densify_in_place", siteId: "a", effectiveDate: "2027-01-01", oneTimeCosts: { fitOut: 60000, furniture: 20000 } });
    expect(r.feasible).toBe(true);
    expect(fixed(r.financials?.oneTimeCosts.total)).toBe("84800.00");
    expect(column(r, "delta")).toEqual(["-84800.00", "0.00", "0.00"]);
    expect(fixed(r.financials?.npvOfDelta)).toBe("-84800.00");
    expect(r.financials?.payback).toEqual({ status: "never" });
    expect(r.space?.areaReleased.toString()).toBe("0");
    // floor(10,000 / 150) = 66 peak occupants against 60 today.
    expect(r.constraints.find((c) => c.code === "densify_no_rent_saving")?.message).toContain("66 peak occupants against 60");
  });

  it("flags but does not block density below 120 sq ft", () => {
    const r = run({ ...common, targetDensity: 100, type: "densify_in_place", siteId: "a", effectiveDate: "2027-01-01" });
    expect(r.feasible).toBe(true);
    expect(codes(r)).toContain("density_below_threshold");
  });

  it("is infeasible when the site cannot hold its people at the target", () => {
    // 60 × 200 = 12,000 > 10,000.
    const r = run({ ...common, targetDensity: 200, type: "densify_in_place", siteId: "a", effectiveDate: "2027-01-01" });
    expect(r.feasible).toBe(false);
    expect(codes(r)).toContain("capacity_exceeded");
    expect(r.financials).toBeNull();
    expect(fixed(r.baseline.total)).toBe("1450000.00");
  });
});

describe("partial surrender at expiry", () => {
  it("renews the required area at market", () => {
    // Retained 60 × 150 = 9,000; released 1,000. Make-good 1,000 × 10 = 10,000; fees 600; total 10,600 at month 24.
    // Year 3: baseline 450,000; scenario 9,000 × 45 = 405,000; delta 45,000 − 10,600 = 34,400.
    // Payback: month 24 = 37,500 − 33,750 − 10,600 = −6,850; +3,750/month → positive after month 26. Months 24–25 negative → 2.
    const r = run({ ...common, type: "partial_surrender_at_expiry", siteId: "a", effectiveDate: "2027-01-01" });
    expect(r.feasible).toBe(true);
    expect(column(r, "scenarioOccupancyCost")).toEqual(["500000.00", "500000.00", "405000.00"]);
    expect(column(r, "delta")).toEqual(["0.00", "0.00", "34400.00"]);
    expect(fixed(r.financials?.npvOfDelta)).toBe("34400.00");
    expect(r.financials?.payback).toEqual({ status: "months", months: 2 });
    expect(r.space?.areaReleased.toString()).toBe("1000");
    expect(fixed(r.space?.sites[0]?.areaPerPeakOccupant)).toBe("150.00");
    expect(r.assumptions.find((a) => a.key === "retained_area")?.source).toBe("default");
  });

  it("is infeasible when the lease cannot be acted on within the horizon", () => {
    const r = run({ ...common, horizonYears: 1, type: "partial_surrender_at_expiry", siteId: "a", effectiveDate: "2027-01-01" });
    expect(r.feasible).toBe(false);
    expect(codes(r)).toContain("not_actionable_within_horizon");
  });

  it("acts at a usable break option and asks for the penalty", () => {
    const r = run(
      { ...common, horizonYears: 1, type: "partial_surrender_at_expiry", siteId: "a", effectiveDate: "2027-01-01" },
      [siteA({ breakDate: "2027-09-30", breakNoticeMonths: 6 })],
    );
    expect(r.feasible).toBe(true);
    expect(codes(r)).toContain("no_termination_penalty");
  });

  it("falls back to expiry when the break notice window has passed", () => {
    const r = run(
      { ...common, horizonYears: 1, type: "partial_surrender_at_expiry", siteId: "a", effectiveDate: "2027-01-01" },
      [siteA({ breakDate: "2027-03-31", breakNoticeMonths: 6 })],
    );
    expect(r.feasible).toBe(false);
    expect(codes(r)).toContain("not_actionable_within_horizon");
  });
});

describe("partial surrender mid-term", () => {
  it("surrenders the surplus with a premium", () => {
    // Surrender 1,000 sq ft at month 6. Monthly: full 41,666.67; retained 37,500; after renewal 33,750.
    // Year 1: 6 × 41,666.67 + 6 × 37,500 = 475,000. Year 2: 450,000. Year 3: 405,000.
    // One-time: make-good 10,000 + premium 20,000 = 30,000; fees 1,800; total 31,800.
    // Deltas: 500,000 − 475,000 − 31,800 = −6,800; 50,000; 45,000.
    // Payback: month 6 = 4,166.67 − 31,800 = −27,633.33; +4,166.67/month; last negative month 12 → 7 months.
    const r = run({
      ...common,
      type: "partial_surrender_mid_term",
      siteId: "a",
      effectiveDate: "2027-07-01",
      oneTimeCosts: { surrenderPremium: 20000 },
    });
    expect(r.feasible).toBe(true);
    expect(column(r, "scenarioOccupancyCost")).toEqual(["475000.00", "450000.00", "405000.00"]);
    expect(column(r, "delta")).toEqual(["-6800.00", "50000.00", "45000.00"]);
    expect(column(r, "cumulativeDelta")).toEqual(["-6800.00", "43200.00", "88200.00"]);
    expect(r.financials?.payback).toEqual({ status: "months", months: 7 });
    expect(codes(r)).toContain("requires_landlord_agreement");
    expect(codes(r)).not.toContain("no_surrender_premium");
  });

  it("is infeasible with negative surplus", () => {
    // 60 × 200 = 12,000 required against 10,000 → surplus −2,000.
    const r = run({ ...common, targetDensity: 200, type: "partial_surrender_mid_term", siteId: "a", effectiveDate: "2027-07-01" });
    expect(r.feasible).toBe(false);
    expect(codes(r)).toContain("no_surplus");
  });

  it("is infeasible when the lease has already expired", () => {
    const r = run(
      { ...common, type: "partial_surrender_mid_term", siteId: "a", effectiveDate: "2027-01-01" },
      [siteA({ leaseExpiry: "2026-06-30" })],
    );
    expect(r.feasible).toBe(false);
    expect(codes(r)).toContain("not_mid_term");
  });
});

describe("sublet surplus", () => {
  it("receives discounted rent after the default void", () => {
    // Sublet 1,000 sq ft from month 0; default 9-month void; income months 9–23 at 1,000 × 50 × 0.8 / 12 = 3,333.33.
    // Year 1: 3 months = 10,000. Year 2: 40,000. Year 3: head lease expired, nothing.
    // One-time: fit-out 15,000 + fees 900 = 15,900 at month 0.
    // Payback: −15,900 then +3,333.33 from month 9; last negative month 12 → 13 months.
    const r = run(
      { ...common, type: "sublet_surplus", siteId: "a", effectiveDate: "2027-01-01", subletDiscountPct: 20, oneTimeCosts: { fitOut: 15000 } },
      [siteA()],
      [TEST_MARKET_RENT, TEST_SUBLET_MARKET],
    );
    expect(r.feasible).toBe(true);
    expect(column(r, "subletIncome")).toEqual(["10000.00", "40000.00", "0.00"]);
    expect(column(r, "delta")).toEqual(["-5900.00", "40000.00", "0.00"]);
    expect(r.financials?.payback).toEqual({ status: "months", months: 13 });
    expect(fixed(r.noTakerCase?.cumulativeDelta)).toBe("-15900.00");
    expect(r.noTakerCase?.payback).toEqual({ status: "never" });
    expect(r.assumptions.find((a) => a.key === "sublet_void_months")).toMatchObject({ value: "9 months", source: "default" });
    expect(r.constraints.find((c) => c.code === "sublet_market_thin")?.message).toContain("12.5%");
    expect(codes(r)).toContain("sublet_void_risk");
  });

  it("says so when there is no sublet benchmark", () => {
    const r = run({ ...common, type: "sublet_surplus", siteId: "a", effectiveDate: "2027-01-01", subletDiscountPct: 20 });
    expect(codes(r)).toContain("no_sublet_benchmark");
    expect(codes(r)).not.toContain("sublet_market_thin");
  });
});

describe("close and absorb", () => {
  const closeInput = (overrides: Partial<Extract<ScenarioInput, { type: "close_and_absorb" }>> = {}): ScenarioInput => ({
    ...common,
    type: "close_and_absorb",
    siteId: "a",
    exitMechanism: "expiry",
    effectiveDate: "2028-01-01",
    allocations: [{ receivingSiteId: "b", headcount: 100 }],
    oneTimeCosts: { moving: 30000, it: 10000 },
    ...overrides,
  });

  it("moves people early and double-runs until expiry", () => {
    // B: 20,000 sq ft, 60 peak; after move 120 peak × 150 = 18,000 ≤ 20,000.
    // Baseline: 1,500,000 / 1,500,000 / 1,450,000. Scenario rent: 1,500,000 / 1,000,000 / 1,000,000.
    // Double-running months 12–23 = 500,000. Make-good 100,000 at month 24.
    // Fee base 100,000 + 30,000 + 10,000 + 500,000 = 640,000; fees 38,400; total 678,400.
    // Year 2 one-time 500,000 + 78,400 = 578,400 → delta −78,400. Year 3: 1,450,000 − 1,000,000 − 100,000 = 350,000.
    // Payback: −78,400 at month 12; month 24 −62,500 → −140,900; +37,500/month; last negative month 27 → 16 months.
    const r = run(closeInput(), [siteA(), siteB()]);
    expect(r.feasible).toBe(true);
    expect(r.baseline.annualCost.map(fixed)).toEqual(["1500000.00", "1500000.00", "1450000.00"]);
    expect(column(r, "scenarioOccupancyCost")).toEqual(["1500000.00", "1000000.00", "1000000.00"]);
    expect(column(r, "oneTimeCost")).toEqual(["0.00", "578400.00", "100000.00"]);
    expect(column(r, "delta")).toEqual(["0.00", "-78400.00", "350000.00"]);
    expect(fixed(r.financials?.oneTimeCosts.doubleRunning)).toBe("500000.00");
    expect(fixed(r.financials?.oneTimeCosts.total)).toBe("678400.00");
    expect(r.financials?.payback).toEqual({ status: "months", months: 16 });
    expect(fixed(r.space?.sites[0]?.areaPerPeakOccupant)).toBe("166.67");
  });

  it("is infeasible when the receiving site has no spare capacity", () => {
    // B at 9,000 sq ft holds floor(9,000 / 150) = 60 peak occupants and already has 60.
    const r = run(closeInput(), [siteA(), siteB({ rentableArea: 9000 })]);
    expect(r.feasible).toBe(false);
    expect(r.constraints.find((c) => c.code === "receiving_capacity_exceeded")?.message).toContain("60 existing + 60 moved");
    expect(r.financials).toBeNull();
    expect(r.baseline.total).not.toBeNull();
  });

  it("is infeasible without a mechanism to leave mid-term", () => {
    const r = run(closeInput({ exitMechanism: "none" }), [siteA(), siteB()]);
    expect(r.feasible).toBe(false);
    expect(codes(r)).toContain("no_exit_mechanism");
  });

  it("is infeasible when the break notice window has passed", () => {
    const r = run(closeInput({ exitMechanism: "break_option" }), [siteA({ breakDate: "2027-03-31", breakNoticeMonths: 6 }), siteB()]);
    expect(r.feasible).toBe(false);
    expect(codes(r)).toContain("break_unavailable");
  });

  it("is infeasible when people are left unallocated", () => {
    const r = run(closeInput({ allocations: [{ receivingSiteId: "b", headcount: 80 }] }), [siteA(), siteB()]);
    expect(codes(r)).toContain("unallocated_headcount");
    expect(r.feasible).toBe(false);
  });
});

describe("blend and extend", () => {
  it("reports the full committed term, not just the headline rent", () => {
    // Net $26 from month 0, 3 months net-free. Free months: 10,000 × 20 / 12 = 16,666.67; then 38,333.33.
    // Year 1: 50,000 + 9 × 38,333.33 = 395,000. Years 2–3: 460,000.
    // Deltas: 105,000; 40,000; 450,000 − 460,000 = −10,000.
    // Full term 2027-01 to 2033-12 = 84 months: 50,000 + 81 × 38,333.33 = 3,155,000.
    const r = run({
      ...common,
      type: "blend_and_extend",
      siteId: "a",
      effectiveDate: "2027-01-01",
      newNetRentPsf: 26,
      newExpiryDate: "2033-12-31",
      freeRentMonths: 3,
    });
    expect(r.feasible).toBe(true);
    expect(column(r, "scenarioOccupancyCost")).toEqual(["395000.00", "460000.00", "460000.00"]);
    expect(column(r, "delta")).toEqual(["105000.00", "40000.00", "-10000.00"]);
    expect(fixed(r.financials?.npvOfDelta)).toBe("135000.00");
    expect(r.financials?.payback).toEqual({ status: "immediate" });
    expect(r.fullTermCost?.months).toBe(84);
    expect(fixed(r.fullTermCost?.cost)).toBe("3155000.00");
    expect(codes(r)).toContain("commitment_beyond_horizon");
  });

  it("is infeasible when the new expiry does not extend the lease", () => {
    const r = run({ ...common, type: "blend_and_extend", siteId: "a", effectiveDate: "2027-01-01", newNetRentPsf: 26, newExpiryDate: "2028-06-30" });
    expect(r.feasible).toBe(false);
    expect(codes(r)).toContain("no_extension");
  });
});

describe("relocate and consolidate", () => {
  it("double-runs both the old sites and the new lease", () => {
    // A (60 peak) and C (8,000 sq ft, net 28 + add 18, 40 peak) exit at expiry (month 24) into 14,000 sq ft
    // at net 27 + add 19, commencing month 18, move month 21, 6 months net-free. Target 130: 100 × 130 = 13,000 ≤ 14,000.
    // Baseline: A + C = 868,000 / 868,000 / 794,000 (C year 3: 8,000 × 43 = 344,000).
    // Old sites months 0–20 at 72,333.33/month. New lease net-free months 18–23 at 14,000 × 19 / 12 = 22,166.67.
    // Year 2 rent: 9 × 72,333.33 + 3 × 22,166.67 = 717,500. Year 3: 14,000 × 46 = 644,000.
    // Double-running: old 3 × 72,333.33 = 217,000 + new 3 × 22,166.67 = 66,500 → 283,500.
    // Make-good 100,000 + 96,000 = 196,000. Fit-out 1,400,000 − TI 1,000,000 = 400,000. Moving 50,000.
    // Fee base 929,500; fees 55,770; total 985,270. Year 2 one-time 283,500 + 505,770 = 789,270; year 3 196,000.
    // Deltas: 0; 868,000 − 717,500 − 789,270 = −638,770; 794,000 − 644,000 − 196,000 = −46,000.
    const r = run(
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
      [siteA(), siteC()],
    );
    expect(r.feasible).toBe(true);
    expect(r.baseline.annualCost.map(fixed)).toEqual(["868000.00", "868000.00", "794000.00"]);
    expect(column(r, "scenarioOccupancyCost")).toEqual(["868000.00", "717500.00", "644000.00"]);
    expect(fixed(r.financials?.oneTimeCosts.doubleRunning)).toBe("283500.00");
    expect(fixed(r.financials?.oneTimeCosts.total)).toBe("985270.00");
    expect(column(r, "oneTimeCost")).toEqual(["0.00", "789270.00", "196000.00"]);
    expect(column(r, "delta")).toEqual(["0.00", "-638770.00", "-46000.00"]);
    expect(r.financials?.payback).toEqual({ status: "never" });
    expect(r.space?.areaReleased.toString()).toBe("18000");
    expect(r.space?.areaAdded.toString()).toBe("14000");
    expect(fixed(r.space?.sites[0]?.areaPerPeakOccupant)).toBe("140.00");
  });

  it("needs at least two sites", () => {
    const r = run(
      {
        ...common,
        type: "relocate_and_consolidate",
        effectiveDate: "2028-10-01",
        exits: [{ siteId: "a", exitMechanism: "expiry" }],
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
        },
      },
      [siteA(), siteC()],
    );
    expect(codes(r)).toContain("needs_two_sites");
  });
});

describe("general rules", () => {
  it("labels defaults and always states the currency", () => {
    const r = evaluateScenario(
      { valuationDate: VALUATION_DATE, targetDensity: 150, type: "densify_in_place", siteId: "a", effectiveDate: "2027-01-01" },
      { sites: [siteA()], benchmarks: [TEST_MARKET_RENT] },
    );
    expect(r.currency).toBe("CAD");
    const byKey = Object.fromEntries(r.assumptions.map((a) => [a.key, a]));
    expect(byKey.horizon_years).toMatchObject({ value: "10 years", source: "default" });
    expect(byKey.discount_rate_pct).toMatchObject({ value: "8%", source: "default" });
    expect(byKey.professional_fees_pct?.source).toBe("default");
    expect(byKey.business_disruption?.value).toBe("Not supplied; excluded");
    expect(r.baseline.annualCost).toHaveLength(10);
  });

  it("returns unknown rather than an estimate when the market rent is missing", () => {
    const r = run({ ...common, type: "partial_surrender_at_expiry", siteId: "a", effectiveDate: "2027-01-01" }, [siteA()], []);
    expect(r.feasible).toBe(true);
    expect(codes(r)).toContain("missing_market_rent");
    expect(r.financials?.years[2]?.delta).toBeNull();
    expect(r.financials?.npvOfDelta).toBeNull();
    expect(r.financials?.payback).toEqual({ status: "unknown" });
  });

  it("warns when no one-time costs were entered, rather than present the action as free", () => {
    const bare = run({ ...common, type: "sublet_surplus", siteId: "a", effectiveDate: "2027-01-01", subletDiscountPct: 20 });
    expect(bare.constraints.find((c) => c.code === "no_one_time_costs")?.message).toContain("leasing commission");
    const costed = run({ ...common, type: "sublet_surplus", siteId: "a", effectiveDate: "2027-01-01", subletDiscountPct: 20, oneTimeCosts: { fitOut: 15000 } });
    expect(codes(costed)).not.toContain("no_one_time_costs");
  });

  it("rejects an effective date before the valuation date", () => {
    const r = run({ ...common, type: "densify_in_place", siteId: "a", effectiveDate: "2026-06-01" });
    expect(r.feasible).toBe(false);
    expect(codes(r)).toContain("effective_date_before_valuation");
  });
});
