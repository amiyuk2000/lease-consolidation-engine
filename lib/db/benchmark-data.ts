/**
 * Published market figures, each quoted from the cited source. Add rows only
 * from a source that states the figure; never estimate or interpolate.
 *
 * Omitted on purpose: the Central (14.9%) and Suburban (14.4%) vacancy rates,
 * because the source sentence does not state which class they cover.
 */
const CW_Q3_2026 = {
  market: "Canada",
  period: "2026-Q3",
  source: "Cushman & Wakefield, Canada Office MarketBeat Q3 2026",
  sourceUrl: "https://www.cushmanwakefield.com/en/canada/insights/canada-marketbeats/office-marketbeats",
};

export const BENCHMARK_ROWS = [
  // "Overall office vacancy declined to 15.6%"; "average direct net rent climbing to $23.32 psf";
  // "sublet vacancy ... accounting for a record-low 10.4% of total vacant space".
  { ...CW_Q3_2026, segment: "All office", vacancyPct: "15.6", netRentPsf: "23.32", subletSharePct: "10.4" },
  // "The Central Class A market ... posting an average net rent of $32.13 psf".
  { ...CW_Q3_2026, segment: "Central Class A", vacancyPct: null, netRentPsf: "32.13", subletSharePct: null },
  // "Class AAA segment, where average direct net rents rose to $39.86 psf"; "Vacancy in this premium segment fell to 10.0%".
  { ...CW_Q3_2026, segment: "Class AAA", vacancyPct: "10.0", netRentPsf: "39.86", subletSharePct: null },
  // "combined Central Class B/C vacancy declined to 20.5%". No rent published.
  { ...CW_Q3_2026, segment: "Central Class B/C", vacancyPct: "20.5", netRentPsf: null, subletSharePct: null },
  // "Suburban Class B/C vacancy increased to 13.0%". No rent published.
  { ...CW_Q3_2026, segment: "Suburban Class B/C", vacancyPct: "13.0", netRentPsf: null, subletSharePct: null },
] as const;

/** Segments a site can belong to, in the vocabulary of the benchmarks. */
export const SEGMENTS = ["Class AAA", "Central Class A", "Suburban Class A", "Central Class B/C", "Suburban Class B/C"] as const;
