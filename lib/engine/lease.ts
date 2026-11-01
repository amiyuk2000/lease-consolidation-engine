import { findMarketRent } from "./benchmarks";
import { Decimal, dec } from "./decimal";
import type { Tranche, TrancheKind } from "./ledger";
import { leaseTiming } from "./site";
import type { Benchmark, Constraint, SiteInput } from "./types";

export interface EngineContext {
  valuationDate: string;
  horizonMonths: number;
  benchmarks: ReadonlyArray<Benchmark>;
}

export interface TrancheBuild {
  tranches: Tranche[];
  constraints: Constraint[];
}

/** Rent at the site's passing rates. Escalations step every 12 months from the valuation month. */
export function passingTranche(
  site: SiteInput,
  area: Decimal,
  startMonth: number,
  endMonth: number,
  kind: TrancheKind = "occupancy",
): Tranche {
  return {
    label: `${site.name} (passing rent)`,
    siteId: site.id,
    kind,
    area,
    startMonth,
    endMonth,
    net: { basePsf: dec(site.netRentPsf), escalationPct: dec(site.netEscalationPct), anchorMonth: 0 },
    additional: additionalPath(site),
    freeRentMonths: 0,
    factor: dec(1),
  };
}

/**
 * Renewal at the benchmark market net rent for the site's segment and city.
 * Additional rent continues on the site's own path; it is operating cost, not
 * a negotiated rent, so it does not reset on renewal.
 */
export function marketTranche(
  ctx: EngineContext,
  site: SiteInput,
  area: Decimal,
  startMonth: number,
  endMonth: number,
): TrancheBuild {
  const benchmark = findMarketRent(ctx.benchmarks, site.segment, site.city);
  const constraints: Constraint[] = [];
  if (benchmark === null && startMonth < Math.min(endMonth, ctx.horizonMonths)) {
    constraints.push(missingMarketRent(site.segment, site.city, site.id));
  }
  return {
    tranches: [
      {
        label: `${site.name} (renewal at market)`,
        siteId: site.id,
        kind: "occupancy",
        area,
        startMonth,
        endMonth,
        net: {
          basePsf: benchmark?.netRentPsf != null ? dec(benchmark.netRentPsf) : null,
          escalationPct: dec(site.netEscalationPct),
          anchorMonth: startMonth,
        },
        additional: additionalPath(site),
        freeRentMonths: 0,
        factor: dec(1),
      },
    ],
    constraints,
  };
}

/**
 * Hold a site: passing rent to expiry, then renew at market to `endMonth`.
 * This is what the baseline does for every site.
 */
export function holdSite(
  ctx: EngineContext,
  site: SiteInput,
  options: { area?: Decimal; startMonth?: number; endMonth?: number } = {},
): TrancheBuild {
  const area = options.area ?? dec(site.rentableArea);
  const start = options.startMonth ?? 0;
  const end = options.endMonth ?? ctx.horizonMonths;
  const { expiryMonth } = leaseTiming(site, ctx.valuationDate);

  const tranches: Tranche[] = [];
  const constraints: Constraint[] = [];
  const passingEnd = Math.min(expiryMonth, end);
  if (passingEnd > start) tranches.push(passingTranche(site, area, start, passingEnd));
  const renewalStart = Math.max(expiryMonth, start);
  if (end > renewalStart) {
    const renewal = marketTranche(ctx, site, area, renewalStart, end);
    tranches.push(...renewal.tranches);
    constraints.push(...renewal.constraints);
  }
  return { tranches, constraints };
}

export function missingMarketRent(segment: string, market: string, siteId?: string): Constraint {
  return {
    code: "missing_market_rent",
    severity: "warning",
    message: `No market rent benchmark for ${segment} in ${market}. Costs after renewal cannot be calculated and are shown as unknown.`,
    ...(siteId ? { siteId } : {}),
  };
}

function additionalPath(site: SiteInput) {
  return {
    basePsf: dec(site.additionalRentPsf),
    escalationPct: dec(site.additionalEscalationPct),
    anchorMonth: 0,
  };
}
