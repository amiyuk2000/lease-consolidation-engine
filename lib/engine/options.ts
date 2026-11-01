import { computeBaseline } from "./baseline";
import { findMarketRent, isNational } from "./benchmarks";
import { addYears, monthEnd, monthStart } from "./dates";
import { Decimal, ZERO, dec, type DecimalValue } from "./decimal";
import { DEFAULT_HORIZON_YEARS, evaluateScenario, type ScenarioInput, type ScenarioResult } from "./scenarios";
import { leaseTiming, peakOccupants, requiredArea, surplusArea } from "./site";
import type { Benchmark, SiteInput } from "./types";

/**
 * Portfolio-wide rates supplied by the user. The options search never assumes
 * one-time costs or negotiated terms: market rent comes from the benchmarks,
 * everything a landlord or contractor would set comes from these rates.
 */
export interface OptionRates {
  targetDensity: DecimalValue;
  /** Fit-out, $ per sq ft, for space being fitted: receiving space, new premises, or a site being densified. */
  fitOutPsf: DecimalValue;
  movingPerPerson: DecimalValue;
  itPerPerson: DecimalValue;
  /** Sublet rent as a discount to passing gross rent. */
  subletDiscountPct: DecimalValue;
  /** Years a blend and extend adds to the lease. */
  extensionYears: number;
  /** Surrender premium, as months of passing gross rent on the space surrendered. */
  surrenderPremiumMonths: DecimalValue;
  /** Term of a new lease when relocating. */
  newLeaseTermYears: number;
  /** TI allowance on a new lease, $ per sq ft. */
  newLeaseTiPsf: DecimalValue;
  newLeaseFreeRentMonths: number;
}

export interface OptionsInput {
  valuationDate: string;
  sites: ReadonlyArray<SiteInput>;
  benchmarks: ReadonlyArray<Benchmark>;
  rates: OptionRates;
  horizonYears?: number;
  discountRatePct?: DecimalValue;
}

export interface Candidate {
  key: string;
  label: string;
  input: ScenarioInput;
}

export interface RuledOut {
  key: string;
  label: string;
  reason: string;
}

export interface RankedOption {
  key: string;
  label: string;
  result: ScenarioResult;
}

export interface OptionsResult {
  baseline: { annualCost: Array<Decimal | null>; total: Decimal | null };
  /** Feasible options, best NPV first; options with an unknown NPV last. */
  ranked: RankedOption[];
  ruledOut: RuledOut[];
}

/**
 * Candidate scenarios for every strategy. Feasibility is left to the engine
 * wherever it can judge it, so its constraints report is the single source of
 * reasons; the generator rules out only what it cannot build at all.
 */
export function generateCandidates(input: OptionsInput): { candidates: Candidate[]; ruledOut: RuledOut[] } {
  const horizonMonths = (input.horizonYears ?? DEFAULT_HORIZON_YEARS) * 12;
  const { rates, valuationDate } = input;
  const common = {
    valuationDate,
    targetDensity: String(rates.targetDensity),
    ...(input.horizonYears !== undefined ? { horizonYears: input.horizonYears } : {}),
    ...(input.discountRatePct !== undefined ? { discountRatePct: String(input.discountRatePct) } : {}),
  };
  const candidates: Candidate[] = [];
  const ruledOut: RuledOut[] = [];

  for (const site of input.sites) {
    const timing = leaseTiming(site, valuationDate);
    const event = timing.actionVia === "break_option" ? "break option" : "lease expiry";
    const peak = peakOccupants(site.headcount, site.peakAttendancePct);
    const surplus = surplusArea(site.rentableArea, requiredArea(peak, rates.targetDensity));
    const gross = dec(site.netRentPsf).plus(site.additionalRentPsf);

    candidates.push({
      key: `densify_in_place:${site.id}`,
      label: `Densify ${site.name} in place (adds capacity, saves no rent)`,
      input: {
        ...common,
        type: "densify_in_place",
        siteId: site.id,
        effectiveDate: valuationDate,
        oneTimeCosts: { fitOut: dec(rates.fitOutPsf).times(site.rentableArea).toString() },
      },
    });

    candidates.push({
      key: `partial_surrender_at_expiry:${site.id}`,
      label: `Give back surplus at ${site.name} at its ${event}`,
      input: { ...common, type: "partial_surrender_at_expiry", siteId: site.id, effectiveDate: valuationDate },
    });

    candidates.push({
      key: `partial_surrender_mid_term:${site.id}`,
      label: `Surrender surplus at ${site.name} now, for ${dec(rates.surrenderPremiumMonths).toString()} months' rent`,
      input: {
        ...common,
        type: "partial_surrender_mid_term",
        siteId: site.id,
        effectiveDate: valuationDate,
        oneTimeCosts: {
          surrenderPremium: Decimal.max(ZERO, surplus).times(gross).times(rates.surrenderPremiumMonths).dividedBy(12).toString(),
        },
      },
    });

    candidates.push({
      key: `sublet_surplus:${site.id}`,
      label: `Sublet surplus at ${site.name}`,
      input: {
        ...common,
        type: "sublet_surplus",
        siteId: site.id,
        effectiveDate: valuationDate,
        subletDiscountPct: String(rates.subletDiscountPct),
      },
    });

    const blendLabel = `Blend and extend ${site.name} to market rent, +${rates.extensionYears} years`;
    const market = findMarketRent(input.benchmarks, site.segment, site.city);
    if (market === null || market.netRentPsf === null) {
      ruledOut.push({
        key: `blend_and_extend:${site.id}`,
        label: blendLabel,
        reason: `No market rent benchmark for ${site.segment}, so there is no market rent to blend to.`,
      });
    } else if (dec(market.netRentPsf).gte(site.netRentPsf)) {
      ruledOut.push({
        key: `blend_and_extend:${site.id}`,
        label: blendLabel,
        reason: `Net rent of $${dec(site.netRentPsf).toString()} is already at or below market ($${dec(market.netRentPsf).toString()}${isNational(market) ? ", national" : ""}); there is nothing to blend down.`,
      });
    } else {
      candidates.push({
        key: `blend_and_extend:${site.id}`,
        label: blendLabel,
        input: {
          ...common,
          type: "blend_and_extend",
          siteId: site.id,
          effectiveDate: valuationDate,
          newNetRentPsf: dec(market.netRentPsf).toString(),
          newExpiryDate: addYears(site.leaseExpiry, rates.extensionYears),
        },
      });
    }

    const closeLabel = `Close ${site.name}`;
    const receivers = input.sites.filter((r) => r.id !== site.id && sameCity(r.city, site.city));
    if (receivers.length === 0) {
      ruledOut.push({ key: `close_and_absorb:${site.id}`, label: closeLabel, reason: `No other site in ${site.city} to absorb its people.` });
      continue;
    }
    if (timing.monthsToAction >= horizonMonths) {
      ruledOut.push({ key: `close_and_absorb:${site.id}`, label: closeLabel, reason: beyondHorizon(site, timing.monthsToAction) });
      continue;
    }
    const moveCosts = {
      fitOut: dec(rates.fitOutPsf).times(peak).times(rates.targetDensity).toString(),
      moving: dec(rates.movingPerPerson).times(site.headcount).toString(),
      it: dec(rates.itPerPerson).times(site.headcount).toString(),
    };
    for (const receiver of receivers) {
      candidates.push({
        key: `close_and_absorb:${site.id}:${receiver.id}`,
        label: `Close ${site.name} into ${receiver.name} at its ${event}`,
        input: {
          ...common,
          type: "close_and_absorb",
          siteId: site.id,
          // Move when the lease ends, so there is no double-running rent.
          effectiveDate: monthStart(valuationDate, timing.monthsToAction),
          exitMechanism: timing.actionVia,
          allocations: [{ receivingSiteId: receiver.id, headcount: site.headcount }],
          oneTimeCosts: moveCosts,
        },
      });
    }
  }

  for (const group of groupByCity(input.sites)) {
    const built = relocateCandidate(input, group, horizonMonths, common);
    if ("reason" in built) ruledOut.push(built);
    else candidates.push(built);
  }

  return { candidates, ruledOut };
}

/** All of a city's sites into one new lease at market rent, sized for their combined peak occupants. */
function relocateCandidate(
  input: OptionsInput,
  group: ReadonlyArray<SiteInput>,
  horizonMonths: number,
  common: Pick<ScenarioInput, "valuationDate" | "targetDensity" | "horizonYears" | "discountRatePct">,
): Candidate | RuledOut {
  const { rates, valuationDate } = input;
  const largest = [...group].sort((a, b) => dec(b.rentableArea).comparedTo(a.rentableArea))[0]!;
  const city = largest.city;
  const key = `relocate_and_consolidate:${city.trim().toLowerCase()}`;
  const label = `Relocate the ${city} sites into one new lease at market rent`;
  if (group.length < 2) return { key, label, reason: `Needs two or more sites in ${city}.` };

  const timings = group.map((s) => ({ site: s, timing: leaseTiming(s, valuationDate) }));
  const late = timings.find((t) => t.timing.monthsToAction >= horizonMonths);
  if (late) return { key, label, reason: beyondHorizon(late.site, late.timing.monthsToAction) };

  const market = findMarketRent(input.benchmarks, largest.segment, city);
  if (market === null || market.netRentPsf === null) {
    return { key, label, reason: `No market rent benchmark for ${largest.segment}, so a new lease cannot be priced.` };
  }

  const totalPeak = group.reduce((acc, s) => acc + peakOccupants(s.headcount, s.peakAttendancePct), 0);
  const headcount = group.reduce((acc, s) => acc + s.headcount, 0);
  const area = requiredArea(totalPeak, rates.targetDensity);
  if (area.isZero()) return { key, label, reason: `The ${city} sites have no peak occupants to relocate.` };
  const existingArea = group.reduce((acc, s) => acc.plus(s.rentableArea), ZERO);
  // Operating costs and taxes for the new building: the area-weighted average of the sites it replaces.
  const additional = group.reduce((acc, s) => acc.plus(dec(s.additionalRentPsf).times(s.rentableArea)), ZERO).dividedBy(existingArea);
  // People move when the first lease ends; any later leases double-run until they end.
  const move = Math.min(...timings.map((t) => t.timing.monthsToAction));

  return {
    key,
    label,
    input: {
      ...common,
      type: "relocate_and_consolidate",
      effectiveDate: monthStart(valuationDate, move),
      exits: timings.map((t) => ({ siteId: t.site.id, exitMechanism: t.timing.actionVia })),
      newLease: {
        name: `New ${city} premises (hypothetical)`,
        city,
        segment: largest.segment,
        rentableArea: area.toString(),
        netRentPsf: dec(market.netRentPsf).toString(),
        additionalRentPsf: additional.toString(),
        netEscalationPct: dec(largest.netEscalationPct).toString(),
        additionalEscalationPct: dec(largest.additionalEscalationPct).toString(),
        commencementDate: monthStart(valuationDate, move),
        expiryDate: monthEnd(valuationDate, move + rates.newLeaseTermYears * 12 - 1),
        freeRentMonths: rates.newLeaseFreeRentMonths,
      },
      oneTimeCosts: {
        fitOut: dec(rates.fitOutPsf).times(area).toString(),
        tiAllowance: dec(rates.newLeaseTiPsf).times(area).toString(),
        moving: dec(rates.movingPerPerson).times(headcount).toString(),
        it: dec(rates.itPerPerson).times(headcount).toString(),
      },
    },
  };
}

export function rankOptions(input: OptionsInput): OptionsResult {
  const { candidates, ruledOut } = generateCandidates(input);
  const ranked: RankedOption[] = [];
  for (const c of candidates) {
    const result = evaluateScenario(c.input, { sites: input.sites, benchmarks: input.benchmarks });
    if (result.feasible) {
      ranked.push({ key: c.key, label: c.label, result });
    } else {
      const reason = result.constraints.find((k) => k.severity === "infeasible")?.message ?? "Infeasible.";
      ruledOut.push({ key: c.key, label: c.label, reason });
    }
  }
  ranked.sort((a, b) => {
    const x = a.result.financials?.npvOfDelta ?? null;
    const y = b.result.financials?.npvOfDelta ?? null;
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return y.comparedTo(x);
  });

  const horizonMonths = (input.horizonYears ?? DEFAULT_HORIZON_YEARS) * 12;
  const baseline = computeBaseline({ valuationDate: input.valuationDate, horizonMonths, benchmarks: input.benchmarks }, input.sites);
  return { baseline: { annualCost: baseline.annualCost, total: baseline.total }, ranked, ruledOut };
}

function beyondHorizon(site: SiteInput, month: number): string {
  return `${site.name}'s lease runs to month ${month} with no usable break option; an earlier exit needs a surrender premium the landlord sets.`;
}

function groupByCity(sites: ReadonlyArray<SiteInput>): SiteInput[][] {
  const groups = new Map<string, SiteInput[]>();
  for (const s of sites) {
    const key = s.city.trim().toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.values()];
}

function sameCity(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
