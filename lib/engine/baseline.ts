import type { Decimal } from "./decimal";
import { sumNullable } from "./decimal";
import { buildLedger, toYears, type Tranche } from "./ledger";
import { holdSite, type EngineContext } from "./lease";
import type { Constraint, SiteInput } from "./types";

export interface BaselineResult {
  tranches: Tranche[];
  monthlyCost: Array<Decimal | null>;
  annualCost: Array<Decimal | null>;
  total: Decimal | null;
  constraints: Constraint[];
}

/** Do nothing: hold every site, renew each at market at expiry, apply escalations. */
export function computeBaseline(ctx: EngineContext, sites: ReadonlyArray<SiteInput>): BaselineResult {
  const tranches: Tranche[] = [];
  const constraints: Constraint[] = [];
  for (const site of sites) {
    const built = holdSite(ctx, site);
    tranches.push(...built.tranches);
    constraints.push(...built.constraints);
  }
  const monthlyCost = buildLedger(tranches, ctx.horizonMonths).map((m) => m.occupancy);
  const annualCost = toYears(monthlyCost);
  return { tranches, monthlyCost, annualCost, total: sumNullable(annualCost), constraints };
}
