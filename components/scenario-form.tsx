"use client";

import { useState, useTransition, type ChangeEvent, type ReactNode } from "react";
import { createScenarioAction } from "@/app/actions/portfolio";
import { SEGMENTS } from "@/lib/db/benchmark-data";
import { fieldErrors } from "@/lib/schemas/common";
import {
  EXIT_LABELS,
  EXIT_MECHANISMS,
  SCENARIO_DESCRIPTIONS,
  SCENARIO_LABELS,
  SCENARIO_TYPES,
  scenarioSchema,
  type ScenarioTypeKey,
} from "@/lib/schemas/scenario";
import { Card, Field, FormError, SectionTitle, buttonClass, inputClass } from "./ui";

export interface SiteOption {
  id: string;
  name: string;
  headcount: number;
  city: string;
  segment: string;
  /** For choosing defaults only; never used in calculations. */
  rentableArea: number;
  hasBreakOption: boolean;
}

type Mechanism = (typeof EXIT_MECHANISMS)[number];

const COST_FIELDS: Array<{ key: string; label: string; hint?: string }> = [
  { key: "fitOut", label: "Fit-out ($)", hint: "Receiving or new space." },
  { key: "tiAllowance", label: "TI allowance ($)", hint: "Landlord contribution; offsets fit-out." },
  { key: "moving", label: "Moving ($)" },
  { key: "it", label: "IT ($)" },
  { key: "furniture", label: "Furniture ($)" },
  { key: "signage", label: "Signage ($)" },
  { key: "surrenderPremium", label: "Surrender premium ($)" },
  { key: "terminationPenalty", label: "Early termination penalty ($)" },
  { key: "businessDisruption", label: "Business disruption ($)", hint: "Only if you have an estimate. Never assumed." },
  { key: "professionalFeesPct", label: "Professional fees (%)", hint: "Blank uses the default, 6%." },
];

export function ScenarioForm({ portfolioId, sites, defaultEffectiveDate }: { portfolioId: string; sites: SiteOption[]; defaultEffectiveDate: string }) {
  // Default to closing the smallest site into the largest, the most likely feasible starting point.
  const bySize = [...sites].sort((a, b) => a.rentableArea - b.rentableArea);
  const first = bySize[0];
  const second = bySize.at(-1) === first ? undefined : bySize.at(-1);
  const [type, setType] = useState<ScenarioTypeKey>(sites.length > 1 ? "close_and_absorb" : "densify_in_place");
  const [fields, setFields] = useState<Record<string, string>>({
    name: "",
    effectiveDate: defaultEffectiveDate,
    targetDensity: "150",
    horizonYears: "",
    discountRatePct: "",
    siteId: first?.id ?? "",
    exitMechanism: first?.hasBreakOption ? "break_option" : "expiry",
    subletDiscountPct: "20",
    newNetRentPsf: "",
    newExpiryDate: "",
    freeRentMonths: "",
    voidMonths: "",
    retainedArea: "",
    releasedArea: "",
    subletArea: "",
  });
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [allocations, setAllocations] = useState<Array<{ receivingSiteId: string; headcount: string }>>(
    second && first ? [{ receivingSiteId: second.id, headcount: String(first.headcount) }] : [],
  );
  const [exits, setExits] = useState<Record<string, Mechanism>>({});
  const [newLease, setNewLease] = useState<Record<string, string>>({
    name: "New premises",
    city: first?.city ?? "",
    segment: "Central Class A",
    rentableArea: "",
    netRentPsf: "",
    additionalRentPsf: "",
    netEscalationPct: "2",
    additionalEscalationPct: "3",
    commencementDate: defaultEffectiveDate,
    expiryDate: "",
    freeRentMonths: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const set = (key: string) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFields((p) => ({ ...p, [key]: e.target.value }));
  const subject = sites.find((s) => s.id === fields.siteId);

  function payload() {
    const common = {
      type,
      name: fields.name || SCENARIO_LABELS[type],
      effectiveDate: fields.effectiveDate,
      targetDensity: fields.targetDensity,
      horizonYears: fields.horizonYears,
      discountRatePct: fields.discountRatePct,
      oneTimeCosts: costs,
    };
    switch (type) {
      case "densify_in_place":
        return { ...common, siteId: fields.siteId };
      case "partial_surrender_at_expiry":
        return { ...common, siteId: fields.siteId, retainedArea: fields.retainedArea };
      case "partial_surrender_mid_term":
        return { ...common, siteId: fields.siteId, releasedArea: fields.releasedArea };
      case "sublet_surplus":
        return { ...common, siteId: fields.siteId, subletArea: fields.subletArea, subletDiscountPct: fields.subletDiscountPct, voidMonths: fields.voidMonths };
      case "close_and_absorb":
        return { ...common, siteId: fields.siteId, exitMechanism: fields.exitMechanism, allocations };
      case "blend_and_extend":
        return { ...common, siteId: fields.siteId, newNetRentPsf: fields.newNetRentPsf, newExpiryDate: fields.newExpiryDate, freeRentMonths: fields.freeRentMonths };
      case "relocate_and_consolidate":
        return { ...common, exits: Object.entries(exits).map(([siteId, exitMechanism]) => ({ siteId, exitMechanism })), newLease };
    }
  }

  function submit() {
    const data = payload();
    const parsed = scenarioSchema.safeParse(data);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await createScenarioAction(portfolioId, data);
      if (result?.errors) setErrors(result.errors);
    });
  }

  const siteSelect = (label: string, hint?: string) => (
    <Field label={label} name="siteId" error={errors.siteId} {...(hint ? { hint } : {})}>
      <select id="siteId" value={fields.siteId} onChange={set("siteId")} className={inputClass}>
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </Field>
  );
  const text = (key: string, label: string, opts: { type?: string; hint?: string; placeholder?: string } = {}) => (
    <Field label={label} name={key} error={errors[key]} {...(opts.hint ? { hint: opts.hint } : {})}>
      <input id={key} type={opts.type ?? "number"} min={0} step="any" value={fields[key] ?? ""} placeholder={opts.placeholder} onChange={set(key)} className={inputClass} />
    </Field>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-6"
    >
      <Card>
        <SectionTitle>Strategy</SectionTitle>
        <div className="grid gap-3 md:grid-cols-2">
          {SCENARIO_TYPES.map((t) => (
            <label
              key={t}
              className={`cursor-pointer rounded-2xl border p-4 text-sm transition ${type === t ? "border-ink bg-canvas ring-1 ring-ink" : "border-stone-200 hover:border-stone-300"}`}
            >
              <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} className="sr-only" />
              <span className="font-medium text-ink">{SCENARIO_LABELS[t]}</span>
              <span className="mt-1 block text-stone-600">{SCENARIO_DESCRIPTIONS[t]}</span>
            </label>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>Planning assumptions</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Scenario name" name="name" error={errors.name}>
            <input id="name" value={fields.name} placeholder={SCENARIO_LABELS[type]} onChange={set("name")} className={inputClass} />
          </Field>
          {text("effectiveDate", "Effective date", { type: "date", hint: "When people move or the action takes effect." })}
          {text("targetDensity", "Target density (sq ft per peak occupant)", { hint: "Below 120 is flagged for building systems load." })}
          {text("horizonYears", "Horizon (years)", { placeholder: "10 (default)" })}
          {text("discountRatePct", "Discount rate (%, nominal)", { placeholder: "8 (default)" })}
        </div>
      </Card>

      <Card>
        <SectionTitle>{SCENARIO_LABELS[type]}</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {type === "densify_in_place" && siteSelect("Site")}
          {type === "partial_surrender_at_expiry" && (
            <>
              {siteSelect("Site", "Acts at expiry, or at a break option if its notice can still be met.")}
              {text("retainedArea", "Area to keep (sq ft)", { placeholder: "Peak occupants × target", hint: "Blank keeps exactly what the target density needs." })}
            </>
          )}
          {type === "partial_surrender_mid_term" && (
            <>
              {siteSelect("Site")}
              {text("releasedArea", "Area to surrender (sq ft)", { placeholder: "The surplus", hint: "Blank surrenders the surplus at the target density." })}
            </>
          )}
          {type === "sublet_surplus" && (
            <>
              {siteSelect("Site")}
              {text("subletArea", "Area to sublet (sq ft)", { placeholder: "The surplus" })}
              {text("subletDiscountPct", "Discount to passing gross rent (%)")}
              {text("voidMonths", "Void before a subtenant pays (months)", { placeholder: "9 (default)" })}
            </>
          )}
          {type === "blend_and_extend" && (
            <>
              {siteSelect("Site")}
              {text("newNetRentPsf", "Blended net rent ($/sq ft)")}
              {text("newExpiryDate", "New expiry date", { type: "date" })}
              {text("freeRentMonths", "Free rent (months)", { placeholder: "0" })}
            </>
          )}
          {type === "close_and_absorb" && (
            <>
              {siteSelect("Site to close", subject ? `${subject.headcount} people to relocate.` : undefined)}
              <Field label="How the lease ends" name="exitMechanism" error={errors.exitMechanism}>
                <select id="exitMechanism" value={fields.exitMechanism} onChange={set("exitMechanism")} className={inputClass}>
                  {EXIT_MECHANISMS.map((m) => (
                    <option key={m} value={m}>
                      {EXIT_LABELS[m]}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
        </div>

        {type === "close_and_absorb" && (
          <div className="mt-5">
            <p className="mb-2 text-sm font-medium text-stone-700">Receiving sites</p>
            {errors.allocations ? <FormError message={errors.allocations} /> : null}
            <div className="space-y-2">
              {allocations.map((a, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <select
                    aria-label="Receiving site"
                    value={a.receivingSiteId}
                    onChange={(e) => setAllocations((p) => p.map((x, j) => (j === i ? { ...x, receivingSiteId: e.target.value } : x)))}
                    className={`${inputClass} max-w-xs`}
                  >
                    {sites
                      .filter((s) => s.id !== fields.siteId)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                  <input
                    aria-label="People moving"
                    type="number"
                    min={0}
                    value={a.headcount}
                    onChange={(e) => setAllocations((p) => p.map((x, j) => (j === i ? { ...x, headcount: e.target.value } : x)))}
                    className={`${inputClass} max-w-32`}
                  />
                  <span className="pb-2 text-sm text-stone-500">people</span>
                  <button type="button" className={buttonClass.danger} onClick={() => setAllocations((p) => p.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                  {errors[`allocations.${i}.headcount`] ? <p className="w-full text-xs text-rose-700">{errors[`allocations.${i}.headcount`]}</p> : null}
                </div>
              ))}
            </div>
            <button
              type="button"
              className={`${buttonClass.link} mt-2`}
              onClick={() => {
                const candidate = sites.find((s) => s.id !== fields.siteId);
                if (candidate) setAllocations((p) => [...p, { receivingSiteId: candidate.id, headcount: "0" }]);
              }}
            >
              + Add a receiving site
            </button>
          </div>
        )}

        {type === "relocate_and_consolidate" && (
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-medium text-stone-700">Sites to exit (two or more)</p>
              {errors.exits ? <FormError message={errors.exits} /> : null}
              <div className="space-y-2">
                {sites.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center gap-3">
                    <label className="flex min-w-64 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={s.id in exits}
                        onChange={(e) =>
                          setExits((p) => {
                            const next = { ...p };
                            if (e.target.checked) next[s.id] = "expiry";
                            else delete next[s.id];
                            return next;
                          })
                        }
                      />
                      {s.name}
                    </label>
                    {s.id in exits ? (
                      <select
                        aria-label={`How ${s.name} is exited`}
                        value={exits[s.id]}
                        onChange={(e) => setExits((p) => ({ ...p, [s.id]: e.target.value as Mechanism }))}
                        className={`${inputClass} max-w-xs`}
                      >
                        {EXIT_MECHANISMS.map((m) => (
                          <option key={m} value={m}>
                            {EXIT_LABELS[m]}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-stone-700">New lease</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {(
                  [
                    ["name", "Premises name", "text"],
                    ["city", "City", "text"],
                    ["rentableArea", "Rentable area (sq ft)", "number"],
                    ["netRentPsf", "Net rent ($/sq ft)", "number"],
                    ["additionalRentPsf", "Additional rent ($/sq ft)", "number"],
                    ["netEscalationPct", "Net escalation (%/yr)", "number"],
                    ["additionalEscalationPct", "Additional escalation (%/yr)", "number"],
                    ["commencementDate", "Commencement", "date"],
                    ["expiryDate", "Expiry", "date"],
                    ["freeRentMonths", "Free rent (months)", "number"],
                  ] as const
                ).map(([key, label, inputType]) => (
                  <Field key={key} label={label} name={`newLease.${key}`} error={errors[`newLease.${key}`]}>
                    <input
                      id={`newLease.${key}`}
                      type={inputType}
                      min={0}
                      step="any"
                      value={newLease[key] ?? ""}
                      onChange={(e) => setNewLease((p) => ({ ...p, [key]: e.target.value }))}
                      className={inputClass}
                    />
                  </Field>
                ))}
                <Field label="Segment" name="newLease.segment" hint="Used for market renewal if the new lease ends within the horizon.">
                  <select
                    id="newLease.segment"
                    value={newLease.segment}
                    onChange={(e) => setNewLease((p) => ({ ...p, segment: e.target.value }))}
                    className={inputClass}
                  >
                    {SEGMENTS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle hint="Make-good and double-running rent are calculated for you from the leases. Leave anything that does not apply blank.">
          One-time costs
        </SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {COST_FIELDS.map((c) => (
            <Field key={c.key} label={c.label} name={`oneTimeCosts.${c.key}`} error={errors[`oneTimeCosts.${c.key}`]} {...(c.hint ? { hint: c.hint } : {})}>
              <input
                id={`oneTimeCosts.${c.key}`}
                type="number"
                min={0}
                step="any"
                value={costs[c.key] ?? ""}
                onChange={(e) => setCosts((p) => ({ ...p, [c.key]: e.target.value }))}
                className={inputClass}
              />
            </Field>
          ))}
        </div>
      </Card>

      <Footer pending={pending} error={errors._form ?? (Object.keys(errors).length > 0 ? "Check the highlighted fields." : undefined)} />
    </form>
  );
}

function Footer({ pending, error }: { pending: boolean; error: string | undefined }): ReactNode {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <button type="submit" disabled={pending} className={buttonClass.primary}>
        {pending ? "Running the engine…" : "Run scenario"}
      </button>
      <FormError message={error} />
    </div>
  );
}
