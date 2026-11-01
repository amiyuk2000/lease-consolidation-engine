import { Decimal, ZERO, dec, type DecimalValue } from "./decimal";

/**
 * Net present value of monthly flows at an annual nominal rate. Each month's
 * flow is discounted from the end of that month: factor (1 + r)^((m + 1) / 12).
 */
export function npv(monthlyFlows: ReadonlyArray<Decimal | null>, annualRatePct: DecimalValue): Decimal | null {
  const base = dec(1).plus(dec(annualRatePct).dividedBy(100));
  let total = ZERO;
  for (let m = 0; m < monthlyFlows.length; m++) {
    const flow = monthlyFlows[m];
    if (flow === null || flow === undefined) return null;
    total = total.plus(flow.dividedBy(base.pow(dec(m + 1).dividedBy(12))));
  }
  return total;
}

export type Payback =
  | { status: "immediate" }
  | { status: "months"; months: number }
  | { status: "never" }
  | { status: "unknown" };

/**
 * Undiscounted payback on the monthly net delta (savings minus one-time
 * costs). Measured in months from the first month the cumulative position
 * goes negative to the month after which it stays non-negative.
 */
export function payback(monthlyNetDelta: ReadonlyArray<Decimal | null>): Payback {
  let cumulative = ZERO;
  let firstNegative: number | null = null;
  let lastNegative: number | null = null;
  for (let m = 0; m < monthlyNetDelta.length; m++) {
    const flow = monthlyNetDelta[m];
    if (flow === null || flow === undefined) return { status: "unknown" };
    cumulative = cumulative.plus(flow);
    if (cumulative.isNegative() && !cumulative.isZero()) {
      firstNegative ??= m;
      lastNegative = m;
    }
  }
  if (firstNegative === null || lastNegative === null) return { status: "immediate" };
  if (lastNegative === monthlyNetDelta.length - 1) return { status: "never" };
  return { status: "months", months: lastNegative + 1 - firstNegative };
}
