import DecimalJs from "decimal.js";

/**
 * All money and area arithmetic uses this Decimal. High precision so that no
 * intermediate rounding occurs; round only at display.
 */
export const Decimal = DecimalJs.clone({
  precision: 40,
  rounding: DecimalJs.ROUND_HALF_UP,
});
export type Decimal = InstanceType<typeof Decimal>;
export type DecimalValue = Decimal | string | number;

export const ZERO = new Decimal(0);

export function dec(value: DecimalValue): Decimal {
  return new Decimal(value);
}

/** Sum that propagates unknowns: any null input makes the result null. */
export function sumNullable(values: ReadonlyArray<Decimal | null>): Decimal | null {
  let total = ZERO;
  for (const v of values) {
    if (v === null) return null;
    total = total.plus(v);
  }
  return total;
}
