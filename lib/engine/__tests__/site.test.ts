import { describe, expect, it } from "vitest";
import { monthAfterEnd, monthIndex, parseIsoDate } from "../dates";
import {
  areaPerPeakOccupant,
  grossRentPsf,
  isActionable,
  leaseTiming,
  peakOccupants,
  requiredArea,
  surplusArea,
} from "../site";
import { VALUATION_DATE, siteA } from "./fixtures";

describe("dates", () => {
  it("counts calendar months from the valuation month", () => {
    expect(monthIndex("2027-01-15", "2028-03-01")).toBe(14);
    expect(monthIndex("2027-01-01", "2026-06-30")).toBe(-7);
    expect(monthAfterEnd("2027-01-01", "2028-12-31")).toBe(24);
  });

  it("rejects malformed dates", () => {
    expect(() => parseIsoDate("2027-13-01")).toThrow();
    expect(() => parseIsoDate("1/1/2027")).toThrow();
  });
});

describe("occupancy arithmetic", () => {
  it("rounds peak occupants half up", () => {
    expect(peakOccupants(100, 60)).toBe(60);
    expect(peakOccupants(7, 50)).toBe(4);
    expect(peakOccupants(101, 45)).toBe(45);
  });

  it("handles zero headcount", () => {
    expect(peakOccupants(0, 60)).toBe(0);
    expect(requiredArea(0, 150).toString()).toBe("0");
    expect(areaPerPeakOccupant(10000, 0)).toBeNull();
  });

  it("computes required and surplus area, including negative surplus", () => {
    expect(requiredArea(60, 150).toString()).toBe("9000");
    expect(surplusArea(10000, requiredArea(60, 150)).toString()).toBe("1000");
    expect(surplusArea(5000, requiredArea(60, 150)).toString()).toBe("-4000");
  });

  it("keeps net and additional rent separate until summed", () => {
    expect(grossRentPsf(30, 20).toString()).toBe("50");
    expect(grossRentPsf("31.25", "18.40").toString()).toBe("49.65");
  });

  it("does not round area per occupant", () => {
    expect(areaPerPeakOccupant(10000, 60)?.toFixed(4)).toBe("166.6667");
  });
});

describe("leaseTiming", () => {
  it("uses expiry when there is no break option", () => {
    const t = leaseTiming(siteA(), VALUATION_DATE);
    expect(t).toMatchObject({ expiryMonth: 24, expired: false, breakStatus: "none", monthsToAction: 24, actionVia: "expiry" });
  });

  it("uses a break option when its notice can still be met", () => {
    const t = leaseTiming(siteA({ breakDate: "2027-12-31", breakNoticeMonths: 6 }), VALUATION_DATE);
    expect(t).toMatchObject({ breakStatus: "usable", breakMonth: 12, monthsToAction: 12, actionVia: "break_option" });
  });

  it("allows a break whose notice deadline is this month", () => {
    const t = leaseTiming(siteA({ breakDate: "2027-07-31", breakNoticeMonths: 6 }), VALUATION_DATE);
    expect(t.breakStatus).toBe("usable");
    expect(t.monthsToAction).toBe(7);
  });

  it("ignores a break option whose notice window has passed", () => {
    const t = leaseTiming(siteA({ breakDate: "2027-03-31", breakNoticeMonths: 6 }), VALUATION_DATE);
    expect(t).toMatchObject({ breakStatus: "notice_passed", breakMonth: null, monthsToAction: 24, actionVia: "expiry" });
  });

  it("ignores a break date on or after expiry", () => {
    const t = leaseTiming(siteA({ breakDate: "2029-06-30", breakNoticeMonths: 6 }), VALUATION_DATE);
    expect(t.breakStatus).toBe("after_expiry");
    expect(t.monthsToAction).toBe(24);
  });

  it("treats a lease already expired as actionable now", () => {
    const t = leaseTiming(siteA({ leaseExpiry: "2026-06-30" }), VALUATION_DATE);
    expect(t).toMatchObject({ expired: true, expiryMonth: 0, monthsToAction: 0 });
  });
});

describe("isActionable", () => {
  it("requires the action to fall within the horizon unless a mid-term mechanism is used", () => {
    expect(isActionable(120, 120, false)).toBe(true);
    expect(isActionable(130, 120, false)).toBe(false);
    expect(isActionable(130, 120, true)).toBe(true);
  });
});
