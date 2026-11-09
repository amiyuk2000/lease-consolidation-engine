import { describe, expect, it } from "vitest";
import { NO_STANDARDS } from "@/lib/engine";
import { experienceStandardsSchema, parseStoredStandards, toEngineStandards } from "../experience";
import { siteUpdateSchema } from "../site";

const lease = {
  city: "Toronto",
  segment: "Central Class A",
  rentableArea: "10000",
  usableArea: "8700",
  headcount: "100",
  peakAttendancePct: "60",
  netRentPsf: "30",
  additionalRentPsf: "20",
  netEscalationPct: "0",
  additionalEscalationPct: "0",
  leaseStart: "2019-01-01",
  leaseExpiry: "2028-12-31",
  breakDate: "",
  breakNoticeMonths: "",
  makeGoodPsf: "10",
};

describe("experience standards", () => {
  it("treats blank targets as not set and removes repeated purposes", () => {
    const parsed = experienceStandardsSchema.parse({
      minSeatsPerPeakOccupant: "1",
      maxPeoplePerFocusRoom: "",
      maxPeoplePerConfidentialRoom: "",
      minSpaceTypes: "",
      purposes: ["focus", "focus", "socialising"],
      maxBusyQuietGapPts: "",
    });
    expect(toEngineStandards(parsed)).toEqual({ ...NO_STANDARDS, minSeatsPerPeakOccupant: "1", purposes: ["focus", "socialising"] });
  });

  it("rejects a zero people-per-room target, which would need infinite rooms", () => {
    const r = experienceStandardsSchema.safeParse({ maxPeoplePerFocusRoom: "0", purposes: [] });
    expect(r.success).toBe(false);
  });

  it("falls back to no standards when nothing valid is stored", () => {
    expect(parseStoredStandards(null)).toBeNull();
    expect(parseStoredStandards({ purposes: ["napping"] })).toBeNull();
    expect(toEngineStandards(null)).toEqual(NO_STANDARDS);
  });
});

describe("site workplace fields", () => {
  it("keeps blanks as unknown rather than zero", () => {
    const r = siteUpdateSchema.parse({ ...lease, workstations: "", focusRooms: "0", quietestAttendancePct: "" });
    expect(r.workstations).toBeUndefined();
    expect(r.focusRooms).toBe(0);
    expect(r.quietestAttendancePct).toBeUndefined();
  });

  it("rejects a quietest day busier than the peak", () => {
    const r = siteUpdateSchema.safeParse({ ...lease, quietestAttendancePct: "70" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["quietestAttendancePct"]);
  });
});
