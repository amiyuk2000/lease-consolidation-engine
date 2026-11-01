import Link from "next/link";
import { notFound } from "next/navigation";
import { ScenarioForm } from "@/components/scenario-form";
import { SampleDataNotice, buttonClass } from "@/components/ui";
import { requireContext } from "@/lib/auth/session";
import { getPortfolio, listSites } from "@/lib/data/repo";
import { db } from "@/lib/db";
import { isUuid, todayIso } from "@/lib/today";

export const metadata = { title: "Model a real offer · Lease Consolidation Engine" };

export default async function NewScenarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organization } = await requireContext();
  if (!isUuid(id)) notFound();
  const portfolio = await getPortfolio(db, organization.id, id);
  if (!portfolio) notFound();
  const sites = await listSites(db, organization.id, id);

  const [year, month] = todayIso().split("-").map(Number) as [number, number];
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/portfolios/${id}`} className={buttonClass.link}>
          ← {portfolio.name}
        </Link>
        <h1 className="mt-1 font-display text-4xl leading-tight text-ink md:text-5xl">Model a real offer</h1>
      </div>
      {portfolio.isSample ? <SampleDataNotice /> : null}
      <ScenarioForm
        portfolioId={id}
        defaultEffectiveDate={next}
        sites={sites.map((s) => ({
          id: s.id,
          name: s.name,
          headcount: s.headcount,
          city: s.city,
          segment: s.segment,
          rentableArea: Number(s.rentableArea),
          hasBreakOption: s.breakDate !== null,
        }))}
      />
    </div>
  );
}
