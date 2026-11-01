import { describe, expect, it } from "vitest";
import { computeBaseline } from "../baseline";
import { findMarketRent, findSubletMarket } from "../benchmarks";
import { ZERO, dec } from "../decimal";
import { npv, payback } from "../finance";
import { monthlyAmount, psfAt, toYears, type Tranche } from "../ledger";
import { computeOneTimeCosts } from "../one-time";
import { TEST_MARKET_RENT, TEST_SUBLET_MARKET, VALUATION_DATE, siteA } from "./fixtures";

const ctx = (horizonYears: number, benchmarks = [TEST_MARKET_RENT]) => ({
  valuationDate: VALUATION_DATE,
  horizonMonths: horizonYears * 12,
  benchmarks,
});

function tranche(overrides: Partial<Tranche> = {}): Tranche {
  return {
    label: "t",
    siteId: "a",
    kind: "occupancy",
    area: dec(1200),
    startMonth: 0,
    endMonth: 12,
    net: { basePsf: dec(30), escalationPct: dec(0), anchorMonth: 0 },
    additional: { basePsf: dec(20), escalationPct: dec(0), anchorMonth: 0 },
    freeRentMonths: 0,
    factor: dec(1),
    ...overrides,
  };
}

describe("ledger", () => {
  it("steps escalation every 12 months from the anchor", () => {
    const path = { basePsf: dec(30), escalationPct: dec(3), anchorMonth: 0 };
    expect(psfAt(path, 11)?.toString()).toBe("30");
    expect(psfAt(path, 12)?.toString()).toBe("30.9");
    expect(psfAt(path, 24)?.toString()).toBe("31.827");
  });

  it("costs a month at area × gross psf / 12", () => {
    expect(monthlyAmount(tranche(), 0)?.toString()).toBe("5000");
    expect(monthlyAmount(tranche(), 12)?.toString()).toBe("0");
  });

  it("applies free rent to net rent in the months it falls", () => {
    const t = tranche({ freeRentMonths: 2 });
    expect(monthlyAmount(t, 0)?.toString()).toBe("2000");
    expect(monthlyAmount(t, 1)?.toString()).toBe("2000");
    expect(monthlyAmount(t, 2)?.toString()).toBe("5000");
  });

  it("returns null when a rate is unknown", () => {
    expect(monthlyAmount(tranche({ net: { basePsf: null, escalationPct: dec(0), anchorMonth: 0 } }), 0)).toBeNull();
  });

  it("groups months into years and propagates unknowns", () => {
    const months = [...Array.from({ length: 12 }, () => dec(1)), ...Array.from({ length: 12 }, () => null)];
    const years = toYears(months);
    expect(years[0]?.toString()).toBe("12");
    expect(years[1]).toBeNull();
  });
});

describe("baseline", () => {
  it("holds, then renews at market at expiry", () => {
    // Years 1–2: 10,000 × (30 + 20) = 500,000. Year 3: 10,000 × (25 + 20) = 450,000.
    const b = computeBaseline(ctx(3), [siteA()]);
    expect(b.annualCost.map((y) => y?.toFixed(2))).toEqual(["500000.00", "500000.00", "450000.00"]);
    expect(b.total?.toFixed(2)).toBe("1450000.00");
    expect(b.constraints).toEqual([]);
  });

  it("escalates net and additional rent separately", () => {
    // Year 2: 10,000 × (30.6 + 20.6) = 512,000.
    // Year 3: market net 25 (fresh at renewal) + additional 20 × 1.03² = 21.218 → 462,180.
    const b = computeBaseline(ctx(3), [siteA({ netEscalationPct: 2, additionalEscalationPct: 3 })]);
    expect(b.annualCost.map((y) => y?.toFixed(2))).toEqual(["500000.00", "512000.00", "462180.00"]);
  });

  it("reports unknown costs, not an estimate, when the market benchmark is missing", () => {
    const b = computeBaseline(ctx(3, []), [siteA()]);
    expect(b.annualCost[0]?.toFixed(2)).toBe("500000.00");
    expect(b.annualCost[2]).toBeNull();
    expect(b.total).toBeNull();
    expect(b.constraints.map((c) => c.code)).toEqual(["missing_market_rent"]);
  });

  it("renews an already-expired lease at market from month 0", () => {
    const b = computeBaseline(ctx(1), [siteA({ leaseExpiry: "2026-06-30" })]);
    expect(b.annualCost[0]?.toFixed(2)).toBe("450000.00");
  });
});

describe("benchmarks", () => {
  it("uses the site's market, then the national figure for the same segment, never another segment", () => {
    const national = { ...TEST_MARKET_RENT, market: "Canada", netRentPsf: 22 };
    expect(findMarketRent([national, TEST_MARKET_RENT], "Class A", "Toronto")).toBe(TEST_MARKET_RENT);
    expect(findMarketRent([national, TEST_MARKET_RENT], "Class A", "Ottawa")).toBe(national);
    expect(findMarketRent([TEST_MARKET_RENT], "Class A", "Ottawa")).toBeNull();
    expect(findMarketRent([national, TEST_MARKET_RENT], "Class B", "Toronto")).toBeNull();
  });

  it("uses a national sublet figure only when no local one exists", () => {
    expect(findSubletMarket([TEST_SUBLET_MARKET], "Class A", "Toronto")).toBe(TEST_SUBLET_MARKET);
    expect(findSubletMarket([TEST_MARKET_RENT], "Class A", "Toronto")).toBeNull();
  });
});

describe("one-time costs", () => {
  it("charges 6% professional fees on everything but business disruption", () => {
    // Base: 50,000 make-good + (100,000 − 40,000) fit-out + 10,000 + 5,000 + 20,000 + 2,000 + 30,000 double-running = 177,000.
    // Fees 6% = 10,620. Total 187,620; with 25,000 disruption 212,620.
    const input = { fitOut: 100000, tiAllowance: 40000, moving: 10000, it: 5000, furniture: 20000, signage: 2000 };
    const c = computeOneTimeCosts(input, { makeGood: dec(50000), doubleRunning: dec(30000) });
    expect(c.fitOutNetOfTi.toString()).toBe("60000");
    expect(c.professionalFees?.toFixed(2)).toBe("10620.00");
    expect(c.total?.toFixed(2)).toBe("187620.00");
    expect(c.businessDisruption).toBeNull();

    const withDisruption = computeOneTimeCosts({ ...input, businessDisruption: 25000 }, { makeGood: dec(50000), doubleRunning: dec(30000) });
    expect(withDisruption.total?.toFixed(2)).toBe("212620.00");
  });

  it("floors fit-out at zero when the TI allowance exceeds it", () => {
    const c = computeOneTimeCosts({ fitOut: 10000, tiAllowance: 25000 }, { makeGood: ZERO, doubleRunning: ZERO });
    expect(c.fitOutNetOfTi.toString()).toBe("0");
  });

  it("is unknown when double-running rent is unknown", () => {
    const c = computeOneTimeCosts({ moving: 1000 }, { makeGood: ZERO, doubleRunning: null });
    expect(c.total).toBeNull();
  });
});

describe("finance", () => {
  it("discounts each month from its end", () => {
    // 1,080 at the end of month 12 at 8% → 1,080 / 1.08 = 1,000.
    const flows = [...Array.from({ length: 11 }, () => ZERO), dec(1080)];
    expect(npv(flows, 8)?.toFixed(6)).toBe("1000.000000");
    expect(npv([dec(100), dec(200)], 0)?.toString()).toBe("300");
    expect(npv([null], 8)).toBeNull();
  });

  it("measures payback from the first outlay", () => {
    expect(payback([dec(-100), dec(50), dec(50), dec(50)])).toEqual({ status: "months", months: 2 });
    expect(payback([ZERO, ZERO, dec(-60), dec(30), dec(30), dec(30)])).toEqual({ status: "months", months: 2 });
    expect(payback([dec(10), dec(10)])).toEqual({ status: "immediate" });
    expect(payback([dec(-100), dec(10), dec(10)])).toEqual({ status: "never" });
    expect(payback([null])).toEqual({ status: "unknown" });
  });
});
