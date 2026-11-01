import { computeBaseline } from "./baseline";
import { findMarketRent, findSubletMarket, isNational } from "./benchmarks";
import { monthAfterEnd, monthIndex } from "./dates";
import { Decimal, ZERO, dec, sumNullable, type DecimalValue } from "./decimal";
import { npv, payback, type Payback } from "./finance";
import { buildLedger, toYears, trancheTotal, type Tranche } from "./ledger";
import { holdSite, marketTranche, missingMarketRent, passingTranche, type EngineContext } from "./lease";
import { DEFAULT_PROFESSIONAL_FEES_PCT, computeOneTimeCosts } from "./one-time";
import { areaPerPeakOccupant, leaseTiming, peakOccupants, requiredArea, surplusArea } from "./site";
import {
  CURRENCY,
  type Assumption,
  type Benchmark,
  type Constraint,
  type OneTimeCostBreakdown,
  type OneTimeCostInput,
  type SiteInput,
} from "./types";

export const DEFAULT_HORIZON_YEARS = 10;
export const DEFAULT_DISCOUNT_RATE_PCT = 8;
export const DEFAULT_SUBLET_VOID_MONTHS = 9;
export const DENSITY_FLAG_THRESHOLD = 120;

/** How space is released. "none" means the lease gives no mid-term exit. */
export type ExitMechanism = "expiry" | "break_option" | "surrender" | "assignment" | "none";

export interface CommonScenarioInput {
  valuationDate: string;
  effectiveDate: string;
  /** Rentable sq ft per peak occupant. */
  targetDensity: DecimalValue;
  horizonYears?: number;
  discountRatePct?: DecimalValue;
  oneTimeCosts?: OneTimeCostInput;
}

export interface NewLeaseInput {
  name: string;
  city: string;
  segment: string;
  rentableArea: DecimalValue;
  netRentPsf: DecimalValue;
  additionalRentPsf: DecimalValue;
  netEscalationPct: DecimalValue;
  additionalEscalationPct: DecimalValue;
  commencementDate: string;
  expiryDate: string;
  freeRentMonths?: number;
}

export type ScenarioInput = CommonScenarioInput &
  (
    | { type: "densify_in_place"; siteId: string }
    | { type: "partial_surrender_at_expiry"; siteId: string; retainedArea?: DecimalValue }
    | { type: "partial_surrender_mid_term"; siteId: string; releasedArea?: DecimalValue }
    | {
        type: "sublet_surplus";
        siteId: string;
        subletArea?: DecimalValue;
        /** Sublet rent as a discount to passing gross rent. */
        subletDiscountPct: DecimalValue;
        voidMonths?: number;
      }
    | {
        type: "close_and_absorb";
        siteId: string;
        exitMechanism: ExitMechanism;
        allocations: ReadonlyArray<{ receivingSiteId: string; headcount: number }>;
      }
    | {
        type: "blend_and_extend";
        siteId: string;
        newNetRentPsf: DecimalValue;
        newExpiryDate: string;
        freeRentMonths?: number;
      }
    | {
        type: "relocate_and_consolidate";
        exits: ReadonlyArray<{ siteId: string; exitMechanism: ExitMechanism }>;
        newLease: NewLeaseInput;
      }
  );

export type ScenarioType = ScenarioInput["type"];

export interface SiteDensity {
  siteId: string | null;
  name: string;
  peakOccupants: number;
  rentableArea: Decimal;
  areaPerPeakOccupant: Decimal | null;
}

export interface YearRow {
  year: number;
  baselineCost: Decimal | null;
  /** Rent on the scenario estate, excluding double-running and before sublet income. */
  scenarioOccupancyCost: Decimal | null;
  subletIncome: Decimal | null;
  /** One-time costs falling in the year, including double-running rent. */
  oneTimeCost: Decimal | null;
  /** Baseline minus scenario total. Positive is a saving. */
  delta: Decimal | null;
  cumulativeDelta: Decimal | null;
}

export interface Financials {
  years: YearRow[];
  oneTimeCosts: OneTimeCostBreakdown;
  npvOfDelta: Decimal | null;
  payback: Payback;
}

export interface ScenarioResult {
  type: ScenarioType;
  currency: typeof CURRENCY;
  feasible: boolean;
  constraints: Constraint[];
  assumptions: Assumption[];
  /** Always present, even when the scenario is infeasible. */
  baseline: { annualCost: Array<Decimal | null>; total: Decimal | null };
  /** Null when infeasible: no number is produced for an action the lease does not permit. */
  financials: Financials | null;
  space: { areaReleased: Decimal; areaAdded: Decimal; sites: SiteDensity[] } | null;
  /** Sublet only: the same scenario if no subtenant is found. */
  noTakerCase: { npvOfDelta: Decimal | null; payback: Payback; cumulativeDelta: Decimal | null } | null;
  /** Blend and extend only: the whole committed term, which may run past the horizon. */
  fullTermCost: { months: number; cost: Decimal | null } | null;
}

interface Plan {
  /** Sites whose rent the plan replaces; all other sites are held as in the baseline. */
  affectedSiteIds: string[];
  tranches: Tranche[];
  makeGoodItems: Array<{ month: number; amount: Decimal }>;
  /** Month in which the remaining one-time costs fall. */
  outlayMonth: number;
  areaReleased: Decimal;
  areaAdded: Decimal;
  densities: SiteDensity[];
  noTakerTranches?: Tranche[];
  fullTermCost?: { months: number; cost: Decimal | null };
}

interface Draft {
  ctx: EngineContext;
  input: ScenarioInput;
  sites: ReadonlyMap<string, SiteInput>;
  effectiveMonth: number;
  targetDensity: Decimal;
  constraints: Constraint[];
  assumptions: Assumption[];
}

export function evaluateScenario(
  input: ScenarioInput,
  portfolio: { sites: ReadonlyArray<SiteInput>; benchmarks: ReadonlyArray<Benchmark> },
): ScenarioResult {
  const horizonYears = input.horizonYears ?? DEFAULT_HORIZON_YEARS;
  const discountRatePct = dec(input.discountRatePct ?? DEFAULT_DISCOUNT_RATE_PCT);
  const ctx: EngineContext = {
    valuationDate: input.valuationDate,
    horizonMonths: horizonYears * 12,
    benchmarks: portfolio.benchmarks,
  };
  const baseline = computeBaseline(ctx, portfolio.sites);
  const draft: Draft = {
    ctx,
    input,
    sites: new Map(portfolio.sites.map((s) => [s.id, s])),
    effectiveMonth: monthIndex(input.valuationDate, input.effectiveDate),
    targetDensity: dec(input.targetDensity),
    constraints: dedupe(baseline.constraints),
    assumptions: commonAssumptions(input, horizonYears, discountRatePct, portfolio),
  };

  let plan: Plan | null = null;
  if (draft.effectiveMonth < 0) {
    infeasible(draft, "effective_date_before_valuation", "The effective date is before the valuation date.");
  } else if (draft.effectiveMonth >= ctx.horizonMonths) {
    infeasible(draft, "effective_date_after_horizon", "The effective date is beyond the horizon.");
  } else {
    plan = buildPlan(draft);
  }
  if (plan) {
    checkDensity(draft, plan.densities);
    checkOneTimeCostsSupplied(draft);
  }

  const feasible = plan !== null && !draft.constraints.some((c) => c.severity === "infeasible");
  const result: ScenarioResult = {
    type: input.type,
    currency: CURRENCY,
    feasible,
    constraints: dedupe(draft.constraints),
    assumptions: draft.assumptions,
    baseline: { annualCost: baseline.annualCost, total: baseline.total },
    financials: null,
    space: null,
    noTakerCase: null,
    fullTermCost: null,
  };
  if (!feasible || plan === null) return result;

  const held = portfolio.sites
    .filter((s) => !plan.affectedSiteIds.includes(s.id))
    .flatMap((s) => holdSite(ctx, s).tranches);
  const main = cashFlows(draft, baseline.monthlyCost, [...held, ...plan.tranches], plan, discountRatePct);
  result.financials = main.financials;
  result.space = { areaReleased: plan.areaReleased, areaAdded: plan.areaAdded, sites: plan.densities };
  if (plan.noTakerTranches) {
    const noTaker = cashFlows(draft, baseline.monthlyCost, [...held, ...plan.noTakerTranches], plan, discountRatePct);
    const lastYear = noTaker.financials.years.at(-1);
    result.noTakerCase = {
      npvOfDelta: noTaker.financials.npvOfDelta,
      payback: noTaker.financials.payback,
      cumulativeDelta: lastYear?.cumulativeDelta ?? null,
    };
  }
  result.fullTermCost = plan.fullTermCost ?? null;
  return result;
}

function cashFlows(
  draft: Draft,
  baselineMonthly: ReadonlyArray<Decimal | null>,
  tranches: ReadonlyArray<Tranche>,
  plan: Plan,
  discountRatePct: Decimal,
): { financials: Financials } {
  const horizon = draft.ctx.horizonMonths;
  const ledger = buildLedger(tranches, horizon);
  const doubleRunning = sumNullable(ledger.map((m) => m.doubleRunning));
  const makeGood = plan.makeGoodItems.reduce((acc, item) => acc.plus(item.amount), ZERO);
  const oneTimeCosts = computeOneTimeCosts(draft.input.oneTimeCosts, { makeGood, doubleRunning });

  // Double-running is already month by month in the ledger; everything else is a lump.
  const lumps: Array<Decimal | null> = Array.from({ length: horizon }, () => ZERO);
  const addLump = (month: number, amount: Decimal | null) => {
    const m = Math.min(Math.max(month, 0), horizon - 1);
    const current = lumps[m] ?? null;
    lumps[m] = current === null || amount === null ? null : current.plus(amount);
  };
  for (const item of plan.makeGoodItems) addLump(item.month, item.amount);
  addLump(
    plan.outlayMonth,
    oneTimeCosts.total === null || doubleRunning === null ? null : oneTimeCosts.total.minus(makeGood).minus(doubleRunning),
  );

  const occupancy = ledger.map((m) => m.occupancy);
  const sublet = ledger.map((m) => m.subletIncome);
  const oneTime = ledger.map((m, i) => add(m.doubleRunning, lumps[i] ?? null));
  const delta = ledger.map((_, i) => {
    const scenarioCost = add(sub(occupancy[i] ?? null, sublet[i] ?? null), oneTime[i] ?? null);
    return sub(baselineMonthly[i] ?? null, scenarioCost);
  });

  const yearly = {
    baseline: toYears(baselineMonthly),
    occupancy: toYears(occupancy),
    sublet: toYears(sublet),
    oneTime: toYears(oneTime),
    delta: toYears(delta),
  };
  let cumulative: Decimal | null = ZERO;
  const years: YearRow[] = yearly.delta.map((d, i) => {
    cumulative = add(cumulative, d);
    return {
      year: i + 1,
      baselineCost: yearly.baseline[i] ?? null,
      scenarioOccupancyCost: yearly.occupancy[i] ?? null,
      subletIncome: yearly.sublet[i] ?? null,
      oneTimeCost: yearly.oneTime[i] ?? null,
      delta: d,
      cumulativeDelta: cumulative,
    };
  });

  return {
    financials: { years, oneTimeCosts, npvOfDelta: npv(delta, discountRatePct), payback: payback(delta) },
  };
}

function buildPlan(draft: Draft): Plan | null {
  const input = draft.input;
  switch (input.type) {
    case "densify_in_place":
      return densifyInPlace(draft, input.siteId);
    case "partial_surrender_at_expiry":
      return partialSurrenderAtExpiry(draft, input.siteId, input.retainedArea);
    case "partial_surrender_mid_term":
      return partialSurrenderMidTerm(draft, input.siteId, input.releasedArea);
    case "sublet_surplus":
      return subletSurplus(draft, input.siteId, input.subletArea, input.subletDiscountPct, input.voidMonths);
    case "close_and_absorb":
      return closeAndAbsorb(draft, input.siteId, input.exitMechanism, input.allocations);
    case "blend_and_extend":
      return blendAndExtend(draft, input.siteId, input.newNetRentPsf, input.newExpiryDate, input.freeRentMonths);
    case "relocate_and_consolidate":
      return relocateAndConsolidate(draft, input.exits, input.newLease);
  }
}

function densifyInPlace(draft: Draft, siteId: string): Plan | null {
  const site = requireSite(draft, siteId);
  if (!site) return null;
  const peak = peakOccupants(site.headcount, site.peakAttendancePct);
  const rentable = dec(site.rentableArea);
  const required = requiredArea(peak, draft.targetDensity);
  const current = areaPerPeakOccupant(rentable, peak);

  if (required.gt(rentable)) {
    infeasible(
      draft,
      "capacity_exceeded",
      `${site.name} cannot hold its ${peak} peak occupants at ${draft.targetDensity.toString()} sq ft each (needs ${display(required)} sq ft, has ${display(rentable)}).`,
      site.id,
    );
    return null;
  }
  if (current !== null && draft.targetDensity.gte(current)) {
    note(draft, "target_not_denser", `${site.name} is already at ${display(current)} sq ft per peak occupant; the target does not densify it.`, site.id);
  }
  const capacity = rentable.dividedBy(draft.targetDensity).floor();
  note(
    draft,
    "densify_no_rent_saving",
    `Densifying in place does not change rent. At the target density ${site.name} can hold ${capacity.toString()} peak occupants against ${peak} today.`,
    site.id,
  );
  return {
    affectedSiteIds: [site.id],
    tranches: holdSite(draft.ctx, site).tranches,
    makeGoodItems: [],
    outlayMonth: draft.effectiveMonth,
    areaReleased: ZERO,
    areaAdded: ZERO,
    densities: [density(site, peak, rentable)],
  };
}

function partialSurrenderAtExpiry(draft: Draft, siteId: string, retainedInput: DecimalValue | undefined): Plan | null {
  const site = requireSite(draft, siteId);
  if (!site) return null;
  const timing = leaseTiming(site, draft.ctx.valuationDate);
  const action = timing.monthsToAction;
  if (action > draft.ctx.horizonMonths) {
    infeasible(
      draft,
      "not_actionable_within_horizon",
      `${site.name} cannot be reduced until month ${action}, beyond the horizon, and it has no usable break option.`,
      site.id,
    );
    return null;
  }
  if (timing.expired) {
    note(draft, "lease_expired", `${site.name}'s lease expired before the valuation date; treated as holding over and renewable now.`, site.id);
  }
  note(
    draft,
    "action_date_from_lease",
    `${site.name} is reduced at its ${timing.actionVia === "break_option" ? "break option" : "lease expiry"} (month ${action}); the effective date does not move this.`,
    site.id,
  );

  const peak = peakOccupants(site.headcount, site.peakAttendancePct);
  const rentable = dec(site.rentableArea);
  const required = requiredArea(peak, draft.targetDensity);
  const retained = retainedInput === undefined ? required : dec(retainedInput);
  assume(draft, "retained_area", `Area retained at ${site.name}`, `${display(retained)} sq ft`, retainedInput === undefined ? "default" : "user");
  if (retained.gte(rentable)) {
    infeasible(draft, "no_surplus", `${site.name} has no surplus to give up: it needs ${display(retained)} sq ft and has ${display(rentable)}.`, site.id);
    return null;
  }
  warnIfBelowRequired(draft, site, retained, required);
  if (timing.actionVia === "break_option") warnIfMissing(draft, "terminationPenalty", site);

  const released = rentable.minus(retained);
  const tranches: Tranche[] = [];
  if (action > 0) tranches.push(passingTranche(site, rentable, 0, action));
  const renewal = marketTranche(draft.ctx, site, retained, action, draft.ctx.horizonMonths);
  tranches.push(...renewal.tranches);
  draft.constraints.push(...renewal.constraints);
  return {
    affectedSiteIds: [site.id],
    tranches,
    makeGoodItems: [{ month: action, amount: released.times(site.makeGoodPsf) }],
    outlayMonth: action,
    areaReleased: released,
    areaAdded: ZERO,
    densities: [density(site, peak, retained)],
  };
}

function partialSurrenderMidTerm(draft: Draft, siteId: string, releasedInput: DecimalValue | undefined): Plan | null {
  const site = requireSite(draft, siteId);
  if (!site) return null;
  const timing = leaseTiming(site, draft.ctx.valuationDate);
  const eff = draft.effectiveMonth;
  if (eff >= timing.expiryMonth) {
    notMidTerm(draft, site);
    return null;
  }
  const peak = peakOccupants(site.headcount, site.peakAttendancePct);
  const rentable = dec(site.rentableArea);
  const required = requiredArea(peak, draft.targetDensity);
  const released = releasedInput === undefined ? surplusArea(rentable, required) : dec(releasedInput);
  assume(draft, "released_area", `Area surrendered at ${site.name}`, `${display(released)} sq ft`, releasedInput === undefined ? "default" : "user");
  if (released.lte(0)) {
    infeasible(draft, "no_surplus", `${site.name} has no surplus at the target density (surplus ${display(surplusArea(rentable, required))} sq ft).`, site.id);
    return null;
  }
  if (released.gte(rentable)) {
    infeasible(draft, "release_entire_site", `Surrendering all of ${site.name} is a site exit; use close and absorb.`, site.id);
    return null;
  }
  const retained = rentable.minus(released);
  warnIfBelowRequired(draft, site, retained, required);
  requiresLandlord(draft, site, "surrender");
  warnIfMissing(draft, "surrenderPremium", site);

  const retainedHold = holdSite(draft.ctx, site, { area: retained, startMonth: eff });
  draft.constraints.push(...retainedHold.constraints);
  return {
    affectedSiteIds: [site.id],
    tranches: [...(eff > 0 ? [passingTranche(site, rentable, 0, eff)] : []), ...retainedHold.tranches],
    makeGoodItems: [{ month: eff, amount: released.times(site.makeGoodPsf) }],
    outlayMonth: eff,
    areaReleased: released,
    areaAdded: ZERO,
    densities: [density(site, peak, retained)],
  };
}

function subletSurplus(
  draft: Draft,
  siteId: string,
  areaInput: DecimalValue | undefined,
  discountPct: DecimalValue,
  voidInput: number | undefined,
): Plan | null {
  const site = requireSite(draft, siteId);
  if (!site) return null;
  const timing = leaseTiming(site, draft.ctx.valuationDate);
  const eff = draft.effectiveMonth;
  if (eff >= timing.expiryMonth) {
    notMidTerm(draft, site);
    return null;
  }
  const peak = peakOccupants(site.headcount, site.peakAttendancePct);
  const rentable = dec(site.rentableArea);
  const required = requiredArea(peak, draft.targetDensity);
  const area = areaInput === undefined ? surplusArea(rentable, required) : dec(areaInput);
  const voidMonths = voidInput ?? DEFAULT_SUBLET_VOID_MONTHS;
  assume(draft, "sublet_area", `Area sublet at ${site.name}`, `${display(area)} sq ft`, areaInput === undefined ? "default" : "user");
  assume(draft, "sublet_discount_pct", "Sublet rent discount to passing gross rent", `${dec(discountPct).toString()}%`, "user");
  assume(draft, "sublet_void_months", "Sublet void period", `${voidMonths} months`, voidInput === undefined ? "default" : "user");

  if (area.lte(0)) {
    infeasible(draft, "no_surplus", `${site.name} has no surplus to sublet at the target density.`, site.id);
    return null;
  }
  if (area.gt(rentable)) {
    infeasible(draft, "sublet_exceeds_premises", `The sublet area exceeds ${site.name}'s rentable area.`, site.id);
    return null;
  }
  warnIfBelowRequired(draft, site, rentable.minus(area), required);

  draft.constraints.push({
    code: "sublet_void_risk",
    severity: "warning",
    message: `Assumes ${voidMonths} months before a subtenant pays rent${voidInput === undefined ? " (default)" : ""}. The tenant pays full rent throughout.`,
    siteId: site.id,
  });
  note(draft, "sublet_liability", "The tenant remains liable under the head lease; a subtenant default reverts the cost to the tenant.", site.id);
  note(draft, "sublet_no_taker", "The no-taker case (no subtenant found before head lease expiry) is shown alongside.", site.id);
  const market = findSubletMarket(draft.ctx.benchmarks, site.segment, site.city);
  if (market && market.subletSharePct !== null) {
    const scope = isNational(market) ? "national figure" : market.market;
    draft.constraints.push({
      code: "sublet_market_thin",
      severity: "warning",
      message: `Thin sublet market: sublet space is ${dec(market.subletSharePct).toString()}% of vacant office space (${scope}, ${market.period}). Source: ${market.source}.`,
      siteId: site.id,
    });
  } else {
    draft.constraints.push({
      code: "no_sublet_benchmark",
      severity: "warning",
      message: "No sublet market benchmark is available; subtenant demand is unknown.",
      siteId: site.id,
    });
  }
  const incomeStart = eff + voidMonths;
  if (incomeStart >= timing.expiryMonth) {
    draft.constraints.push({
      code: "void_exceeds_term",
      severity: "warning",
      message: `The void period runs past ${site.name}'s lease expiry; no sublet income is received.`,
      siteId: site.id,
    });
  }

  const hold = holdSite(draft.ctx, site).tranches;
  const income: Tranche = {
    ...passingTranche(site, area, incomeStart, timing.expiryMonth, "sublet_income"),
    label: `${site.name} (sublet income)`,
    factor: dec(1).minus(dec(discountPct).dividedBy(100)),
  };
  return {
    affectedSiteIds: [site.id],
    tranches: incomeStart < timing.expiryMonth ? [...hold, income] : hold,
    noTakerTranches: hold,
    makeGoodItems: [],
    outlayMonth: eff,
    areaReleased: area,
    areaAdded: ZERO,
    densities: [density(site, peak, rentable.minus(area))],
  };
}

function closeAndAbsorb(
  draft: Draft,
  siteId: string,
  mechanism: ExitMechanism,
  allocations: ReadonlyArray<{ receivingSiteId: string; headcount: number }>,
): Plan | null {
  const site = requireSite(draft, siteId);
  if (!site) return null;
  const move = draft.effectiveMonth;
  const exit = resolveExit(draft, site, mechanism);

  const allocated = allocations.reduce((acc, a) => acc + a.headcount, 0);
  if (allocated !== site.headcount) {
    infeasible(draft, "unallocated_headcount", `${site.headcount} people work at ${site.name} but ${allocated} are allocated to receiving sites.`, site.id);
  }
  const byReceiver = new Map<string, number>();
  for (const a of allocations) byReceiver.set(a.receivingSiteId, (byReceiver.get(a.receivingSiteId) ?? 0) + a.headcount);

  const densities: SiteDensity[] = [];
  for (const [receiverId, headcount] of byReceiver) {
    if (receiverId === site.id) {
      infeasible(draft, "receiving_is_closing_site", `${site.name} cannot receive its own people.`, site.id);
      continue;
    }
    const receiver = requireSite(draft, receiverId);
    if (!receiver) continue;
    const existing = peakOccupants(receiver.headcount, receiver.peakAttendancePct);
    const moved = peakOccupants(headcount, site.peakAttendancePct);
    const after = existing + moved;
    const rentable = dec(receiver.rentableArea);
    const capacity = rentable.dividedBy(draft.targetDensity).floor();
    if (requiredArea(after, draft.targetDensity).gt(rentable)) {
      infeasible(
        draft,
        "receiving_capacity_exceeded",
        `${receiver.name} can hold ${capacity.toString()} peak occupants at the target density; this scenario puts ${after} there (${existing} existing + ${moved} moved).`,
        receiver.id,
      );
    }
    densities.push(density(receiver, after, rentable));
  }

  if (exit === null) return null;
  if (move > exit) {
    infeasible(draft, "move_after_exit", `People move out of ${site.name} after its lease has ended.`, site.id);
    return null;
  }
  if (draft.constraints.some((c) => c.severity === "infeasible")) return null;

  const rentable = dec(site.rentableArea);
  const tranches: Tranche[] = [];
  if (move > 0) tranches.push(passingTranche(site, rentable, 0, move));
  if (exit > move) tranches.push(passingTranche(site, rentable, move, exit, "double_running"));
  return {
    affectedSiteIds: [site.id],
    tranches,
    makeGoodItems: [{ month: exit, amount: rentable.times(site.makeGoodPsf) }],
    outlayMonth: move,
    areaReleased: rentable,
    areaAdded: ZERO,
    densities,
  };
}

function blendAndExtend(
  draft: Draft,
  siteId: string,
  newNetRentPsf: DecimalValue,
  newExpiryDate: string,
  freeRentInput: number | undefined,
): Plan | null {
  const site = requireSite(draft, siteId);
  if (!site) return null;
  const timing = leaseTiming(site, draft.ctx.valuationDate);
  const eff = draft.effectiveMonth;
  const freeRent = freeRentInput ?? 0;
  assume(draft, "new_net_rent_psf", `Blended net rent at ${site.name}`, `$${dec(newNetRentPsf).toString()} psf`, "user");
  assume(draft, "new_expiry_date", `Extended expiry at ${site.name}`, newExpiryDate, "user");
  assume(draft, "free_rent_months", "Free rent on the extension", `${freeRent} months`, freeRentInput === undefined ? "default" : "user");
  if (eff >= timing.expiryMonth) {
    notMidTerm(draft, site);
    return null;
  }
  const newEnd = monthAfterEnd(draft.ctx.valuationDate, newExpiryDate);
  if (newEnd <= timing.expiryMonth) {
    infeasible(draft, "no_extension", `The new expiry does not extend ${site.name}'s lease.`, site.id);
    return null;
  }
  requiresLandlord(draft, site, "blend and extend");

  const rentable = dec(site.rentableArea);
  const blended: Tranche = {
    ...passingTranche(site, rentable, eff, newEnd),
    label: `${site.name} (blend and extend)`,
    net: { basePsf: dec(newNetRentPsf), escalationPct: dec(site.netEscalationPct), anchorMonth: eff },
    freeRentMonths: freeRent,
  };
  const fullTermCost = { months: newEnd - eff, cost: trancheTotal(blended) };
  note(
    draft,
    "headline_vs_full_term",
    `Headline net rent moves from $${display(site.netRentPsf)} to $${display(newNetRentPsf)} psf, but the lease now runs to ${newExpiryDate}: full-term gross rent ${money(fullTermCost.cost)} over ${fullTermCost.months} months.`,
    site.id,
  );
  if (newEnd > draft.ctx.horizonMonths) {
    draft.constraints.push({
      code: "commitment_beyond_horizon",
      severity: "warning",
      message: `The extension commits ${site.name} for ${newEnd - draft.ctx.horizonMonths} months beyond the horizon; those costs are not in the horizon totals.`,
      siteId: site.id,
    });
  }

  const tranches: Tranche[] = [];
  if (eff > 0) tranches.push(passingTranche(site, rentable, 0, eff));
  tranches.push({ ...blended, endMonth: Math.min(newEnd, draft.ctx.horizonMonths) });
  if (newEnd < draft.ctx.horizonMonths) {
    const renewal = marketTranche(draft.ctx, site, rentable, newEnd, draft.ctx.horizonMonths);
    tranches.push(...renewal.tranches);
    draft.constraints.push(...renewal.constraints);
  }
  const peak = peakOccupants(site.headcount, site.peakAttendancePct);
  return {
    affectedSiteIds: [site.id],
    tranches,
    makeGoodItems: [],
    outlayMonth: eff,
    areaReleased: ZERO,
    areaAdded: ZERO,
    densities: [density(site, peak, rentable)],
    fullTermCost,
  };
}

function relocateAndConsolidate(
  draft: Draft,
  exits: ReadonlyArray<{ siteId: string; exitMechanism: ExitMechanism }>,
  lease: NewLeaseInput,
): Plan | null {
  const ctx = draft.ctx;
  const move = draft.effectiveMonth;
  if (exits.length < 2) {
    infeasible(draft, "needs_two_sites", "Relocate and consolidate needs two or more sites; use close and absorb for one.");
    return null;
  }
  const commencement = monthIndex(ctx.valuationDate, lease.commencementDate);
  const newEnd = monthAfterEnd(ctx.valuationDate, lease.expiryDate);
  const freeRent = lease.freeRentMonths ?? 0;
  assume(draft, "new_lease", `New lease: ${lease.name}`, `${display(lease.rentableArea)} sq ft, net $${display(lease.netRentPsf)} + additional $${display(lease.additionalRentPsf)} psf`, "user");
  assume(draft, "new_lease_escalation", `Escalation at ${lease.name}`, `net ${dec(lease.netEscalationPct).toString()}%/yr, additional ${dec(lease.additionalEscalationPct).toString()}%/yr`, "user");
  assume(draft, "free_rent_months", "Free rent on the new lease", `${freeRent} months`, lease.freeRentMonths === undefined ? "default" : "user");
  if (commencement < 0) infeasible(draft, "commencement_before_valuation", "The new lease commences before the valuation date.");
  if (commencement > move) infeasible(draft, "move_before_commencement", "People move into the new premises before its lease commences.");
  if (newEnd <= move) infeasible(draft, "new_lease_ends_before_move", "The new lease ends before people move in.");

  const tranches: Tranche[] = [];
  const makeGoodItems: Array<{ month: number; amount: Decimal }> = [];
  let totalPeak = 0;
  let released = ZERO;
  for (const e of exits) {
    const site = requireSite(draft, e.siteId);
    if (!site) continue;
    const exit = resolveExit(draft, site, e.exitMechanism);
    totalPeak += peakOccupants(site.headcount, site.peakAttendancePct);
    if (exit === null) continue;
    if (move > exit) {
      infeasible(draft, "move_after_exit", `People move out of ${site.name} after its lease has ended.`, site.id);
      continue;
    }
    const rentable = dec(site.rentableArea);
    released = released.plus(rentable);
    if (move > 0) tranches.push(passingTranche(site, rentable, 0, move));
    if (exit > move) tranches.push(passingTranche(site, rentable, move, exit, "double_running"));
    makeGoodItems.push({ month: exit, amount: rentable.times(site.makeGoodPsf) });
  }

  const newArea = dec(lease.rentableArea);
  if (requiredArea(totalPeak, draft.targetDensity).gt(newArea)) {
    infeasible(
      draft,
      "new_premises_capacity_exceeded",
      `${lease.name} can hold ${newArea.dividedBy(draft.targetDensity).floor().toString()} peak occupants at the target density; the exiting sites have ${totalPeak}.`,
    );
  }
  if (draft.constraints.some((c) => c.severity === "infeasible")) return null;

  const base: Tranche = {
    label: `${lease.name} (new lease)`,
    siteId: null,
    kind: "occupancy",
    area: newArea,
    startMonth: move,
    endMonth: newEnd,
    net: { basePsf: dec(lease.netRentPsf), escalationPct: dec(lease.netEscalationPct), anchorMonth: commencement },
    additional: { basePsf: dec(lease.additionalRentPsf), escalationPct: dec(lease.additionalEscalationPct), anchorMonth: commencement },
    freeRentMonths: Math.max(0, freeRent - (move - commencement)),
    factor: dec(1),
  };
  if (move > commencement) {
    tranches.push({ ...base, kind: "double_running", startMonth: commencement, endMonth: move, freeRentMonths: freeRent });
  }
  tranches.push(base);
  if (newEnd < ctx.horizonMonths) {
    const benchmark = findMarketRent(ctx.benchmarks, lease.segment, lease.city);
    if (benchmark === null) draft.constraints.push(missingMarketRent(lease.segment, lease.city));
    tranches.push({
      ...base,
      label: `${lease.name} (renewal at market)`,
      startMonth: newEnd,
      endMonth: ctx.horizonMonths,
      net: {
        basePsf: benchmark?.netRentPsf != null ? dec(benchmark.netRentPsf) : null,
        escalationPct: dec(lease.netEscalationPct),
        anchorMonth: newEnd,
      },
      freeRentMonths: 0,
    });
  }

  return {
    affectedSiteIds: exits.map((e) => e.siteId),
    tranches,
    makeGoodItems,
    outlayMonth: move,
    areaReleased: released,
    areaAdded: newArea,
    densities: [
      {
        siteId: null,
        name: lease.name,
        peakOccupants: totalPeak,
        rentableArea: newArea,
        areaPerPeakOccupant: areaPerPeakOccupant(newArea, totalPeak),
      },
    ],
  };
}

/** First month with no rent at the site under the named mechanism, or null if it is not available. */
function resolveExit(draft: Draft, site: SiteInput, mechanism: ExitMechanism): number | null {
  const timing = leaseTiming(site, draft.ctx.valuationDate);
  const eff = draft.effectiveMonth;
  switch (mechanism) {
    case "expiry":
      if (timing.expiryMonth > draft.ctx.horizonMonths) {
        infeasible(draft, "not_actionable_within_horizon", `${site.name}'s lease runs beyond the horizon; it cannot be exited at expiry within it.`, site.id);
        return null;
      }
      return timing.expiryMonth;
    case "break_option": {
      if (timing.breakMonth === null) {
        const reason =
          timing.breakStatus === "none"
            ? "has no break option"
            : timing.breakStatus === "notice_passed"
              ? "has a break option whose notice deadline has passed"
              : "has a break option that falls on or after expiry";
        infeasible(draft, "break_unavailable", `${site.name} ${reason}.`, site.id);
        return null;
      }
      warnIfMissing(draft, "terminationPenalty", site);
      return timing.breakMonth;
    }
    case "surrender":
    case "assignment":
      if (eff >= timing.expiryMonth) {
        notMidTerm(draft, site);
        return null;
      }
      requiresLandlord(draft, site, mechanism);
      if (mechanism === "surrender") warnIfMissing(draft, "surrenderPremium", site);
      return eff;
    case "none":
      if (eff < timing.expiryMonth) {
        infeasible(
          draft,
          "no_exit_mechanism",
          `${site.name} cannot be released before its lease ends without a named mechanism (surrender, sublet, assignment or break option).`,
          site.id,
        );
        return null;
      }
      return timing.expiryMonth;
  }
}

function checkDensity(draft: Draft, densities: ReadonlyArray<SiteDensity>) {
  const message = "puts more load on HVAC, washrooms, lifts and cleaning";
  if (draft.targetDensity.lt(DENSITY_FLAG_THRESHOLD)) {
    draft.constraints.push({
      code: "density_below_threshold",
      severity: "warning",
      message: `A target below ${DENSITY_FLAG_THRESHOLD} sq ft per peak occupant ${message}.`,
    });
  }
  for (const d of densities) {
    if (d.areaPerPeakOccupant !== null && d.areaPerPeakOccupant.lt(DENSITY_FLAG_THRESHOLD)) {
      draft.constraints.push({
        code: "density_below_threshold",
        severity: "warning",
        message: `${d.name} at ${display(d.areaPerPeakOccupant)} sq ft per peak occupant ${message}.`,
        ...(d.siteId ? { siteId: d.siteId } : {}),
      });
    }
  }
}

/** The engine never invents one-time costs, so it says when none were given rather than present an action as free. */
function checkOneTimeCostsSupplied(draft: Draft) {
  const c = draft.input.oneTimeCosts ?? {};
  const entered = [c.fitOut, c.moving, c.it, c.furniture, c.signage, c.surrenderPremium, c.terminationPenalty].some(
    (v) => v !== undefined && !dec(v).isZero(),
  );
  if (entered) return;
  const extra = draft.input.type === "sublet_surplus" ? " For a sublet, leasing commission and demising are rarely zero." : "";
  draft.constraints.push({
    code: "no_one_time_costs",
    severity: "warning",
    message: `No one-time costs were entered beyond those the engine calculates (make-good, double-running rent, fees).${extra} The cost of acting is likely understated.`,
  });
}

function commonAssumptions(
  input: ScenarioInput,
  horizonYears: number,
  discountRatePct: Decimal,
  portfolio: { sites: ReadonlyArray<SiteInput>; benchmarks: ReadonlyArray<Benchmark> },
): Assumption[] {
  const fees = input.oneTimeCosts?.professionalFeesPct;
  const disruption = input.oneTimeCosts?.businessDisruption;
  const list: Assumption[] = [
    { key: "currency", label: "Currency", value: CURRENCY, source: "default" },
    { key: "valuation_date", label: "Valuation date", value: input.valuationDate, source: "user" },
    { key: "effective_date", label: "Effective date", value: input.effectiveDate, source: "user" },
    { key: "horizon_years", label: "Horizon", value: `${horizonYears} years`, source: input.horizonYears === undefined ? "default" : "user" },
    { key: "discount_rate_pct", label: "Discount rate (nominal)", value: `${discountRatePct.toString()}%`, source: input.discountRatePct === undefined ? "default" : "user" },
    { key: "target_density", label: "Target density", value: `${dec(input.targetDensity).toString()} sq ft per peak occupant`, source: "user" },
    { key: "professional_fees_pct", label: "Professional fees", value: `${dec(fees ?? DEFAULT_PROFESSIONAL_FEES_PCT).toString()}% of one-time costs`, source: fees === undefined ? "default" : "user" },
    {
      key: "business_disruption",
      label: "Business disruption",
      value: disruption === undefined || disruption === null ? "Not supplied; excluded" : `$${dec(disruption).toFixed(2)}`,
      source: "user",
    },
    { key: "escalation_timing", label: "Escalation timing", value: "Steps every 12 months from the valuation date", source: "default" },
    { key: "free_rent_basis", label: "Free rent", value: "Abates net rent only; additional rent still payable", source: "default" },
  ];
  for (const site of portfolio.sites) {
    list.push({
      key: `escalation:${site.id}`,
      label: `Escalation at ${site.name}`,
      value: `net ${dec(site.netEscalationPct).toString()}%/yr, additional ${dec(site.additionalEscalationPct).toString()}%/yr`,
      source: "user",
    });
    const market = findMarketRent(portfolio.benchmarks, site.segment, site.city);
    list.push({
      key: `market_rent:${site.id}`,
      label: `Renewal net rent at ${site.name}`,
      value:
        market && market.netRentPsf !== null
          ? `$${dec(market.netRentPsf).toString()} psf (${isNational(market) ? "national average" : market.market}, ${market.segment}, ${market.period}; ${market.source})`
          : `No benchmark for ${site.segment} in ${site.city}; unknown`,
      source: "benchmark",
    });
  }
  return list;
}

function requireSite(draft: Draft, id: string): SiteInput | null {
  const site = draft.sites.get(id);
  if (!site) infeasible(draft, "unknown_site", `Site ${id} is not in this portfolio.`, id);
  return site ?? null;
}

function density(site: SiteInput, peak: number, area: Decimal): SiteDensity {
  return { siteId: site.id, name: site.name, peakOccupants: peak, rentableArea: area, areaPerPeakOccupant: areaPerPeakOccupant(area, peak) };
}

function warnIfBelowRequired(draft: Draft, site: SiteInput, retained: Decimal, required: Decimal) {
  if (retained.lt(required)) {
    draft.constraints.push({
      code: "retained_below_required",
      severity: "warning",
      message: `${site.name} keeps ${display(retained)} sq ft but its peak occupants need ${display(required)} sq ft at the target density.`,
      siteId: site.id,
    });
  }
}

function warnIfMissing(draft: Draft, key: "surrenderPremium" | "terminationPenalty", site: SiteInput) {
  if (draft.input.oneTimeCosts?.[key] !== undefined) return;
  const what = key === "surrenderPremium" ? "surrender premium" : "early termination penalty";
  draft.constraints.push({
    code: key === "surrenderPremium" ? "no_surrender_premium" : "no_termination_penalty",
    severity: "warning",
    message: `No ${what} supplied for ${site.name}; modelled as $0. Landlords usually require one.`,
    siteId: site.id,
  });
}

function requiresLandlord(draft: Draft, site: SiteInput, mechanism: string) {
  draft.constraints.push({
    code: "requires_landlord_agreement",
    severity: "warning",
    message: `${mechanism[0]?.toUpperCase()}${mechanism.slice(1)} at ${site.name} assumes the landlord agrees; the lease does not give this right.`,
    siteId: site.id,
  });
}

function notMidTerm(draft: Draft, site: SiteInput) {
  infeasible(draft, "not_mid_term", `${site.name}'s lease ends on or before the effective date; there is no remaining term to act on.`, site.id);
}

function infeasible(draft: Draft, code: string, message: string, siteId?: string) {
  draft.constraints.push({ code, severity: "infeasible", message, ...(siteId ? { siteId } : {}) });
}

function note(draft: Draft, code: string, message: string, siteId?: string) {
  draft.constraints.push({ code, severity: "info", message, ...(siteId ? { siteId } : {}) });
}

function assume(draft: Draft, key: string, label: string, value: string, source: Assumption["source"]) {
  draft.assumptions.push({ key, label, value, source });
}

function dedupe(constraints: ReadonlyArray<Constraint>): Constraint[] {
  const seen = new Set<string>();
  return constraints.filter((c) => {
    const key = `${c.code}|${c.siteId ?? ""}|${c.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function add(a: Decimal | null, b: Decimal | null): Decimal | null {
  return a === null || b === null ? null : a.plus(b);
}

function sub(a: Decimal | null, b: Decimal | null): Decimal | null {
  return a === null || b === null ? null : a.minus(b);
}

/** Display-only formatting inside messages. */
function display(value: DecimalValue): string {
  const d = dec(value);
  return d.isInteger() ? d.toString() : d.toFixed(2);
}

function money(value: Decimal | null): string {
  return value === null ? "unknown" : `$${value.toFixed(2)} ${CURRENCY}`;
}
