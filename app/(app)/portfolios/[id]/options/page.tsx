import Link from "next/link";
import { notFound } from "next/navigation";
import { saveOptionAction } from "@/app/actions/options";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, Field, SampleDataNotice, SectionTitle, buttonClass, inputClass } from "@/components/ui";
import { requireContext } from "@/lib/auth/session";
import { getPortfolio, listBenchmarks, listSites, toSiteInput } from "@/lib/data/repo";
import { db } from "@/lib/db";
import { rankOptions, type Decimal, type Payback, type RankedOption } from "@/lib/engine";
import { fieldErrors } from "@/lib/schemas/common";
import { OPTIONAL_RATE_FIELDS, RATE_FIELDS, RATE_GROUPS, SAMPLE_RATES, optionRatesSchema, type RateField } from "@/lib/schemas/options";
import { money, months, sqft } from "@/lib/format";
import { isUuid, todayIso } from "@/lib/today";

export const metadata = { title: "Ranked options · Lease Consolidation Engine" };

const RATE_LABELS: Record<RateField, { label: string; hint: string; placeholder?: string }> = {
  targetDensity: { label: "Target density (sq ft per peak occupant)", hint: "Sizes every site. Below 120 is flagged." },
  horizonYears: { label: "Horizon (years)", hint: "Blank uses the default.", placeholder: "10 (default)" },
  discountRatePct: { label: "Discount rate (%)", hint: "Blank uses the default.", placeholder: "8 (default)" },
  fitOutPsf: { label: "Fit-out ($ per sq ft)", hint: "Receiving space, new premises, or a site being densified." },
  movingPerPerson: { label: "Moving ($ per person)", hint: "Per person relocated." },
  itPerPerson: { label: "IT ($ per person)", hint: "Per person relocated." },
  subletDiscountPct: { label: "Sublet discount (%)", hint: "Sublet rent below passing gross rent." },
  surrenderPremiumMonths: { label: "Surrender premium (months of rent)", hint: "On the space surrendered mid-term." },
  extensionYears: { label: "Blend and extend term (years added)", hint: "Rent blends to the benchmark market rent." },
  newLeaseTermYears: { label: "New lease term (years)", hint: "When relocating. Rent is the benchmark market rent." },
  newLeaseTiPsf: { label: "New lease TI allowance ($ per sq ft)", hint: "Landlord's contribution to fit-out." },
  newLeaseFreeRentMonths: { label: "New lease free rent (months)", hint: "Net rent abated at the start." },
};

export default async function OptionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { organization } = await requireContext();
  if (!isUuid(id)) notFound();
  const portfolio = await getPortfolio(db, organization.id, id);
  if (!portfolio) notFound();

  const submitted = RATE_FIELDS.some((f) => typeof query[f] === "string");
  const usingSampleRates = !submitted && portfolio.isSample;
  const raw: Record<string, string> = Object.fromEntries(
    RATE_FIELDS.map((f) => [f, usingSampleRates ? SAMPLE_RATES[f] : typeof query[f] === "string" ? query[f] : ""]),
  );
  const parsed = submitted || usingSampleRates ? optionRatesSchema.safeParse(raw) : null;
  const errors = parsed && !parsed.success ? fieldErrors(parsed.error) : {};

  let options: ReturnType<typeof rankOptions> | null = null;
  if (parsed?.success) {
    const [siteRows, benchmarks] = await Promise.all([listSites(db, organization.id, id), listBenchmarks(db)]);
    const rates = parsed.data;
    options = rankOptions({
      valuationDate: todayIso(),
      sites: siteRows.map(toSiteInput),
      benchmarks,
      rates,
      ...(rates.horizonYears !== undefined ? { horizonYears: rates.horizonYears } : {}),
      ...(rates.discountRatePct !== undefined ? { discountRatePct: rates.discountRatePct } : {}),
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/portfolios/${id}`} className={buttonClass.link}>
          ← {portfolio.name}
        </Link>
        <h1 className="mt-1 font-display text-4xl leading-tight text-ink md:text-5xl">Ranked options</h1>
        <p className="mt-1 max-w-3xl text-sm text-stone-600">
          The engine builds an option for every strategy at every site, checks each against what the leases permit, and ranks the feasible
          ones by net present value against doing nothing. Deals a landlord must agree to are priced at the benchmark market rent with your
          negotiated-terms rates; a real offer will differ, and you can model it in the scenario builder. The decision stays yours: location,
          people and landlord relationships are not in the numbers.
        </p>
      </div>
      {portfolio.isSample ? <SampleDataNotice /> : null}

      <Card>
        <SectionTitle hint="One-time costs and negotiated terms are never assumed. These rates cost every option the same way.">Your rates</SectionTitle>
        {usingSampleRates ? (
          <p className="mb-5 rounded-2xl bg-amber-50 px-5 py-3 text-sm text-amber-900">
            <strong>Sample cost rates (invented).</strong> Prefilled so you can see a ranking straight away. Change any of them and re-rank.
          </p>
        ) : null}
        <form method="get" className="space-y-6">
          {RATE_GROUPS.map((group) => (
            <fieldset key={group.title}>
              <legend className="mb-3 text-sm font-medium text-ink">{group.title}</legend>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.fields.map((f) => (
                  <Field key={f} label={RATE_LABELS[f].label} name={f} error={errors[f]} hint={RATE_LABELS[f].hint}>
                    <input
                      id={f}
                      name={f}
                      type="number"
                      min={0}
                      step="any"
                      defaultValue={raw[f]}
                      placeholder={RATE_LABELS[f].placeholder}
                      required={!OPTIONAL_RATE_FIELDS.includes(f)}
                      className={inputClass}
                    />
                  </Field>
                ))}
              </div>
            </fieldset>
          ))}
          <button type="submit" className={buttonClass.primary}>
            Rank options
          </button>
        </form>
      </Card>

      {options ? (
        <>
          <Card>
            <SectionTitle hint="Hold every site and renew at market. Every option below is measured against this.">Baseline: do nothing</SectionTitle>
            <p className="text-2xl font-semibold tabular-nums text-ink">{money(options.baseline.total)}</p>
            <p className="text-sm text-stone-500">
              Total occupancy cost over {options.baseline.annualCost.length} years, CAD
            </p>
          </Card>

          <Card>
            <SectionTitle hint="Best net present value first. Each option is evaluated on its own against the baseline; options that use the same space, such as closing a site into another and also giving back the receiving site's surplus, cannot both happen, so their savings do not add up.">
              {options.ranked.length} feasible option{options.ranked.length === 1 ? "" : "s"}
            </SectionTitle>
            {options.ranked.length === 0 ? (
              <p className="text-sm text-stone-500">No option is feasible with these leases and rates. The reasons are listed below.</p>
            ) : (
              <ol className="space-y-3">
                {options.ranked.map((option, i) => (
                  <OptionRow key={option.key} rank={i + 1} option={option} action={saveOptionAction.bind(null, id, raw, option.key)} />
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <SectionTitle hint="Each is blocked by a lease term, capacity, timing or market rent. Nothing is silently dropped.">
              Ruled out
            </SectionTitle>
            <ul className="grid gap-x-8 gap-y-4 text-sm md:grid-cols-2">
              {options.ruledOut.map((r) => (
                <li key={r.key}>
                  <p className="font-medium text-stone-800">{r.label}</p>
                  <p className="text-stone-600">{r.reason}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-display text-2xl text-ink">Have a real offer?</p>
              <p className="mt-1 text-sm text-stone-500">
                Enter the landlord&apos;s actual terms, a specific building or a contractor&apos;s quote in the scenario builder.
              </p>
            </div>
            <Link href={`/portfolios/${id}/scenarios/new`} className={buttonClass.secondary}>
              Open the scenario builder
            </Link>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function OptionRow({ rank, option, action }: { rank: number; option: RankedOption; action: () => Promise<void> }) {
  const f = option.result.financials;
  const warnings = option.result.constraints.filter((c) => c.severity === "warning");
  const cumulative = f?.years.at(-1)?.cumulativeDelta ?? null;
  return (
    <li className="rounded-2xl border border-stone-200 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-100 text-sm font-semibold text-stone-700">{rank}</span>
          <div className="min-w-0">
            <p className="font-medium text-ink">{option.label}</p>
            {warnings.length > 0 ? (
              <ul className="mt-1 space-y-0.5">
                {warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-stone-600">
                    <Badge tone="amber">Warning</Badge>
                    <span>{w.message}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {option.result.noTakerCase ? (
              <p className="mt-1 text-xs text-stone-600">
                If no subtenant is found: NPV {money(option.result.noTakerCase.npvOfDelta)}.
              </p>
            ) : null}
          </div>
        </div>
        <form action={action} className="shrink-0">
          <SubmitButton variant="secondary" pendingText="Opening…">
            Open full analysis
          </SubmitButton>
        </form>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
        <Metric label="NPV vs baseline" value={money(f?.npvOfDelta)} sign={f?.npvOfDelta ?? null} />
        <Metric label="Payback" value={paybackText(f?.payback)} />
        <Metric label="One-time cost" value={money(f?.oneTimeCosts.total)} />
        <Metric label="Cumulative saving" value={money(cumulative)} sign={cumulative} />
        <Metric label="Area released" value={sqft(option.result.space?.areaReleased)} />
      </dl>
    </li>
  );
}

function Metric({ label, value, sign }: { label: string; value: string; sign?: Decimal | null }) {
  const color = sign && !sign.isZero() ? (sign.isNegative() ? "text-rose-700" : "text-emerald-700") : "text-ink";
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-stone-500">{label}</dt>
      <dd className={`font-semibold tabular-nums ${color}`}>{value}</dd>
    </div>
  );
}

function paybackText(p: Payback | undefined): string {
  if (!p) return "Unknown";
  switch (p.status) {
    case "immediate":
      return "Immediate";
    case "months":
      return months(p.months);
    case "never":
      return "Not within horizon";
    case "unknown":
      return "Unknown";
  }
}
