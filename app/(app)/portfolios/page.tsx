import Link from "next/link";
import { NewPortfolioForm } from "@/components/portfolio-forms";
import { Badge, Card } from "@/components/ui";
import { requireContext } from "@/lib/auth/session";
import { listPortfolios } from "@/lib/data/repo";
import { db } from "@/lib/db";

export const metadata = { title: "Portfolios · Lease Consolidation Engine" };

export default async function PortfoliosPage() {
  const { organization } = await requireContext();
  const portfolios = await listPortfolios(db, organization.id);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl leading-tight text-ink md:text-5xl">Portfolios</h1>
      <ul className="grid gap-3 md:grid-cols-2">
        {portfolios.map((p) => (
          <li key={p.id}>
            <Link
              href={`/portfolios/${p.id}`}
              className="block rounded-3xl border border-stone-200/80 bg-white p-6 transition hover:border-ink"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-ink">{p.name}</span>
                {p.isSample ? <Badge tone="amber">Sample data</Badge> : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <Card>
        <NewPortfolioForm />
      </Card>
    </div>
  );
}
