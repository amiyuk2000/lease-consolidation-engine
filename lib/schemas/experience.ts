import { z } from "zod";
import { NO_STANDARDS, PURPOSES, type ExperienceStandards, type Purpose } from "@/lib/engine";
import { decimalString, optionalInt, optionalPercent } from "./common";

const blankToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);
const optionalPositive = z.preprocess(blankToUndefined, decimalString.refine((v) => Number(v) > 0, "Must be more than 0").optional());

/** A portfolio's workplace brief. Every target is optional; a blank target is not scored. */
export const experienceStandardsSchema = z.object({
  minSeatsPerPeakOccupant: optionalPositive,
  maxPeoplePerFocusRoom: optionalPositive,
  maxPeoplePerConfidentialRoom: optionalPositive,
  minSpaceTypes: optionalInt(1, 4),
  purposes: z.array(z.enum(PURPOSES)).transform((ps) => [...new Set(ps)]),
  maxBusyQuietGapPts: optionalPercent,
});

export type ExperienceStandardsValues = z.infer<typeof experienceStandardsSchema>;

export const STANDARD_FIELDS = [
  "minSeatsPerPeakOccupant",
  "maxPeoplePerFocusRoom",
  "maxPeoplePerConfidentialRoom",
  "minSpaceTypes",
  "maxBusyQuietGapPts",
] as const;

export const PURPOSE_LABELS: Record<Purpose, string> = {
  focus: "Focused work",
  confidential: "Confidential meetings",
  collaboration: "Collaboration",
  socialising: "Socialising",
};

/** Stored standards, or null if none are saved or what is saved no longer validates. */
export function parseStoredStandards(stored: unknown): ExperienceStandardsValues | null {
  if (stored === null || stored === undefined) return null;
  const parsed = experienceStandardsSchema.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

export function toEngineStandards(values: ExperienceStandardsValues | null): ExperienceStandards {
  if (!values) return NO_STANDARDS;
  return {
    minSeatsPerPeakOccupant: values.minSeatsPerPeakOccupant ?? null,
    maxPeoplePerFocusRoom: values.maxPeoplePerFocusRoom ?? null,
    maxPeoplePerConfidentialRoom: values.maxPeoplePerConfidentialRoom ?? null,
    minSpaceTypes: values.minSpaceTypes ?? null,
    purposes: values.purposes,
    maxBusyQuietGapPts: values.maxBusyQuietGapPts ?? null,
  };
}
