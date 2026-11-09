import { Decimal, dec, type DecimalValue } from "./decimal";
import type { ScenarioResult, SiteDensity } from "./scenarios";
import { areaPerPeakOccupant, peakOccupants } from "./site";
import type { SiteInput, SpaceMix } from "./types";

/**
 * The employee experience of the workplace a scenario leaves behind: what it
 * is like to come in once the change is made, measured against the
 * organization's own standards. Missing
 * inventory is reported as unknown, never filled in.
 */

export const PURPOSES = ["focus", "confidential", "collaboration", "socialising"] as const;
export type Purpose = (typeof PURPOSES)[number];

/** Targets from the organization's workplace brief. A null target is not scored. */
export interface ExperienceStandards {
  minSeatsPerPeakOccupant: DecimalValue | null;
  maxPeoplePerFocusRoom: DecimalValue | null;
  maxPeoplePerConfidentialRoom: DecimalValue | null;
  /** Of the four space types: focus, confidential, collaboration, social. */
  minSpaceTypes: number | null;
  /** Purposes the office must serve; each needs at least one space of its type. */
  purposes: ReadonlyArray<Purpose>;
  /** Largest acceptable gap between busiest-day and quietest-day fullness, in percentage points. */
  maxBusyQuietGapPts: DecimalValue | null;
}

export const NO_STANDARDS: ExperienceStandards = {
  minSeatsPerPeakOccupant: null,
  maxPeoplePerFocusRoom: null,
  maxPeoplePerConfidentialRoom: null,
  minSpaceTypes: null,
  purposes: [],
  maxBusyQuietGapPts: null,
};

export const INDICATOR_KEYS = ["busiest_day_seats", "focus", "confidential", "variety", "purpose", "busy_quiet_gap"] as const;
export type IndicatorKey = (typeof INDICATOR_KEYS)[number];

/** "not_set": no standard to score against. "not_applicable": nobody attends, or nothing to measure against. */
export type IndicatorStatus = "met" | "not_met" | "unknown" | "not_set" | "not_applicable";

export interface Indicator {
  key: IndicatorKey;
  status: IndicatorStatus;
  /** Plain-language result for display. */
  detail: string;
  have?: number;
  need?: number;
  /** Busy-to-quiet gap in percentage points, unrounded. */
  gapPts?: Decimal;
}

/**
 * Where the space mix after the change comes from.
 * "pro_rata": space is given back, so each count is assumed to shrink with the area kept.
 * "before_refit": a densification fit-out will change today's mix in ways not yet known.
 */
export type MixBasis = "recorded" | "pro_rata" | "before_refit" | "unknown";

export interface WorkplaceExperience {
  siteId: string | null;
  name: string;
  peakOccupants: number;
  quietOccupants: number | null;
  mix: SpaceMix;
  mixBasis: MixBasis;
  /** Share of today's rentable area kept, when the mix is pro rata. */
  retainedShare: Decimal | null;
  /** The engine's own comfort measure; not one of the scored indicators. */
  areaPerPeakOccupant: Decimal | null;
  indicators: Indicator[];
  score: { met: number; scored: number; unknown: number };
}

const UNKNOWN_MIX: SpaceMix = {
  workstations: null,
  focusRooms: null,
  confidentialRooms: null,
  collaborationSpaces: null,
  socialSpaces: null,
};

const PURPOSE_SPACE: Record<Purpose, { field: keyof SpaceMix; label: string }> = {
  focus: { field: "focusRooms", label: "focused work" },
  confidential: { field: "confidentialRooms", label: "confidential meetings" },
  collaboration: { field: "collaborationSpaces", label: "collaboration" },
  socialising: { field: "socialSpaces", label: "socialising" },
};

const SPACE_TYPES: Array<{ field: keyof SpaceMix; label: string }> = [
  { field: "focusRooms", label: "focus" },
  { field: "confidentialRooms", label: "confidential" },
  { field: "collaborationSpaces", label: "collaboration" },
  { field: "socialSpaces", label: "social" },
];

export function recordedMix(site: SiteInput): SpaceMix {
  return site.spaceMix ?? UNKNOWN_MIX;
}

/** People in on the quietest day, rounded per origin site as peak occupants are. Null if any origin has no figure. */
export function quietOccupants(origins: SiteDensity["origins"], sites: ReadonlyMap<string, SiteInput>): number | null {
  let total = 0;
  for (const o of origins) {
    const pct = sites.get(o.siteId)?.quietestAttendancePct;
    if (pct === null || pct === undefined) return null;
    total += peakOccupants(o.headcount, pct);
  }
  return total;
}

export function experienceToday(site: SiteInput, standards: ExperienceStandards): WorkplaceExperience {
  const peak = peakOccupants(site.headcount, site.peakAttendancePct);
  const quiet =
    site.quietestAttendancePct === null || site.quietestAttendancePct === undefined
      ? null
      : peakOccupants(site.headcount, site.quietestAttendancePct);
  const mix = recordedMix(site);
  return assess(
    {
      siteId: site.id,
      name: site.name,
      peakOccupants: peak,
      quietOccupants: quiet,
      mix,
      mixBasis: site.spaceMix ? "recorded" : "unknown",
      retainedShare: null,
      areaPerPeakOccupant: areaPerPeakOccupant(site.rentableArea, peak),
    },
    standards,
  );
}

/** Each workplace the scenario changes, as it would be after the change. Empty when the scenario is infeasible. */
export function experienceAfter(
  result: ScenarioResult,
  sites: ReadonlyArray<SiteInput>,
  standards: ExperienceStandards,
): WorkplaceExperience[] {
  if (!result.feasible || !result.space) return [];
  const byId = new Map(sites.map((s) => [s.id, s]));
  return result.space.sites.map((d) => {
    const site = d.siteId === null ? undefined : byId.get(d.siteId);
    let mix = UNKNOWN_MIX;
    let mixBasis: MixBasis = "unknown";
    let retainedShare: Decimal | null = null;
    if (site?.spaceMix) {
      const share = d.rentableArea.dividedBy(site.rentableArea);
      if (share.gte(1)) {
        mix = site.spaceMix;
        mixBasis = result.type === "densify_in_place" ? "before_refit" : "recorded";
      } else {
        mix = proRata(site.spaceMix, share);
        mixBasis = "pro_rata";
        retainedShare = share;
      }
    }
    return assess(
      {
        siteId: d.siteId,
        name: d.name,
        peakOccupants: d.peakOccupants,
        quietOccupants: quietOccupants(d.origins, byId),
        mix,
        mixBasis,
        retainedShare,
        areaPerPeakOccupant: d.areaPerPeakOccupant,
      },
      standards,
    );
  });
}

/** To the nearest whole space: a part of a room is not a room, and rounding down would drop single spaces from a small give-back. */
function proRata(mix: SpaceMix, share: Decimal): SpaceMix {
  const scale = (n: number | null) => (n === null ? null : dec(n).times(share).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber());
  return {
    workstations: scale(mix.workstations),
    focusRooms: scale(mix.focusRooms),
    confidentialRooms: scale(mix.confidentialRooms),
    collaborationSpaces: scale(mix.collaborationSpaces),
    socialSpaces: scale(mix.socialSpaces),
  };
}

type Workplace = Omit<WorkplaceExperience, "indicators" | "score">;

export function assess(w: Workplace, standards: ExperienceStandards): WorkplaceExperience {
  const indicators: Indicator[] = [
    seats(w, standards.minSeatsPerPeakOccupant),
    perRoom(w, "focus", w.mix.focusRooms, standards.maxPeoplePerFocusRoom, "focus room"),
    perRoom(w, "confidential", w.mix.confidentialRooms, standards.maxPeoplePerConfidentialRoom, "confidential room"),
    variety(w.mix, standards.minSpaceTypes),
    purpose(w.mix, standards.purposes),
    gap(w, standards.maxBusyQuietGapPts),
  ];
  const scoredStatuses: IndicatorStatus[] = ["met", "not_met", "unknown"];
  return {
    ...w,
    indicators,
    score: {
      met: indicators.filter((i) => i.status === "met").length,
      scored: indicators.filter((i) => scoredStatuses.includes(i.status)).length,
      unknown: indicators.filter((i) => i.status === "unknown").length,
    },
  };
}

function seats(w: Workplace, min: DecimalValue | null): Indicator {
  const key = "busiest_day_seats";
  const have = w.mix.workstations;
  if (w.peakOccupants === 0) return { key, status: "not_applicable", detail: "Nobody attends." };
  if (have === null) return { key, status: min === null ? "not_set" : "unknown", detail: "Workstations not recorded." };
  const base = `${have} workstations for ${w.peakOccupants} people on the busiest day`;
  if (min === null) return { key, status: "not_set", detail: `${base}.`, have };
  const need = dec(w.peakOccupants).times(min).ceil().toNumber();
  return countResult(key, have, need, base);
}

function perRoom(w: Workplace, key: IndicatorKey, have: number | null, maxPeople: DecimalValue | null, noun: string): Indicator {
  if (w.peakOccupants === 0) return { key, status: "not_applicable", detail: "Nobody attends." };
  if (have === null) return { key, status: maxPeople === null ? "not_set" : "unknown", detail: `${capitalize(noun)}s not recorded.` };
  const base = `${have} ${noun}${have === 1 ? "" : "s"} for ${w.peakOccupants} people`;
  if (maxPeople === null) return { key, status: "not_set", detail: `${base}.`, have };
  const need = dec(w.peakOccupants).dividedBy(maxPeople).ceil().toNumber();
  return countResult(key, have, need, base);
}

function countResult(key: IndicatorKey, have: number, need: number, base: string): Indicator {
  if (have >= need) return { key, status: "met", detail: `${base}; the standard needs ${need}.`, have, need };
  return { key, status: "not_met", detail: `${base}; the standard needs ${need}, short ${need - have}.`, have, need };
}

function variety(mix: SpaceMix, min: number | null): Indicator {
  const key = "variety";
  const present = SPACE_TYPES.filter((t) => (mix[t.field] ?? 0) > 0).map((t) => t.label);
  const absent = SPACE_TYPES.filter((t) => mix[t.field] === 0).map((t) => t.label);
  const unrecorded = SPACE_TYPES.filter((t) => mix[t.field] === null).map((t) => t.label);
  const parts = [`${present.length} of ${SPACE_TYPES.length} space types`];
  if (present.length > 0) parts.push(`has ${present.join(", ")}`);
  if (absent.length > 0) parts.push(`no ${absent.join(" or ")} space`);
  if (unrecorded.length > 0) parts.push(`${unrecorded.join(", ")} not recorded`);
  const detail = `${parts.join("; ")}.`;
  if (min === null) return { key, status: "not_set", detail, have: present.length };
  const status: IndicatorStatus = present.length >= min ? "met" : unrecorded.length > 0 ? "unknown" : "not_met";
  return { key, status, detail, have: present.length, need: min };
}

function purpose(mix: SpaceMix, purposes: ReadonlyArray<Purpose>): Indicator {
  const key = "purpose";
  if (purposes.length === 0) return { key, status: "not_set", detail: "No purposes named in the workplace brief." };
  const missing = purposes.filter((p) => mix[PURPOSE_SPACE[p].field] === 0).map((p) => PURPOSE_SPACE[p].label);
  const unrecorded = purposes.filter((p) => mix[PURPOSE_SPACE[p].field] === null).map((p) => PURPOSE_SPACE[p].label);
  const supported = purposes.length - missing.length - unrecorded.length;
  const parts = [`Supports ${supported} of the ${purposes.length} purposes in the brief`];
  if (missing.length > 0) parts.push(`no space for ${missing.join(" or ")}`);
  if (unrecorded.length > 0) parts.push(`space for ${unrecorded.join(", ")} not recorded`);
  const status: IndicatorStatus = missing.length > 0 ? "not_met" : unrecorded.length > 0 ? "unknown" : "met";
  return { key, status, detail: `${parts.join("; ")}.`, have: supported, need: purposes.length };
}

function gap(w: Workplace, maxPts: DecimalValue | null): Indicator {
  const key = "busy_quiet_gap";
  const seatsHave = w.mix.workstations;
  if (w.peakOccupants === 0) return { key, status: "not_applicable", detail: "Nobody attends." };
  if (seatsHave === null || w.quietOccupants === null) {
    const what = seatsHave === null ? "Workstations" : "Quietest-day attendance";
    return { key, status: maxPts === null ? "not_set" : "unknown", detail: `${what} not recorded.` };
  }
  if (seatsHave === 0) return { key, status: "not_applicable", detail: "No workstations to measure fullness against." };
  const busy = dec(w.peakOccupants).dividedBy(seatsHave).times(100);
  const quiet = dec(w.quietOccupants).dividedBy(seatsHave).times(100);
  const gapPts = busy.minus(quiet);
  const pct = (d: Decimal) => d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toString();
  const base = `Busiest day ${pct(busy)}% full, quietest day ${pct(quiet)}%: a gap of ${pct(gapPts)} points`;
  if (maxPts === null) return { key, status: "not_set", detail: `${base}.`, gapPts };
  const met = gapPts.lte(maxPts);
  return {
    key,
    status: met ? "met" : "not_met",
    detail: `${base}; the standard is at most ${dec(maxPts).toString()}.`,
    gapPts,
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
