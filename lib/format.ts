import { dec, type Decimal, type DecimalValue } from "@/lib/engine";

// Display only. Rounding happens here and nowhere in the engine.

const cad = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const cadCents = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2 });
const whole = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 0 });
const oneDp = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 1 });

export const UNKNOWN = "Unknown";

export function money(value: Decimal | null | undefined): string {
  return value == null ? UNKNOWN : cad.format(Number(value.toFixed(0)));
}

export function psf(value: DecimalValue | null | undefined): string {
  return value == null ? UNKNOWN : cadCents.format(Number(dec(value).toFixed(2)));
}

export function sqft(value: DecimalValue | null | undefined): string {
  return value == null ? UNKNOWN : `${whole.format(Number(dec(value).toFixed(0)))} sq ft`;
}

export function number(value: DecimalValue | null | undefined, digits = 0): string {
  if (value == null) return UNKNOWN;
  return (digits === 0 ? whole : oneDp).format(Number(dec(value).toFixed(digits)));
}

/** For charts: a plain number rounded to dollars, or null. */
export function chartValue(value: Decimal | null | undefined): number | null {
  return value == null ? null : Number(value.toFixed(0));
}

export function months(n: number): string {
  if (n < 24) return `${n} month${n === 1 ? "" : "s"}`;
  return `${n} months (${oneDp.format(n / 12)} yrs)`;
}
