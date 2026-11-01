import { z } from "zod";
import type { ExitMechanism, ScenarioInput } from "@/lib/engine";
import { decimalString, intField, isoDate, optionalDecimal, optionalInt, percentString } from "./common";

export const SCENARIO_TYPES = [
  "densify_in_place",
  "partial_surrender_at_expiry",
  "partial_surrender_mid_term",
  "sublet_surplus",
  "close_and_absorb",
  "blend_and_extend",
  "relocate_and_consolidate",
] as const;

export type ScenarioTypeKey = (typeof SCENARIO_TYPES)[number];

export const SCENARIO_LABELS: Record<ScenarioTypeKey, string> = {
  densify_in_place: "Densify in place",
  partial_surrender_at_expiry: "Partial surrender at expiry",
  partial_surrender_mid_term: "Partial surrender mid-term",
  sublet_surplus: "Sublet surplus",
  close_and_absorb: "Close and absorb",
  blend_and_extend: "Blend and extend",
  relocate_and_consolidate: "Relocate and consolidate",
};

export const SCENARIO_DESCRIPTIONS: Record<ScenarioTypeKey, string> = {
  densify_in_place: "Fit more people into an existing site without changing the lease. Saves no rent; shows the cost and the capacity gained.",
  partial_surrender_at_expiry: "Renew a smaller footprint at expiry or at a usable break option.",
  partial_surrender_mid_term: "Hand back part of the premises now, by agreement with the landlord, usually for a surrender premium.",
  sublet_surplus: "Let surplus space to a subtenant while staying liable under the head lease. Models the void period and the no-taker case.",
  close_and_absorb: "Exit a site and move its people into named receiving sites, checking their capacity.",
  blend_and_extend: "Lower the rent now in exchange for a longer term. Shows the full committed term, not just the headline rent.",
  relocate_and_consolidate: "Exit two or more sites into one new lease, including double-running rent during the overlap.",
};

export const EXIT_MECHANISMS = ["expiry", "break_option", "surrender", "assignment", "none"] as const satisfies readonly ExitMechanism[];

export const EXIT_LABELS: Record<ExitMechanism, string> = {
  expiry: "At lease expiry",
  break_option: "Break option",
  surrender: "Surrender (by agreement)",
  assignment: "Assignment",
  none: "No mechanism",
};

const siteId = z.uuid("Choose a site");

export const oneTimeCostsSchema = z.object({
  fitOut: optionalDecimal,
  tiAllowance: optionalDecimal,
  moving: optionalDecimal,
  it: optionalDecimal,
  furniture: optionalDecimal,
  signage: optionalDecimal,
  surrenderPremium: optionalDecimal,
  terminationPenalty: optionalDecimal,
  businessDisruption: optionalDecimal,
  professionalFeesPct: optionalDecimal,
});

const common = {
  name: z.string().trim().min(1, "Name the scenario").max(100),
  effectiveDate: isoDate,
  targetDensity: decimalString.refine((v) => Number(v) > 0, "Must be more than 0"),
  horizonYears: optionalInt(1, 25),
  discountRatePct: optionalDecimal,
  oneTimeCosts: oneTimeCostsSchema,
};

export const scenarioSchema = z.discriminatedUnion("type", [
  z.object({ ...common, type: z.literal("densify_in_place"), siteId }),
  z.object({ ...common, type: z.literal("partial_surrender_at_expiry"), siteId, retainedArea: optionalDecimal }),
  z.object({ ...common, type: z.literal("partial_surrender_mid_term"), siteId, releasedArea: optionalDecimal }),
  z.object({
    ...common,
    type: z.literal("sublet_surplus"),
    siteId,
    subletArea: optionalDecimal,
    subletDiscountPct: percentString,
    voidMonths: optionalInt(0, 120),
  }),
  z.object({
    ...common,
    type: z.literal("close_and_absorb"),
    siteId,
    exitMechanism: z.enum(EXIT_MECHANISMS),
    allocations: z
      .array(z.object({ receivingSiteId: siteId, headcount: intField(0, 100000) }))
      .min(1, "Add at least one receiving site"),
  }),
  z.object({
    ...common,
    type: z.literal("blend_and_extend"),
    siteId,
    newNetRentPsf: decimalString,
    newExpiryDate: isoDate,
    freeRentMonths: optionalInt(0, 60),
  }),
  z.object({
    ...common,
    type: z.literal("relocate_and_consolidate"),
    exits: z
      .array(z.object({ siteId, exitMechanism: z.enum(EXIT_MECHANISMS) }))
      .min(2, "Choose at least two sites to exit"),
    newLease: z.object({
      name: z.string().trim().min(1, "Name the new premises").max(100),
      city: z.string().trim().min(1, "Enter a city").max(100),
      segment: z.string().trim().min(1, "Choose a segment"),
      rentableArea: decimalString.refine((v) => Number(v) > 0, "Must be more than 0"),
      netRentPsf: decimalString,
      additionalRentPsf: decimalString,
      netEscalationPct: percentString,
      additionalEscalationPct: percentString,
      commencementDate: isoDate,
      expiryDate: isoDate,
      freeRentMonths: optionalInt(0, 60),
    }),
  }),
]);

export type ScenarioPayload = z.infer<typeof scenarioSchema>;

/** Every site the scenario refers to, so the server can check they belong to the portfolio. */
export function referencedSiteIds(s: ScenarioPayload): string[] {
  switch (s.type) {
    case "close_and_absorb":
      return [s.siteId, ...s.allocations.map((a) => a.receivingSiteId)];
    case "relocate_and_consolidate":
      return s.exits.map((e) => e.siteId);
    default:
      return [s.siteId];
  }
}

export function toEngineInput(s: ScenarioPayload, valuationDate: string): ScenarioInput {
  const oneTimeCosts = Object.fromEntries(Object.entries(s.oneTimeCosts).filter(([, v]) => v !== undefined));
  const common = {
    valuationDate,
    effectiveDate: s.effectiveDate,
    targetDensity: s.targetDensity,
    ...(s.horizonYears !== undefined ? { horizonYears: s.horizonYears } : {}),
    ...(s.discountRatePct !== undefined ? { discountRatePct: s.discountRatePct } : {}),
    oneTimeCosts,
  };
  switch (s.type) {
    case "densify_in_place":
      return { ...common, type: s.type, siteId: s.siteId };
    case "partial_surrender_at_expiry":
      return { ...common, type: s.type, siteId: s.siteId, ...(s.retainedArea ? { retainedArea: s.retainedArea } : {}) };
    case "partial_surrender_mid_term":
      return { ...common, type: s.type, siteId: s.siteId, ...(s.releasedArea ? { releasedArea: s.releasedArea } : {}) };
    case "sublet_surplus":
      return {
        ...common,
        type: s.type,
        siteId: s.siteId,
        subletDiscountPct: s.subletDiscountPct,
        ...(s.subletArea ? { subletArea: s.subletArea } : {}),
        ...(s.voidMonths !== undefined ? { voidMonths: s.voidMonths } : {}),
      };
    case "close_and_absorb":
      return { ...common, type: s.type, siteId: s.siteId, exitMechanism: s.exitMechanism, allocations: s.allocations };
    case "blend_and_extend":
      return {
        ...common,
        type: s.type,
        siteId: s.siteId,
        newNetRentPsf: s.newNetRentPsf,
        newExpiryDate: s.newExpiryDate,
        ...(s.freeRentMonths !== undefined ? { freeRentMonths: s.freeRentMonths } : {}),
      };
    case "relocate_and_consolidate":
      return {
        ...common,
        type: s.type,
        exits: s.exits,
        newLease: {
          ...s.newLease,
          ...(s.newLease.freeRentMonths !== undefined ? { freeRentMonths: s.newLease.freeRentMonths } : {}),
        },
      };
  }
}
