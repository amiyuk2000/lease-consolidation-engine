import { Decimal, dec, type DecimalValue } from "./decimal";
import { monthAfterEnd, monthIndex } from "./dates";
import type { SiteInput } from "./types";

export function peakOccupants(headcount: number, peakAttendancePct: DecimalValue): number {
  return dec(headcount)
    .times(peakAttendancePct)
    .dividedBy(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
}

export function requiredArea(peak: number, targetDensity: DecimalValue): Decimal {
  return dec(peak).times(targetDensity);
}

/** Negative when the site is already too small at the target density. */
export function surplusArea(rentableArea: DecimalValue, required: Decimal): Decimal {
  return dec(rentableArea).minus(required);
}

export function grossRentPsf(netRentPsf: DecimalValue, additionalRentPsf: DecimalValue): Decimal {
  return dec(netRentPsf).plus(additionalRentPsf);
}

/** Rentable sq ft per peak occupant, or null when nobody attends. */
export function areaPerPeakOccupant(rentableArea: DecimalValue, peak: number): Decimal | null {
  if (peak <= 0) return null;
  return dec(rentableArea).dividedBy(peak);
}

export type BreakStatus = "none" | "usable" | "notice_passed" | "after_expiry";

export interface LeaseTiming {
  /** First month with no rent payable under the current lease (0 if already expired). */
  expiryMonth: number;
  expired: boolean;
  breakStatus: BreakStatus;
  /** First month with no rent if the break option is exercised; null unless usable. */
  breakMonth: number | null;
  /** Months to expiry, or to a usable break option, whichever is sooner. */
  monthsToAction: number;
  actionVia: "expiry" | "break_option";
}

export function leaseTiming(site: SiteInput, valuationDate: string): LeaseTiming {
  const rawExpiry = monthAfterEnd(valuationDate, site.leaseExpiry);
  const expired = rawExpiry <= 0;
  const expiryMonth = Math.max(0, rawExpiry);

  let breakStatus: BreakStatus = "none";
  let breakMonth: number | null = null;
  if (site.breakDate !== null) {
    const breakIdx = monthIndex(valuationDate, site.breakDate);
    const notice = site.breakNoticeMonths ?? 0;
    if (breakIdx + 1 >= expiryMonth) {
      breakStatus = "after_expiry";
    } else if (breakIdx < notice) {
      // Notice must be served `notice` months before the break date; that day has passed.
      breakStatus = "notice_passed";
    } else {
      breakStatus = "usable";
      breakMonth = breakIdx + 1;
    }
  }

  return {
    expiryMonth,
    expired,
    breakStatus,
    breakMonth,
    monthsToAction: breakMonth ?? expiryMonth,
    actionVia: breakMonth !== null ? "break_option" : "expiry",
  };
}

export function isActionable(
  monthsToAction: number,
  horizonMonths: number,
  usesMidTermMechanism: boolean,
): boolean {
  return usesMidTermMechanism || monthsToAction <= horizonMonths;
}
