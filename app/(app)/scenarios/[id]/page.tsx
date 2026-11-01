import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { deleteScenarioAction } from "@/app/actions/portfolio";
import { AnnualCostChart, CumulativeChart, type ChartRow } from "@/components/results-charts";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, SampleDataNotice, SectionTitle, Stat, buttonClass } from "@/components/ui";
import { requireContext } from "@/lib/auth/session";
import { getPortfolio, getScenario, listBenchmarks, listSites, toSiteInput } from "@/lib/data/repo";
import { db } from "@/lib/db";
import { evaluateScenario, type Constraint, type Decimal, type Payback, type ScenarioResult } from "@/lib/engine";
import { chartValue, money, months, number, sqft } from "@/lib/format";
import { SCENARIO_LABELS, scenarioSchema, toEngineInput } from "@/lib/schemas/scenario";
import { isUuid } from "@/lib/today";

export default async function ScenarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organization } = await requireContext();
  if (!isUuid(id)) notFound();
  const scenario = await getScenario(db, organization.id, id);
  if (!scenario) notFound();
  const [portfolio, siteRows, benchmarks] = await Promise.all([
    getPortfolio(db, organization.id, scenario.portfolioId),
    listSites(db, organization.id, scenario.portfolioId),
    listBenchmarks(db),
  ]);
  if (!portfolio) notFound();

  const payload = scenarioSchema.safeParse(scenario.assumptions);
  if (!payload.success) {
    return <p className="text-rose-700">This scenario&apos;s saved inputs are no longer valid. Delete it and model it again.</p>;
  }
  const result = evaluateScenario(toEngineInput(payload.data, scenario.valuationDate), {
    sites: siteRows.map(toSiteInput),
    benchmarks,
  });
  const f = result.financials;
  const horizon = result.baseline.annualCost.length;
  const discount = result.assumptions.find((a) => a.key === "discount_rate_pct");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/portfolios/${portfolio.id}`} className={buttonClass.link}>
            ← {portfolio.name}
          </Link>
          <h1 className="mt-1 font-display text-4xl leading-tight text-ink md:text-5xl">{scenario.name}</h1>
          <p className="mt-1 text-sm text-stone-600">
            {SCENARIO_LABELS[scenario.type]} · valued {scenario.valuationDate} · {horizon}-year horizon · all figures {result.currency}
          </p>
        </div>
        {result.feasible ? <Badge tone="teal">Feasible</Badge> : <Badge tone="rose">Infeasible</Badge>}
      </div>
      {portfolio.isSample ? <SampleDataNotice /> : null}

      {!result.feasible ? (
        <Card className="border-rose-200 bg-rose-50">
          <h2 className="font-semibold text-rose-900">The leases do not permit this scenario as set up.</h2>
          <p className="mt-1 text-sm text-rose-900">
            No savings figure is shown, because any number would imply the action is possible. The constraints report explains why; the
            baseline below is the cost of doing nothing.
          </p>
        </Card>
      ) : null}

      {f ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="NPV of saving vs baseline"
              value={money(f.npvOfDelta)}
              tone={tone(f.npvOfDelta)}
              note={`Discounted at ${discount?.value ?? ""}${discount?.source === "default" ? " (default)" : ""}`}
            />
            <Stat label="Payback" value={paybackText(f.payback)} note="From the first outlay, undiscounted" />
            <Stat label="Total one-time cost" value={money(f.oneTimeCosts.total)} note="Including fees and double-running rent" />
            <Stat
              label={`Cumulative saving, ${horizon} years`}
              value={money(f.years.at(-1)?.cumulativeDelta)}
              tone={tone(f.years.at(-1)?.cumulativeDelta ?? null)}
              note="Undiscounted"
            />
          </div>
          <Card>
            <div className="grid gap-8 lg:grid-cols-2">
              <AnnualCostChart rows={chartRows(result)} />
              <CumulativeChart rows={chartRows(result)} />
            </div>
          </Card>
        </>
      ) : null}

      <ConstraintsReport constraints={result.constraints} />

      <Card>
        <SectionTitle hint="Baseline: hold every site, renew each at market rent at expiry, escalate net and additional rent separately.">
          Year by year
        </SectionTitle>
        <div className="-mx-5 overflow-x-auto">
          <table className="min-w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-stone-200 text-right text-xs uppercase tracking-wide text-stone-500">
                <th className="px-5 py-2 text-left font-medium">Year</th>
                <th className="px-3 py-2 font-medium">Baseline</th>
                {f ? (
                  <>
                    <th className="px-3 py-2 font-medium">Scenario rent</th>
                    <th className="px-3 py-2 font-medium">Sublet income</th>
                    <th className="px-3 py-2 font-medium">One-time</th>
                    <th className="px-3 py-2 font-medium">Saving</th>
                    <th className="px-5 py-2 font-medium">Cumulative</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {result.baseline.annualCost.map((baseline, i) => {
                const y = f?.years[i];
                return (
                  <tr key={i} className="border-b border-stone-100 text-right">
                    <td className="px-5 py-2 text-left">{i + 1}</td>
                    <td className="px-3 py-2">{money(baseline)}</td>
                    {y ? (
                      <>
                        <td className="px-3 py-2">{money(y.scenarioOccupancyCost)}</td>
                        <td className="px-3 py-2">{y.subletIncome?.isZero() ? "—" : money(y.subletIncome)}</td>
                        <td className="px-3 py-2">{y.oneTimeCost?.isZero() ? "—" : money(y.oneTimeCost)}</td>
                        <td className={`px-3 py-2 ${signClass(y.delta)}`}>{money(y.delta)}</td>
                        <td className={`px-5 py-2 ${signClass(y.cumulativeDelta)}`}>{money(y.cumulativeDelta)}</td>
                      </>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="text-right font-medium">
                <td className="px-5 py-2 text-left">Total</td>
                <td className="px-3 py-2">{money(result.baseline.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-3 text-xs text-stone-500">
          Saving = baseline − (scenario rent − sublet income + one-time costs). Positive is a saving. &ldquo;Unknown&rdquo; means a market rent
          benchmark is missing for a renewal; the engine does not estimate one.
        </p>
      </Card>

      {f ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <SectionTitle>One-time costs</SectionTitle>
            <dl className="divide-y divide-stone-100 text-sm">
              <Row label="Make-good on released space" value={money(f.oneTimeCosts.makeGood)} />
              <Row label="Fit-out net of TI allowance" value={money(f.oneTimeCosts.fitOutNetOfTi)} />
              <Row label="Moving" value={money(f.oneTimeCosts.moving)} />
              <Row label="IT" value={money(f.oneTimeCosts.it)} />
              <Row label="Furniture" value={money(f.oneTimeCosts.furniture)} />
              <Row label="Signage" value={money(f.oneTimeCosts.signage)} />
              <Row label="Surrender premium" value={money(f.oneTimeCosts.surrenderPremium)} />
              <Row label="Early termination penalty" value={money(f.oneTimeCosts.terminationPenalty)} />
              <Row label="Double-running rent" value={money(f.oneTimeCosts.doubleRunning)} />
              <Row label="Professional fees" value={money(f.oneTimeCosts.professionalFees)} />
              <Row
                label="Business disruption"
                value={f.oneTimeCosts.businessDisruption ? money(f.oneTimeCosts.businessDisruption) : "Not supplied"}
              />
              <Row label="Total" value={money(f.oneTimeCosts.total)} strong />
            </dl>
          </Card>
          <Card>
            <SectionTitle>Space after the change</SectionTitle>
            <dl className="divide-y divide-stone-100 text-sm">
              <Row label="Area released" value={sqft(result.space?.areaReleased)} />
              {result.space && !result.space.areaAdded.isZero() ? <Row label="Area added" value={sqft(result.space.areaAdded)} /> : null}
              {result.space?.sites.map((s) => (
                <Row
                  key={s.siteId ?? s.name}
                  label={`${s.name}: ${s.peakOccupants} peak occupants in ${sqft(s.rentableArea)}`}
                  value={s.areaPerPeakOccupant ? `${number(s.areaPerPeakOccupant)} sq ft each` : "No occupants"}
                />
              ))}
            </dl>
            {result.noTakerCase ? (
              <div className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
                <p className="font-medium">If no subtenant is found</p>
                <p className="mt-1">
                  NPV {money(result.noTakerCase.npvOfDelta)}, cumulative {money(result.noTakerCase.cumulativeDelta)}, payback{" "}
                  {paybackText(result.noTakerCase.payback).toLowerCase()}.
                </p>
              </div>
            ) : null}
            {result.fullTermCost ? (
              <div className="mt-4 rounded-2xl bg-sky-50 p-3 text-sm text-sky-900 ring-1 ring-sky-200">
                <p className="font-medium">Full committed term</p>
                <p className="mt-1">
                  {money(result.fullTermCost.cost)} gross rent over {months(result.fullTermCost.months)}, including any months beyond the horizon.
                </p>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}

      <Card>
        <SectionTitle hint="Every input behind these numbers. Defaults are labelled; market figures cite their source.">Assumptions</SectionTitle>
        <dl className="divide-y divide-stone-100 text-sm">
          {result.assumptions.map((a) => (
            <div key={a.key} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <dt className="text-stone-600">{a.label}</dt>
              <dd className="flex items-center gap-2 text-right text-ink">
                {a.value}
                {a.source === "default" ? <Badge tone="amber">Default</Badge> : a.source === "benchmark" ? <Badge tone="sky">Benchmark</Badge> : null}
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <form action={deleteScenarioAction.bind(null, portfolio.id, scenario.id)} className="text-right">
        <SubmitButton variant="danger" pendingText="Deleting…">
          Delete this scenario
        </SubmitButton>
      </form>
    </div>
  );
}

const SEVERITY = {
  infeasible: { label: "Infeasible", tone: "rose" },
  warning: { label: "Warning", tone: "amber" },
  info: { label: "Note", tone: "slate" },
} as const;

function ConstraintsReport({ constraints }: { constraints: Constraint[] }) {
  const order = { infeasible: 0, warning: 1, info: 2 };
  const sorted = [...constraints].sort((a, b) => order[a.severity] - order[b.severity]);
  return (
    <Card>
      <SectionTitle hint="Anything the scenario violates or depends on. Nothing is silently clamped.">Constraints report</SectionTitle>
      {sorted.length === 0 ? (
        <p className="text-sm text-stone-500">No constraints raised.</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((c, i) => (
            <li key={`${c.code}-${i}`} className="flex items-start gap-3 text-sm">
              <span className="w-24 shrink-0">
                <Badge tone={SEVERITY[c.severity].tone}>{SEVERITY[c.severity].label}</Badge>
              </span>
              <span className="text-stone-800">{c.message}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Row({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 py-2 ${strong ? "font-semibold text-ink" : ""}`}>
      <dt className={strong ? "" : "text-stone-600"}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function chartRows(result: ScenarioResult): ChartRow[] {
  return (result.financials?.years ?? []).map((y) => {
    const scenarioTotal =
      y.scenarioOccupancyCost && y.subletIncome && y.oneTimeCost ? y.scenarioOccupancyCost.minus(y.subletIncome).plus(y.oneTimeCost) : null;
    return {
      year: `Y${y.year}`,
      baseline: chartValue(y.baselineCost),
      scenario: chartValue(scenarioTotal),
      cumulative: chartValue(y.cumulativeDelta),
    };
  });
}

function paybackText(p: Payback): string {
  switch (p.status) {
    case "immediate":
      return "Immediate";
    case "months":
      return months(p.months);
    case "never":
      return "Does not pay back within horizon";
    case "unknown":
      return "Unknown";
  }
}

function tone(v: Decimal | null): "good" | "bad" | "neutral" {
  if (!v || v.isZero()) return "neutral";
  return v.isNegative() ? "bad" : "good";
}

function signClass(v: Decimal | null): string {
  if (!v || v.isZero()) return "";
  return v.isNegative() ? "text-rose-700" : "text-emerald-700";
}
