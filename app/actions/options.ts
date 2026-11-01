"use server";

import { notFound, redirect } from "next/navigation";
import { requireContext } from "@/lib/auth/session";
import { createScenario, getPortfolio, listBenchmarks, listSites, toSiteInput } from "@/lib/data/repo";
import { db } from "@/lib/db";
import { generateCandidates } from "@/lib/engine";
import { candidateToPayload, optionRatesSchema } from "@/lib/schemas/options";
import { scenarioSchema } from "@/lib/schemas/scenario";
import { isUuid, todayIso } from "@/lib/today";

/** Saves one ranked option as a scenario and opens its full analysis. */
export async function saveOptionAction(portfolioId: string, rawRates: Record<string, string>, key: string): Promise<void> {
  const { organization } = await requireContext();
  if (!isUuid(portfolioId) || !(await getPortfolio(db, organization.id, portfolioId))) notFound();
  const rates = optionRatesSchema.parse(rawRates);
  const [siteRows, benchmarks] = await Promise.all([listSites(db, organization.id, portfolioId), listBenchmarks(db)]);
  const valuationDate = todayIso();
  const { candidates } = generateCandidates({
    valuationDate,
    sites: siteRows.map(toSiteInput),
    benchmarks,
    rates,
    ...(rates.horizonYears !== undefined ? { horizonYears: rates.horizonYears } : {}),
    ...(rates.discountRatePct !== undefined ? { discountRatePct: rates.discountRatePct } : {}),
  });
  const candidate = candidates.find((c) => c.key === key);
  if (!candidate) notFound();
  const payload = scenarioSchema.parse(candidateToPayload(candidate.input, candidate.label));
  const scenario = await createScenario(db, organization.id, portfolioId, payload, valuationDate);
  redirect(`/scenarios/${scenario.id}`);
}
