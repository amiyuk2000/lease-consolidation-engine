/**
 * The engine works at month granularity. Month 0 is the month containing the
 * valuation date. Dates are ISO strings (YYYY-MM-DD); the engine never reads
 * the system clock.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface CalendarDate {
  year: number;
  month: number; // 1–12
  day: number;
}

export function parseIsoDate(value: string): CalendarDate {
  const match = ISO_DATE.exec(value);
  if (!match) throw new Error(`Invalid ISO date: ${value}`);
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  if (date.month < 1 || date.month > 12 || date.day < 1 || date.day > 31) {
    throw new Error(`Invalid ISO date: ${value}`);
  }
  return date;
}

/** Calendar months from the valuation month to the month containing `date`. */
export function monthIndex(valuationDate: string, date: string): number {
  const v = parseIsoDate(valuationDate);
  const t = parseIsoDate(date);
  return (t.year - v.year) * 12 + (t.month - v.month);
}

/** The first day of the month `offset` months after the valuation month. */
export function monthStart(valuationDate: string, offset: number): string {
  const v = parseIsoDate(valuationDate);
  const total = v.year * 12 + (v.month - 1) + offset;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** The last day of the month `offset` months after the valuation month. */
export function monthEnd(valuationDate: string, offset: number): string {
  const [year, month] = monthStart(valuationDate, offset).split("-").map(Number) as [number, number];
  return `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth(year, month)).padStart(2, "0")}`;
}

/** The same calendar date `years` later; 29 February becomes 28 February in a non-leap year. */
export function addYears(date: string, years: number): string {
  const d = parseIsoDate(date);
  const year = d.year + years;
  const day = Math.min(d.day, daysInMonth(year, d.month));
  return `${year}-${String(d.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The first month in which no rent is payable for a lease ending on `endDate`.
 * Rent is payable through the end of the month containing the end date.
 */
export function monthAfterEnd(valuationDate: string, endDate: string): number {
  return monthIndex(valuationDate, endDate) + 1;
}
