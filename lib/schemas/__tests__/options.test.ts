import { describe, expect, it } from "vitest";
import { generateCandidates, type OptionRates } from "@/lib/engine";
import { TEST_MARKET_RENT, VALUATION_DATE, siteA, siteB, siteC } from "@/lib/engine/__tests__/fixtures";
import { candidateToPayload } from "../options";
import { scenarioSchema } from "../scenario";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
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

describe("candidateToPayload", () => {
  it("turns every generated candidate, of every type, into a valid saved scenario", () => {
    const { candidates } = generateCandidates({
      valuationDate: VALUATION_DATE,
      // Site ids must be UUIDs to save; B shares A's expiry so a relocation is generated.
      sites: [siteA({ id: uuid(1) }), siteB({ id: uuid(2), leaseExpiry: "2028-12-31" }), siteC({ id: uuid(3) })],
      benchmarks: [TEST_MARKET_RENT],
      rates,
      horizonYears: 3,
    });
    expect(new Set(candidates.map((c) => c.input.type)).size).toBe(7);
    for (const c of candidates) {
      const parsed = scenarioSchema.safeParse(candidateToPayload(c.input, c.label));
      expect(parsed.success, `${c.key}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues)}`).toBe(true);
    }
  });
});
