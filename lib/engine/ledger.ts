import { Decimal, ZERO, dec } from "./decimal";

/**
 * A rent-paying (or rent-receiving) slice of space over a span of months.
 * Every cost in the engine is built from tranches so that baseline and
 * scenarios are costed by exactly the same arithmetic.
 */
export type TrancheKind = "occupancy" | "double_running" | "sublet_income";

export interface RatePath {
  /** $/sq ft/year at the anchor month. Null when unknown (e.g. missing benchmark). */
  basePsf: Decimal | null;
  escalationPct: Decimal;
  /** Escalation steps every 12 months from this month. */
  anchorMonth: number;
}

export interface Tranche {
  label: string;
  siteId: string | null;
  kind: TrancheKind;
  area: Decimal;
  /** Inclusive. */
  startMonth: number;
  /** Exclusive. */
  endMonth: number;
  net: RatePath;
  additional: RatePath;
  /** Months of net rent abated from startMonth. Additional rent is still payable. */
  freeRentMonths: number;
  /** Multiplier on the whole amount, e.g. sublet recovery after discount. */
  factor: Decimal;
}

export function psfAt(path: RatePath, month: number): Decimal | null {
  if (path.basePsf === null) return null;
  const steps = Math.max(0, Math.floor((month - path.anchorMonth) / 12));
  return path.basePsf.times(dec(1).plus(path.escalationPct.dividedBy(100)).pow(steps));
}

/** Amount for one month; zero outside the tranche, null if a rate is unknown. */
export function monthlyAmount(t: Tranche, month: number): Decimal | null {
  if (month < t.startMonth || month >= t.endMonth) return ZERO;
  const net = month < t.startMonth + t.freeRentMonths ? ZERO : psfAt(t.net, month);
  const additional = psfAt(t.additional, month);
  if (net === null || additional === null) return null;
  return t.area.times(net.plus(additional)).times(t.factor).dividedBy(12);
}

/** Sum of a tranche over its own span, regardless of horizon. */
export function trancheTotal(t: Tranche): Decimal | null {
  let total = ZERO;
  for (let m = t.startMonth; m < t.endMonth; m++) {
    const amount = monthlyAmount(t, m);
    if (amount === null) return null;
    total = total.plus(amount);
  }
  return total;
}

export interface LedgerMonth {
  occupancy: Decimal | null;
  doubleRunning: Decimal | null;
  subletIncome: Decimal | null;
}

export function buildLedger(tranches: ReadonlyArray<Tranche>, horizonMonths: number): LedgerMonth[] {
  const months: LedgerMonth[] = [];
  for (let m = 0; m < horizonMonths; m++) {
    const row: LedgerMonth = { occupancy: ZERO, doubleRunning: ZERO, subletIncome: ZERO };
    for (const t of tranches) {
      const amount = monthlyAmount(t, m);
      const key = t.kind === "occupancy" ? "occupancy" : t.kind === "double_running" ? "doubleRunning" : "subletIncome";
      const current = row[key];
      row[key] = amount === null || current === null ? null : current.plus(amount);
    }
    months.push(row);
  }
  return months;
}

/** Group monthly values into horizon years (year 1 = months 0–11). */
export function toYears(monthly: ReadonlyArray<Decimal | null>): Array<Decimal | null> {
  const years: Array<Decimal | null> = [];
  for (let i = 0; i < monthly.length; i += 12) {
    let total: Decimal | null = ZERO;
    for (const v of monthly.slice(i, i + 12)) {
      total = v === null || total === null ? null : total.plus(v);
    }
    years.push(total);
  }
  return years;
}
