import { describe, expect, it } from "vitest";
import { addYears, monthEnd, monthStart } from "../dates";
import { rankOptions, type OptionRates } from "../options";
import { TEST_MARKET_RENT, VALUATION_DATE, siteA, siteB, siteC } from "./fixtures";

// Worked example. A and B are in Toronto; C is in Ottawa. 3-year horizon, 0% discount, 150 sq ft per peak occupant.
// A: 10,000 sq ft, 60 peak, net 30 + add 20, expires month 24. B: 20,000 sq ft, 60 peak, net 30 + add 20, expires month 60.
// C: 8,000 sq ft, 40 peak, net 28 + add 18, expires month 24. Market net rent 25 (Toronto, and national for Ottawa).
const nationalClassA = { ...TEST_MARKET_RENT, market: "Canada" };
const rates: OptionRates = {
  targetDensity: 150,
  fitOutPsf: 50,
  movingPerPerson: 500,
  itPerPerson: 1000,
  subletDiscountPct: 20,
  extensionYears: 5,
  surrenderPremiumMonths: 6,
  newLeaseTermYears: 10,
  newLeaseTiPsf: 40,
  newLeaseFreeRentMonths: 6,
};

const result = rankOptions({
  valuationDate: VALUATION_DATE,
  sites: [siteA(), siteB(), siteC({ city: "Ottawa" })],
  benchmarks: [TEST_MARKET_RENT, nationalClassA],
  rates,
  horizonYears: 3,
  discountRatePct: 0,
});
const npv = (key: string) => result.ranked.find((o) => o.key === key)?.result.financials?.npvOfDelta?.toFixed(2);

describe("rankOptions", () => {
  it("ranks every strategy's feasible options by NPV, best first", () => {
    expect(result.ranked.map((o) => [o.key, o.result.financials?.npvOfDelta?.toFixed(2)])).toEqual([
      ["partial_surrender_mid_term:b", "1241900.00"],
      ["sublet_surplus:b", "990000.00"],
      ["blend_and_extend:b", "300000.00"],
      ["partial_surrender_mid_term:c", "195800.00"],
      ["partial_surrender_mid_term:a", "107900.00"],
      ["blend_and_extend:a", "100000.00"],
      ["sublet_surplus:c", "92000.00"],
      ["partial_surrender_at_expiry:c", "60560.00"],
      ["sublet_surplus:a", "50000.00"],
      ["blend_and_extend:c", "48000.00"],
      ["partial_surrender_at_expiry:a", "34400.00"],
      ["close_and_absorb:a:b", "-292000.00"],
      ["densify_in_place:c", "-424000.00"],
      ["densify_in_place:a", "-530000.00"],
      ["densify_in_place:b", "-1060000.00"],
    ]);
  });

  it("prices a mid-term surrender premium as months of rent on the surrendered space", () => {
    // A: surplus 1,000 sq ft × $50 gross × 6/12 = 25,000 premium; make-good 10,000; fees 6% = 2,100; total 37,100.
    // Saving 1,000 × 50 = 50,000 a year for two years, then 1,000 × 45 = 45,000 after renewal: 145,000 − 37,100 = 107,900.
    const a = result.ranked.find((o) => o.key === "partial_surrender_mid_term:a")?.result.financials;
    expect(a?.oneTimeCosts.surrenderPremium.toFixed(2)).toBe("25000.00");
    expect(a?.oneTimeCosts.total?.toFixed(2)).toBe("37100.00");
  });

  it("blends to the benchmark market rent and extends by the given years", () => {
    // B: net 30 → 25 from today; 20,000 × 5 = 100,000 a year for 3 years. No one-time costs entered, so it carries a warning.
    const b = result.ranked.find((o) => o.key === "blend_and_extend:b");
    expect(npv("blend_and_extend:b")).toBe("300000.00");
    expect(b?.result.assumptions.find((x) => x.key === "new_expiry_date")?.value).toBe("2036-12-31");
    expect(b?.result.constraints.map((c) => c.code)).toContain("no_one_time_costs");
  });

  it("costs densifying as fit-out across the whole site", () => {
    // A: 10,000 × $50 = 500,000 + 6% fees = 530,000; no rent saving.
    expect(npv("densify_in_place:a")).toBe("-530000.00");
  });

  it("moves people when the lease ends, so close-and-absorb has no double-running rent", () => {
    const close = result.ranked.find((o) => o.key === "close_and_absorb:a:b");
    expect(close?.result.financials?.oneTimeCosts.doubleRunning?.toString()).toBe("0");
    expect(close?.result.financials?.oneTimeCosts.total?.toFixed(2)).toBe("742000.00");
  });

  it("explains every option it rules out", () => {
    const reasons = Object.fromEntries(result.ruledOut.map((r) => [r.key, r.reason]));
    expect(reasons["partial_surrender_at_expiry:b"]).toContain("beyond the horizon");
    expect(reasons["close_and_absorb:b"]).toContain("surrender premium");
    expect(reasons["close_and_absorb:c"]).toContain("No other site in Ottawa");
    expect(reasons["relocate_and_consolidate:toronto"]).toContain("Sample Site B's lease runs to month 60");
    expect(reasons["relocate_and_consolidate:ottawa"]).toContain("two or more sites");
  });

  it("rules out blending when rent is already at or below market", () => {
    const atMarket = rankOptions({
      valuationDate: VALUATION_DATE,
      sites: [siteA({ netRentPsf: 25 })],
      benchmarks: [TEST_MARKET_RENT],
      rates,
      horizonYears: 3,
    });
    expect(atMarket.ruledOut.find((r) => r.key === "blend_and_extend:a")?.reason).toContain("already at or below market");
  });

  it("always reports the baseline", () => {
    // A 1,450,000 + B 3,000,000 + C (368,000 + 368,000 + 344,000) = 5,530,000.
    expect(result.baseline.total?.toFixed(2)).toBe("5530000.00");
  });

  it("rules out closing into a site without room", () => {
    const full = rankOptions({
      valuationDate: VALUATION_DATE,
      sites: [siteA(), siteB({ rentableArea: 9000 })],
      benchmarks: [TEST_MARKET_RENT],
      rates,
      horizonYears: 3,
    });
    expect(full.ruledOut.find((r) => r.key === "close_and_absorb:a:b")?.reason).toContain("can hold 60 peak occupants");
  });
});

describe("relocate and consolidate candidates", () => {
  it("prices a new lease at market, sized for the combined peak", () => {
    // A (10,000 sq ft) and B' (20,000 sq ft, expiring with A at month 24), 60 peak each → 120 × 150 = 18,000 sq ft.
    // New lease from month 24 at net 25 + additional 20 (area-weighted), 6 months net-free:
    //   6 × 18,000 × 20 / 12 = 180,000 + 6 × 18,000 × 45 / 12 = 405,000 → 585,000 in year 3.
    // Baseline year 3: A 450,000 + B' 900,000 = 1,350,000.
    // One-time: make-good 100,000 + 200,000; fit-out 18,000 × 50 = 900,000 − TI 18,000 × 40 = 720,000 → 180,000;
    //   moving 200 × 500 = 100,000; IT 200 × 1,000 = 200,000. Base 780,000; fees 46,800; total 826,800.
    // Year 3 saving: 1,350,000 − 585,000 − 826,800 = −61,800.
    const both = rankOptions({
      valuationDate: VALUATION_DATE,
      sites: [siteA(), siteB({ leaseExpiry: "2028-12-31" })],
      benchmarks: [TEST_MARKET_RENT],
      rates,
      horizonYears: 3,
      discountRatePct: 0,
    });
    const relocate = both.ranked.find((o) => o.key === "relocate_and_consolidate:toronto")?.result;
    expect(relocate?.space?.areaAdded.toString()).toBe("18000");
    expect(relocate?.financials?.years.map((y) => y.scenarioOccupancyCost?.toFixed(2))).toEqual([
      "1500000.00",
      "1500000.00",
      "585000.00",
    ]);
    expect(relocate?.financials?.oneTimeCosts.total?.toFixed(2)).toBe("826800.00");
    expect(relocate?.financials?.oneTimeCosts.doubleRunning?.toString()).toBe("0");
    expect(relocate?.financials?.npvOfDelta?.toFixed(2)).toBe("-61800.00");
  });
});

describe("dates", () => {
  it("rolls over year ends", () => {
    expect(monthStart("2027-01-15", 0)).toBe("2027-01-01");
    expect(monthStart("2027-01-15", 24)).toBe("2029-01-01");
    expect(monthStart("2026-11-30", 2)).toBe("2027-01-01");
    expect(monthEnd("2027-01-01", 1)).toBe("2027-02-28");
    expect(monthEnd("2027-01-01", 143)).toBe("2038-12-31");
  });

  it("adds years, clamping 29 February", () => {
    expect(addYears("2028-12-31", 5)).toBe("2033-12-31");
    expect(addYears("2028-02-29", 1)).toBe("2029-02-28");
  });
});
