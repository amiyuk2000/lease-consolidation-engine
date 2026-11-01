"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createPortfolioAction, createSiteAction, updateSiteAction } from "@/app/actions/portfolio";
import type { FormState } from "@/app/actions/auth";
import { SEGMENTS } from "@/lib/db/benchmark-data";
import { SubmitButton } from "./submit-button";
import { Field, FormError, buttonClass, inputClass } from "./ui";

export function NewPortfolioForm() {
  const [state, action] = useActionState<FormState, FormData>(createPortfolioAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="min-w-64 flex-1">
        <Field label="New portfolio" name="name" error={state.errors?.name}>
          <input id="name" name="name" placeholder="e.g. Ontario offices" required className={inputClass} />
        </Field>
      </div>
      <SubmitButton pendingText="Creating…">Create portfolio</SubmitButton>
    </form>
  );
}

type FieldSpec = { name: string; label: string; type?: string; hint?: string; step?: string };

const NAME_FIELD: FieldSpec = { name: "name", label: "Site name" };

const LEASE_FIELDS: FieldSpec[] = [
  { name: "city", label: "City" },
  { name: "rentableArea", label: "Rentable area (sq ft)", type: "number", hint: "The area rent is paid on, including a share of common areas." },
  { name: "usableArea", label: "Usable area (sq ft)", type: "number", hint: "Typically rentable ÷ 1.10–1.20." },
  { name: "headcount", label: "Headcount", type: "number", hint: "People assigned to the site." },
  { name: "peakAttendancePct", label: "Peak attendance (%)", type: "number", step: "0.1", hint: "Busiest day of a normal week. Not the average." },
  { name: "netRentPsf", label: "Net rent ($/sq ft/yr)", type: "number", step: "0.01" },
  { name: "additionalRentPsf", label: "Additional rent ($/sq ft/yr)", type: "number", step: "0.01", hint: "Operating costs plus realty taxes." },
  { name: "netEscalationPct", label: "Net rent escalation (%/yr)", type: "number", step: "0.1" },
  { name: "additionalEscalationPct", label: "Additional rent escalation (%/yr)", type: "number", step: "0.1" },
  { name: "leaseStart", label: "Lease start", type: "date" },
  { name: "leaseExpiry", label: "Lease expiry", type: "date" },
  { name: "breakDate", label: "Break option date (optional)", type: "date" },
  { name: "breakNoticeMonths", label: "Break notice (months)", type: "number", hint: "Required if there is a break date." },
  { name: "makeGoodPsf", label: "Make-good ($/sq ft)", type: "number", step: "0.01", hint: "Restoration cost at exit." },
];

/** The site fields. `idPrefix` keeps ids unique when an add form and an edit form are on the page together. */
function SiteFields({ state, values, includeName, idPrefix }: { state: FormState; values: Record<string, string>; includeName: boolean; idPrefix: string }) {
  const value = (name: string) => state.values?.[name] ?? values[name] ?? "";
  const input = (f: FieldSpec) => (
    <Field key={f.name} label={f.label} name={`${idPrefix}${f.name}`} error={state.errors?.[f.name]} {...(f.hint ? { hint: f.hint } : {})}>
      <input
        id={`${idPrefix}${f.name}`}
        name={f.name}
        type={f.type ?? "text"}
        step={f.step}
        min={f.type === "number" ? 0 : undefined}
        defaultValue={value(f.name)}
        className={inputClass}
      />
    </Field>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {includeName ? input(NAME_FIELD) : null}
      {input(LEASE_FIELDS[0]!)}
      <Field label="Segment" name={`${idPrefix}segment`} error={state.errors?.segment} hint="Matches the market benchmark used for renewals.">
        <select id={`${idPrefix}segment`} name="segment" defaultValue={value("segment") || "Central Class A"} className={inputClass}>
          {SEGMENTS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
      {LEASE_FIELDS.slice(1).map(input)}
    </div>
  );
}

export function NewSiteForm({ portfolioId }: { portfolioId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(async (prev, formData) => {
    const next = await createSiteAction(portfolioId, prev, formData);
    if (!next.errors) setOpen(false);
    return next;
  }, {});

  if (!open) {
    return (
      <button type="button" className={buttonClass.secondary} onClick={() => setOpen(true)}>
        Add a site
      </button>
    );
  }
  return (
    <form action={action} className="w-full space-y-4 rounded-3xl border border-stone-200 bg-canvas p-6">
      <FormError message={state.errors?._form} />
      <SiteFields state={state} values={{}} includeName idPrefix="new-" />
      <div className="flex gap-3">
        <SubmitButton pendingText="Saving…">Save site</SubmitButton>
        <button type="button" className={buttonClass.secondary} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function EditSiteForm({
  portfolioId,
  siteId,
  siteName,
  values,
}: {
  portfolioId: string;
  siteId: string;
  siteName: string;
  values: Record<string, string>;
}) {
  const [state, action] = useActionState<FormState, FormData>(updateSiteAction.bind(null, portfolioId, siteId), {});
  return (
    <form action={action} className="space-y-4 rounded-3xl border border-stone-200 bg-canvas p-6">
      <div>
        <p className="font-display text-2xl text-ink">Edit {siteName}</p>
        <p className="mt-1 text-sm text-stone-500">The site name stays fixed. Everything else feeds straight into the calculations.</p>
      </div>
      <FormError message={state.errors?._form} />
      <SiteFields state={state} values={values} includeName={false} idPrefix={`edit-${siteId}-`} />
      <div className="flex gap-3">
        <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
        <Link href={`/portfolios/${portfolioId}`} scroll={false} className={buttonClass.secondary}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
