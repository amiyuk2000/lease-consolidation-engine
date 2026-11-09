import type { IndicatorKey, IndicatorStatus, MixBasis, WorkplaceExperience } from "@/lib/engine";
import { number } from "@/lib/format";
import { Badge } from "./ui";

/** What each indicator asks. */
export const INDICATORS: Record<IndicatorKey, { label: string; question: string }> = {
  busiest_day_seats: {
    label: "Room on the busiest day",
    question: "Is there enough space for everyone who comes in mid-week?",
  },
  focus: {
    label: "Space to focus",
    question: "Is there somewhere quiet to focus?",
  },
  confidential: {
    label: "Confidential meetings",
    question: "Can I hold a confidential meeting?",
  },
  variety: {
    label: "Variety and choice",
    question: "Is there more than one type of space to choose from?",
  },
  purpose: {
    label: "An office with a purpose",
    question: "Does the office support each kind of work my team comes in for?",
  },
  busy_quiet_gap: {
    label: "Busy and quiet days",
    question: "Is the office very different on a Monday or Friday from a Wednesday?",
  },
};

const STATUS: Record<IndicatorStatus, { label: string; tone: "teal" | "rose" | "amber" | "slate" }> = {
  met: { label: "Meets", tone: "teal" },
  not_met: { label: "Short", tone: "rose" },
  unknown: { label: "Unknown", tone: "amber" },
  not_set: { label: "No standard", tone: "slate" },
  not_applicable: { label: "Not applicable", tone: "slate" },
};

export function StatusBadge({ status }: { status: IndicatorStatus }) {
  return <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>;
}

export function scoreText(w: WorkplaceExperience): string {
  if (w.score.scored === 0) return "No standards set";
  const unknown = w.score.unknown > 0 ? `, ${w.score.unknown} unknown` : "";
  return `Meets ${w.score.met} of ${w.score.scored}${unknown}`;
}

export function ScoreBadge({ w }: { w: WorkplaceExperience }) {
  const { met, scored, unknown } = w.score;
  const tone = scored === 0 ? "slate" : met === scored ? "teal" : met + unknown === scored ? "amber" : "rose";
  return <Badge tone={tone}>{scoreText(w)}</Badge>;
}

export function mixNote(w: WorkplaceExperience): string | null {
  const notes: Record<MixBasis, string | null> = {
    recorded: null,
    pro_rata: `Assumption: each space type shrinks with the area kept (${number(w.retainedShare?.times(100), 1)}%), to the nearest whole space. A test-fit would confirm the real mix.`,
    before_refit: "Today's space mix. The densification fit-out will change it; enter the new layout once it is designed.",
    unknown:
      w.siteId === null
        ? "New premises: the space mix is unknown until a test-fit. Nothing is assumed."
        : "Space mix not recorded for this site. Add it under Edit to score it.",
  };
  return notes[w.mixBasis];
}

/** One workplace's scorecard, with today's result alongside when there is one to compare. */
export function ExperienceScorecard({ after, before }: { after: WorkplaceExperience; before?: WorkplaceExperience | undefined }) {
  const note = mixNote(after);
  return (
    <div className="rounded-2xl border border-stone-200 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium text-ink">{after.name}</p>
        <p className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
          {before ? (
            <>
              <span>Today</span>
              <ScoreBadge w={before} />
              <span aria-hidden>→</span>
              <span>After</span>
            </>
          ) : null}
          <ScoreBadge w={after} />
        </p>
      </div>
      <p className="mt-1 text-xs text-stone-500">
        {after.peakOccupants} people on the busiest day
        {after.quietOccupants === null ? "" : `, ${after.quietOccupants} on the quietest`}
        {after.areaPerPeakOccupant ? ` · ${number(after.areaPerPeakOccupant)} sq ft per peak occupant (shown, not scored)` : ""}
      </p>
      {note ? <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">{note}</p> : null}
      <ul className="mt-3 divide-y divide-stone-100 text-sm">
        {after.indicators.map((i) => {
          const was = before?.indicators.find((b) => b.key === i.key);
          return (
            <li key={i.key} className="grid gap-1 py-2.5 sm:grid-cols-[12rem_1fr_auto] sm:gap-4">
              <div>
                <p className="font-medium text-ink">{INDICATORS[i.key].label}</p>
                <p className="text-xs text-stone-500">{INDICATORS[i.key].question}</p>
              </div>
              <p className="text-stone-700">
                {i.detail}
                {was && was.detail !== i.detail ? <span className="block text-xs text-stone-500">Today: {was.detail}</span> : null}
              </p>
              <div className="sm:text-right">
                <StatusBadge status={i.status} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ExperienceNote() {
  return (
    <p className="text-xs text-stone-500">
      The targets are your own workplace brief. The scorecard measures whether the workplace provides what people need, not how they feel
      about it; that needs surveys.
    </p>
  );
}
