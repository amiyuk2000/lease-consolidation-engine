import { z } from "zod";
import type { ScenarioInput } from "@/lib/engine";
import { decimalString, intField, optionalDecimal, optionalInt, percentString } from "./common";
import { SCENARIO_LABELS, type ScenarioPayload } from "./scenario";

export const optionRatesSchema = z.object({
  targetDensity: decimalString.refine((v) => Number(v) > 0, "Must be more than 0"),
  fitOutPsf: decimalString,
  movingPerPerson: decimalString,
  itPerPerson: decimalString,
  subletDiscountPct: percentString,
  extensionYears: intField(1, 30),
  surrenderPremiumMonths: decimalString,
  newLeaseTermYears: intField(1, 30),
  newLeaseTiPsf: decimalString,
  newLeaseFreeRentMonths: intField(0, 60),
  horizonYears: optionalInt(1, 25),
  discountRatePct: optionalDecimal,
});

export type OptionRatesValues = z.infer<typeof optionRatesSchema>;

export const RATE_GROUPS = [
  { title: "Planning", fields: ["targetDensity", "horizonYears", "discountRatePct"] },
  { title: "Moving and fit-out", fields: ["fitOutPsf", "movingPerPerson", "itPerPerson"] },
  {
    title: "Terms a landlord would negotiate",
    fields: ["subletDiscountPct", "surrenderPremiumMonths", "extensionYears", "newLeaseTermYears", "newLeaseTiPsf", "newLeaseFreeRentMonths"],
  },
] as const;

export type RateField = (typeof RATE_GROUPS)[number]["fields"][number];
export const RATE_FIELDS: RateField[] = RATE_GROUPS.flatMap((g) => [...g.fields]);
export const OPTIONAL_RATE_FIELDS: RateField[] = ["horizonYears", "discountRatePct"];

/** Invented sample rates, offered only on the sample portfolio and labelled as such. */
export const SAMPLE_RATES: Record<RateField, string> = {
  targetDensity: "150",
  horizonYears: "",
  discountRatePct: "",
  fitOutPsf: "110",
  movingPerPerson: "350",
  itPerPerson: "1200",
  subletDiscountPct: "25",
  surrenderPremiumMonths: "6",
  extensionYears: "5",
  newLeaseTermYears: "10",
  newLeaseTiPsf: "60",
  newLeaseFreeRentMonths: "6",
};

/** Turns a generated candidate back into a saveable scenario. */
export function candidateToPayload(input: ScenarioInput, name: string): ScenarioPayload {
  const s = (v: unknown) => (v === undefined || v === null ? undefined : String(v));
  const costs = input.oneTimeCosts ?? {};
  const common = {
    name: name.slice(0, 100) || SCENARIO_LABELS[input.type],
    effectiveDate: input.effectiveDate,
    targetDensity: String(input.targetDensity),
    horizonYears: input.horizonYears,
    discountRatePct: s(input.discountRatePct),
    oneTimeCosts: {
      fitOut: s(costs.fitOut),
      tiAllowance: s(costs.tiAllowance),
      moving: s(costs.moving),
      it: s(costs.it),
      furniture: s(costs.furniture),
      signage: s(costs.signage),
      surrenderPremium: s(costs.surrenderPremium),
      terminationPenalty: s(costs.terminationPenalty),
      businessDisruption: s(costs.businessDisruption),
      professionalFeesPct: s(costs.professionalFeesPct),
    },
  };
  switch (input.type) {
    case "densify_in_place":
      return { ...common, type: input.type, siteId: input.siteId };
    case "partial_surrender_at_expiry":
      return { ...common, type: input.type, siteId: input.siteId, retainedArea: s(input.retainedArea) };
    case "partial_surrender_mid_term":
      return { ...common, type: input.type, siteId: input.siteId, releasedArea: s(input.releasedArea) };
    case "sublet_surplus":
      return {
        ...common,
        type: input.type,
        siteId: input.siteId,
        subletArea: s(input.subletArea),
        subletDiscountPct: String(input.subletDiscountPct),
        voidMonths: input.voidMonths,
      };
    case "close_and_absorb":
      return { ...common, type: input.type, siteId: input.siteId, exitMechanism: input.exitMechanism, allocations: input.allocations.map((a) => ({ ...a })) };
    case "blend_and_extend":
      return {
        ...common,
        type: input.type,
        siteId: input.siteId,
        newNetRentPsf: String(input.newNetRentPsf),
        newExpiryDate: input.newExpiryDate,
        freeRentMonths: input.freeRentMonths,
      };
    case "relocate_and_consolidate": {
      const l = input.newLease;
      return {
        ...common,
        type: input.type,
        exits: input.exits.map((e) => ({ ...e })),
        newLease: {
          name: l.name.slice(0, 100),
          city: l.city,
          segment: l.segment,
          rentableArea: String(l.rentableArea),
          netRentPsf: String(l.netRentPsf),
          additionalRentPsf: String(l.additionalRentPsf),
          netEscalationPct: String(l.netEscalationPct),
          additionalEscalationPct: String(l.additionalEscalationPct),
          commencementDate: l.commencementDate,
          expiryDate: l.expiryDate,
          freeRentMonths: l.freeRentMonths,
        },
      };
    }
  }
}
