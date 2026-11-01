import type { ReactNode } from "react";

export const buttonClass = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-medium text-white transition hover:bg-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-full border border-stone-300 bg-white px-6 py-3 text-sm font-medium text-ink transition hover:border-ink disabled:opacity-60",
  inverse:
    "inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-ink transition hover:bg-stone-200 disabled:opacity-60",
  danger: "inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm text-rose-700 hover:bg-rose-50",
  link: "text-sm font-medium text-ink underline decoration-stone-300 underline-offset-4 hover:decoration-ink",
};

export const inputClass =
  "block w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-stone-400 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl border border-stone-200/80 bg-white p-6 md:p-8 ${className}`}>{children}</section>;
}

export function PageTitle({ children, eyebrow }: { children: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div>
      {eyebrow ? <div className="mb-2">{eyebrow}</div> : null}
      <h1 className="font-display text-4xl leading-tight text-ink md:text-5xl">{children}</h1>
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="font-display text-2xl text-ink">{children}</h2>
      {hint ? <p className="mt-1 text-sm text-stone-500">{hint}</p> : null}
    </div>
  );
}

const badgeTones = {
  slate: "bg-stone-100 text-stone-700",
  teal: "bg-emerald-50 text-emerald-800",
  amber: "bg-amber-50 text-amber-800",
  rose: "bg-rose-50 text-rose-800",
  sky: "bg-sky-50 text-sky-800",
};

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: keyof typeof badgeTones }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeTones[tone]}`}>{children}</span>;
}

export function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string;
  name: string;
  error?: string | undefined;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-sm font-medium text-ink-soft">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="mt-1 text-xs text-stone-500">{hint}</p> : null}
      {error ? (
        <p className="mt-1 text-xs text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return (
    <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-800" role="alert">
      {message}
    </p>
  );
}

export function Stat({ label, value, tone, note }: { label: string; value: ReactNode; tone?: "good" | "bad" | "neutral"; note?: ReactNode }) {
  const color = tone === "good" ? "text-emerald-800" : tone === "bad" ? "text-rose-700" : "text-ink";
  return (
    <div className="rounded-3xl border border-stone-200/80 bg-white p-6">
      <p className="text-sm text-stone-500">{label}</p>
      <p className={`mt-2 font-display text-4xl tabular-nums ${color}`}>{value}</p>
      {note ? <p className="mt-2 text-xs text-stone-500">{note}</p> : null}
    </div>
  );
}

export function SampleDataNotice() {
  return (
    <p className="rounded-2xl bg-amber-50 px-5 py-3 text-sm text-amber-900">
      <strong className="font-medium">Sample data.</strong> Every site and lease in this portfolio is invented for demonstration. Market
      figures are real and cited.
    </p>
  );
}
