"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireContext } from "@/lib/auth/session";
import {
  NotInOrganizationError,
  createPortfolio,
  createScenario,
  createSite,
  deletePortfolio,
  deleteScenario,
  deleteSite,
  updateSite,
} from "@/lib/data/repo";
import { db } from "@/lib/db";
import { fieldErrors } from "@/lib/schemas/common";
import { scenarioSchema } from "@/lib/schemas/scenario";
import { siteFieldNames, siteSchema, siteUpdateFieldNames, siteUpdateSchema } from "@/lib/schemas/site";
import { isUuid, todayIso } from "@/lib/today";
import type { FormState } from "./auth";

const portfolioNameSchema = z.object({ name: z.string().trim().min(1, "Name the portfolio").max(100) });

export async function createPortfolioAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { organization } = await requireContext();
  const parsed = portfolioNameSchema.safeParse({ name: String(formData.get("name") ?? "") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const portfolio = await createPortfolio(db, organization.id, parsed.data.name);
  redirect(`/portfolios/${portfolio.id}`);
}

export async function deletePortfolioAction(portfolioId: string): Promise<void> {
  const { organization } = await requireContext();
  if (isUuid(portfolioId)) await deletePortfolio(db, organization.id, portfolioId);
  redirect("/portfolios");
}

export async function createSiteAction(portfolioId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { organization } = await requireContext();
  const raw = Object.fromEntries(siteFieldNames.map((k) => [k, String(formData.get(k) ?? "")]));
  const parsed = siteSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };
  if (!isUuid(portfolioId)) return { errors: { _form: "Portfolio not found" }, values: raw };
  try {
    await createSite(db, organization.id, portfolioId, parsed.data);
  } catch (error) {
    if (error instanceof NotInOrganizationError) return { errors: { _form: "Portfolio not found" }, values: raw };
    throw error;
  }
  revalidatePath(`/portfolios/${portfolioId}`);
  return {};
}

/** Saves edits to a site. The name is never read from the form, so it cannot change. */
export async function updateSiteAction(portfolioId: string, siteId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { organization } = await requireContext();
  const raw = Object.fromEntries(siteUpdateFieldNames.map((k) => [k, String(formData.get(k) ?? "")]));
  const parsed = siteUpdateSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };
  if (!isUuid(siteId) || !(await updateSite(db, organization.id, siteId, parsed.data))) {
    return { errors: { _form: "Site not found" }, values: raw };
  }
  revalidatePath(`/portfolios/${portfolioId}`);
  redirect(`/portfolios/${portfolioId}`);
}

export async function deleteSiteAction(portfolioId: string, siteId: string): Promise<void> {
  const { organization } = await requireContext();
  if (isUuid(siteId)) await deleteSite(db, organization.id, siteId);
  revalidatePath(`/portfolios/${portfolioId}`);
}

export async function createScenarioAction(portfolioId: string, payload: unknown): Promise<FormState> {
  const { organization } = await requireContext();
  const parsed = scenarioSchema.safeParse(payload);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  if (!isUuid(portfolioId)) return { errors: { _form: "Portfolio not found" } };
  let scenarioId: string;
  try {
    const scenario = await createScenario(db, organization.id, portfolioId, parsed.data, todayIso());
    scenarioId = scenario.id;
  } catch (error) {
    if (error instanceof NotInOrganizationError) return { errors: { _form: "A site in this scenario is not in this portfolio" } };
    throw error;
  }
  redirect(`/scenarios/${scenarioId}`);
}

export async function deleteScenarioAction(portfolioId: string, scenarioId: string): Promise<void> {
  const { organization } = await requireContext();
  if (isUuid(scenarioId)) await deleteScenario(db, organization.id, scenarioId);
  redirect(`/portfolios/${portfolioId}`);
}
