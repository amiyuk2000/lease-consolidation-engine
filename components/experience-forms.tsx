"use client";

import { useActionState } from "react";
import { saveStandardsAction } from "@/app/actions/portfolio";
import type { FormState } from "@/app/actions/auth";
import { PURPOSES } from "@/lib/engine/experience";
import { PURPOSE_LABELS, STANDARD_FIELDS } from "@/lib/schemas/experience";
import { SubmitButton } from "./submit-button";
import { Field, FormError, inputClass } from "./ui";

type StandardField = (typeof STANDARD_FIELDS)[number];

const LABELS: Record<StandardField, { label: string; hint: string; step: string }> = {
  minSeatsPerPeakOccupant: { label: "Workstations per peak occupant, at least", hint: "1 means a desk for everyone in on the busiest day.", step: "0.01" },
  maxPeoplePerFocusRoom: { label: "Peak occupants per focus room, at most", hint: "e.g. 10 means one focus room for every 10 people.", step: "1" },
  maxPeoplePerConfidentialRoom: { label: "Peak occupants per confidential room, at most", hint: "Enclosed rooms for private conversations.", step: "1" },
  minSpaceTypes: { label: "Space types, at least (of 4)", hint: "Focus, confidential, collaboration and social.", step: "1" },
  maxBusyQuietGapPts: {
    label: "Busy-to-quiet gap, at most (points)",
    hint: "Busiest-day fullness minus quietest-day fullness, measured against workstations.",
    step: "1",
  },
};

/** The portfolio's workplace brief. Blank targets are not scored. */
export function ExperienceStandardsForm({ portfolioId, values }: { portfolioId: string; values: Record<string, string> }) {
  const [state, action] = useActionState<FormState, FormData>(saveStandardsAction.bind(null, portfolioId), {});
  const value = (name: string) => state.values?.[name] ?? values[name] ?? "";
  const purposes = value("purposes").split(",").filter(Boolean);
  return (
    <form action={action} className="space-y-5">
      <FormError message={state.errors?._form} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STANDARD_FIELDS.map((f) => (
          <Field key={f} label={LABELS[f].label} name={`std-${f}`} error={state.errors?.[f]} hint={LABELS[f].hint}>
            <input id={`std-${f}`} name={f} type="number" min={0} step={LABELS[f].step} defaultValue={value(f)} placeholder="Not set" className={inputClass} />
          </Field>
        ))}
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink-soft">The office must serve these purposes</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {PURPOSES.map((p) => (
            <label key={p} className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="purposes" value={p} defaultChecked={purposes.includes(p)} className="h-4 w-4 accent-ink" />
              {PURPOSE_LABELS[p]}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-stone-500">Each purpose needs at least one space of its type.</p>
      </fieldset>
      <div className="flex items-center gap-3">
        <SubmitButton variant="secondary" pendingText="Saving…">
          Save standards
        </SubmitButton>
        {state.values?._saved && !state.errors ? <span className="text-sm text-emerald-800">Saved.</span> : null}
      </div>
    </form>
  );
}
