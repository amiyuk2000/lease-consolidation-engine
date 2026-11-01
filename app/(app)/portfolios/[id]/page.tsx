import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { deletePortfolioAction, deleteSiteAction } from "@/app/actions/portfolio";
import { EditSiteForm, NewSiteForm } from "@/components/portfolio-forms";
import type { sites } from "@/lib/db/schema";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, SampleDataNotice, SectionTitle, buttonClass } from "@/components/ui";
import { requireContext } from "@/lib/auth/session";
import { getPortfolio, listScenarios, listSites, toSiteInput } from "@/lib/data/repo";
import { db } from "@/lib/db";
import { areaPerPeakOccupant, dec, grossRentPsf, leaseTiming, peakOccupants } from "@/lib/engine";
import { money, number, psf, sqft } from "@/lib/format";
import { SCENARIO_LABELS } from "@/lib/schemas/scenario";
import { isUuid, todayIso } from "@/lib/today";

/** A site's stored values as form strings, for the edit form. The name is excluded: it is not editable. */
function editableValues(row: typeof sites.$inferSelect): Record<string, string> {
  return {
    city: row.city,
    segment: row.segment,
    rentableArea: row.rentableArea,
    usableArea: row.usableArea,
    headcount: String(row.headcount),
    peakAttendancePct: row.peakAttendancePct,
    netRentPsf: row.netRentPsf,
    additionalRentPsf: row.additionalRentPsf,
    netEscalationPct: row.netEscalationPct,
    additionalEscalationPct: row.additionalEscalationPct,
    leaseStart: row.leaseStart,
    leaseExpiry: row.leaseExpiry,
    breakDate: row.breakDate ?? "",
    breakNoticeMonths: row.breakNoticeMonths === null ? "" : String(row.breakNoticeMonths),
    makeGoodPsf: row.makeGoodPsf,
  };
}

export default async function PortfolioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { edit } = await searchParams;
  const editing = typeof edit === "string" ? edit : null;
  const { organization } = await requireContext();
  if (!isUuid(id)) notFound();
  const portfolio = await getPortfolio(db, organization.id, id);
  if (!portfolio) notFound();
  const [siteRows, scenarioRows] = await Promise.all([listSites(db, organization.id, id), listScenarios(db, organization.id, id)]);
  const today = todayIso();

  const rows = siteRows.map((row) => {
    const site = toSiteInput(row);
    const peak = peakOccupants(site.headcount, site.peakAttendancePct);
    const timing = leaseTiming(site, today);
    const gross = grossRentPsf(site.netRentPsf, site.additionalRentPsf);
    return { row, peak, timing, gross, perOccupant: areaPerPeakOccupant(site.rentableArea, peak), annual: gross.times(site.rentableArea) };
  });
  const totals = rows.reduce(
    (acc, r) => ({ area: acc.area.plus(r.row.rentableArea), headcount: acc.headcount + r.row.headcount, peak: acc.peak + r.peak, annual: acc.annual.plus(r.annual) }),
    { area: dec(0), headcount: 0, peak: 0, annual: dec(0) },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/portfolios" className={buttonClass.link}>
            ← Portfolios
          </Link>
          <h1 className="mt-1 font-display text-4xl leading-tight text-ink md:text-5xl">{portfolio.name}</h1>
        </div>
        {siteRows.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            <Link href={`/portfolios/${id}/scenarios/new`} className={buttonClass.secondary}>
              Model a real offer
            </Link>
            <Link href={`/portfolios/${id}/options`} className={buttonClass.primary}>
              Rank my options
            </Link>
          </div>
        ) : null}
      </div>
      {portfolio.isSample ? <SampleDataNotice /> : null}

      <Card>
        <SectionTitle hint={`Lease position as at ${today}. Peak occupants use peak attendance, never the average.`}>Sites</SectionTitle>
        {rows.length === 0 ? (
          <p className="text-sm text-stone-500">No sites yet. Add the first one below.</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
                  <th className="px-5 py-2 font-medium">Site</th>
                  <th className="px-3 py-2 text-right font-medium">Rentable</th>
                  <th className="px-3 py-2 text-right font-medium">Peak occupants</th>
                  <th className="px-3 py-2 text-right font-medium">Sq ft / peak occupant</th>
                  <th className="px-3 py-2 text-right font-medium">Gross rent</th>
                  <th className="px-3 py-2 text-right font-medium">Annual cost now</th>
                  <th className="px-3 py-2 font-medium">Can act in</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ row, peak, timing, gross, perOccupant, annual }) => (
                  <Fragment key={row.id}>
                  <tr className={`border-b border-stone-100 align-top ${editing === row.id ? "bg-canvas" : ""}`}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-ink">{row.name}</p>
                      <p className="text-xs text-stone-500">
                        {row.city} · {row.segment}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{sqft(row.rentableArea)}</td>
                    <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                      {peak}
                      <span className="block text-xs text-stone-500">
                        {row.headcount} × {number(row.peakAttendancePct, 1)}%
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{perOccupant ? number(perOccupant) : "No occupants"}</td>
                    <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                      {psf(gross)}
                      <span className="block text-xs text-stone-500">
                        {psf(row.netRentPsf)} net + {psf(row.additionalRentPsf)} add.
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{money(annual)}</td>
                    <td className="px-3 py-3">
                      {timing.expired ? (
                        <Badge tone="rose">Expired, holding over</Badge>
                      ) : (
                        <>
                          <span className="tabular-nums">{timing.monthsToAction} months</span>
                          <span className="block text-xs text-stone-500">
                            {timing.actionVia === "break_option" ? `break option ${row.breakDate}` : `expiry ${row.leaseExpiry}`}
                          </span>
                          {timing.breakStatus === "notice_passed" ? (
                            <span className="block text-xs text-amber-700">Break notice deadline passed</span>
                          ) : null}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/portfolios/${id}?edit=${row.id}`}
                          scroll={false}
                          className="rounded-full px-3 py-1 text-sm text-ink hover:bg-stone-100"
                        >
                          Edit
                        </Link>
                        <form action={deleteSiteAction.bind(null, id, row.id)}>
                          <SubmitButton variant="danger" pendingText="Removing…">
                            Remove
                          </SubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                  {editing === row.id ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-4">
                        <EditSiteForm portfolioId={id} siteId={row.id} siteName={row.name} values={editableValues(row)} />
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-ink">
                  <td className="px-5 py-3 font-medium">Portfolio</td>
                  <td className="px-3 py-3 text-right font-medium tabular-nums whitespace-nowrap">{sqft(totals.area)}</td>
                  <td className="px-3 py-3 text-right font-medium tabular-nums whitespace-nowrap">{totals.peak}</td>
                  <td className="px-3 py-3 text-right font-medium tabular-nums whitespace-nowrap">{totals.peak > 0 ? number(totals.area.dividedBy(totals.peak)) : "—"}</td>
                  <td />
                  <td className="px-3 py-3 text-right font-medium tabular-nums whitespace-nowrap">{money(totals.annual)}</td>
                  <td colSpan={2} className="px-3 py-3 text-xs text-stone-500">
                    All figures CAD
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <div className="mt-6 flex flex-wrap items-start gap-3">
          {siteRows.length > 0 ? (
            <Link href={`/portfolios/${id}/options`} className={buttonClass.primary}>
              Rank my options
            </Link>
          ) : null}
          <NewSiteForm portfolioId={id} />
        </div>
      </Card>

      <Card>
        <SectionTitle hint="Options you&apos;ve opened from the ranking, and deals you&apos;ve modelled with real terms. Each is compared with doing nothing: hold every site and renew at market.">Saved analyses</SectionTitle>
        {scenarioRows.length === 0 ? (
          <p className="text-sm text-stone-500">Nothing saved yet. Open an option from the ranking, or model a real offer.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {scenarioRows.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-3">
                <Link href={`/scenarios/${s.id}`} className="font-medium text-emerald-800 hover:underline">
                  {s.name}
                </Link>
                <span className="text-sm text-stone-500">
                  {SCENARIO_LABELS[s.type]} · valued {s.valuationDate}
                </span>
              </li>
            ))}
          </ul>
        )}
        {siteRows.length > 0 ? (
          <Link href={`/portfolios/${id}/scenarios/new`} className={`${buttonClass.secondary} mt-4`}>
            Model a real offer
          </Link>
        ) : null}
      </Card>

      <form action={deletePortfolioAction.bind(null, id)} className="text-right">
        <SubmitButton variant="danger" pendingText="Deleting…">
          Delete this portfolio
        </SubmitButton>
      </form>
    </div>
  );
}
