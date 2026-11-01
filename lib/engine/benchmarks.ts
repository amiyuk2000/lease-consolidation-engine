import type { Benchmark } from "./types";

export const NATIONAL_MARKET = "Canada";

/**
 * Market rent for renewals, for the site's segment. Prefers the site's own
 * market; otherwise the national figure for the same segment, which callers
 * label as national. Never another segment, never interpolated. Null means
 * unknown.
 */
export function findMarketRent(
  benchmarks: ReadonlyArray<Benchmark>,
  segment: string,
  market: string,
): Benchmark | null {
  const withRent = benchmarks.filter((b) => b.netRentPsf !== null && sameKey(b.segment, segment));
  return (
    withRent.find((b) => sameKey(b.market, market)) ??
    withRent.find((b) => sameKey(b.market, NATIONAL_MARKET)) ??
    null
  );
}

/**
 * Sublet market depth. Prefers the site's own segment and market, otherwise a
 * national row, which the caller must label as national.
 */
export function findSubletMarket(
  benchmarks: ReadonlyArray<Benchmark>,
  segment: string,
  market: string,
): Benchmark | null {
  const withSublet = benchmarks.filter((b) => b.subletSharePct !== null);
  return (
    withSublet.find((b) => sameKey(b.segment, segment) && sameKey(b.market, market)) ??
    withSublet.find((b) => sameKey(b.market, NATIONAL_MARKET)) ??
    null
  );
}

export function isNational(benchmark: Benchmark): boolean {
  return sameKey(benchmark.market, NATIONAL_MARKET);
}

function sameKey(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
