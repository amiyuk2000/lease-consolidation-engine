import { z } from "zod";

const blankToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

/** A non-negative decimal kept as a string so it reaches the engine without float conversion. */
export const decimalString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, "Enter a number, e.g. 25 or 25.50");

export const optionalDecimal = z.preprocess(blankToUndefined, decimalString.optional());

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date");

export const optionalIsoDate = z.preprocess(blankToUndefined, isoDate.optional());

export const intField = (min: number, max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v),
    z.number({ error: "Enter a whole number" }).int("Enter a whole number").min(min).max(max),
  );

export const optionalInt = (min: number, max: number) =>
  z.preprocess(
    (v) => {
      const blank = blankToUndefined(v);
      return typeof blank === "string" ? Number(blank) : blank;
    },
    z.number({ error: "Enter a whole number" }).int("Enter a whole number").min(min).max(max).optional(),
  );

export const percentString = decimalString.refine((v) => Number(v) <= 100, "Must be 100 or less");

export const optionalPercent = z.preprocess(blankToUndefined, percentString.optional());

/** Issue list as { "path.to.field": message } for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_form";
    errors[key] ??= issue.message;
  }
  return errors;
}
