import { z } from "zod";
import { SEGMENTS } from "@/lib/db/benchmark-data";
import { decimalString, intField, isoDate, optionalInt, optionalIsoDate, percentString } from "./common";

const leaseShape = {
  city: z.string().trim().min(1, "Enter a city").max(100),
  segment: z.enum(SEGMENTS, { error: "Choose a segment" }),
  rentableArea: decimalString.refine((v) => Number(v) > 0, "Must be more than 0"),
  usableArea: decimalString.refine((v) => Number(v) > 0, "Must be more than 0"),
  headcount: intField(0, 100000),
  peakAttendancePct: percentString,
  netRentPsf: decimalString,
  additionalRentPsf: decimalString,
  netEscalationPct: percentString,
  additionalEscalationPct: percentString,
  leaseStart: isoDate,
  leaseExpiry: isoDate,
  breakDate: optionalIsoDate,
  breakNoticeMonths: optionalInt(0, 60),
  makeGoodPsf: decimalString,
};

type LeaseFields = {
  rentableArea: string;
  usableArea: string;
  leaseStart: string;
  leaseExpiry: string;
  breakDate?: string | undefined;
  breakNoticeMonths?: number | undefined;
};

/** Cross-field checks shared by the create and edit schemas. */
function withLeaseChecks<T extends z.ZodType<LeaseFields>>(schema: T) {
  return schema
    .refine((s) => s.leaseExpiry > s.leaseStart, { path: ["leaseExpiry"], message: "Expiry must be after the lease start" })
    .refine((s) => Number(s.usableArea) <= Number(s.rentableArea), {
      path: ["usableArea"],
      message: "Usable area cannot exceed rentable area",
    })
    .refine((s) => s.breakDate === undefined || (s.breakDate > s.leaseStart && s.breakDate < s.leaseExpiry), {
      path: ["breakDate"],
      message: "The break date must fall within the lease term",
    })
    .refine((s) => s.breakDate === undefined || s.breakNoticeMonths !== undefined, {
      path: ["breakNoticeMonths"],
      message: "Enter the notice period for the break option",
    });
}

export const siteFieldNames = ["name", ...Object.keys(leaseShape)] as const;
export const siteUpdateFieldNames = Object.keys(leaseShape);

export const siteSchema = withLeaseChecks(
  z.object({ name: z.string().trim().min(1, "Enter a name").max(100), ...leaseShape }),
);

/** Editing a site: everything except its name. */
export const siteUpdateSchema = withLeaseChecks(z.object(leaseShape));

export type SiteFormValues = z.infer<typeof siteSchema>;
export type SiteUpdateValues = z.infer<typeof siteUpdateSchema>;
