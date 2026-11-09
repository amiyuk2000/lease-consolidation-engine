/**
 * All reads and writes of client data. Every function takes the caller's
 * organization id and scopes every query to it: this is where tenant
 * isolation is enforced. Pages and actions never query client tables directly.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/connect";
import {
  benchmarks,
  memberships,
  organizations,
  portfolios,
  scenarioSites,
  scenarios,
  sites,
  users,
} from "@/lib/db/schema";
import { SAMPLE_PORTFOLIO_NAME, SAMPLE_SITES, SAMPLE_STANDARDS } from "@/lib/db/sample-portfolio";
import type { Benchmark, SiteInput } from "@/lib/engine";
import type { ExperienceStandardsValues } from "@/lib/schemas/experience";
import { referencedSiteIds, type ScenarioPayload } from "@/lib/schemas/scenario";
import type { SiteFormValues, SiteUpdateValues } from "@/lib/schemas/site";

export class NotInOrganizationError extends Error {
  constructor(what: string) {
    super(`${what} does not belong to this organization`);
  }
}

/** New user, their organization, owner membership and a copy of the sample portfolio. */
export async function provisionUser(
  db: Db,
  user: { name: string; email: string | null; passwordHash: string | null; isGuest: boolean },
  organizationName: string,
): Promise<{ userId: string; organizationId: string; samplePortfolioId: string }> {
  return db.transaction(async (tx) => {
    const [u] = await tx.insert(users).values(user).returning({ id: users.id });
    const [org] = await tx.insert(organizations).values({ name: organizationName }).returning({ id: organizations.id });
    if (!u || !org) throw new Error("Could not create account");
    await tx.insert(memberships).values({ organizationId: org.id, userId: u.id, role: "owner" });
    const [portfolio] = await tx
      .insert(portfolios)
      .values({ organizationId: org.id, name: SAMPLE_PORTFOLIO_NAME, isSample: true, experienceStandards: SAMPLE_STANDARDS })
      .returning({ id: portfolios.id });
    if (!portfolio) throw new Error("Could not create sample portfolio");
    await tx.insert(sites).values(SAMPLE_SITES.map((s) => ({ ...s, organizationId: org.id, portfolioId: portfolio.id })));
    return { userId: u.id, organizationId: org.id, samplePortfolioId: portfolio.id };
  });
}

export async function findUserByEmail(db: Db, email: string) {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row ?? null;
}

export async function listPortfolios(db: Db, orgId: string) {
  return db.select().from(portfolios).where(eq(portfolios.organizationId, orgId)).orderBy(desc(portfolios.isSample), asc(portfolios.createdAt));
}

export async function getPortfolio(db: Db, orgId: string, portfolioId: string) {
  const [row] = await db
    .select()
    .from(portfolios)
    .where(and(eq(portfolios.organizationId, orgId), eq(portfolios.id, portfolioId)))
    .limit(1);
  return row ?? null;
}

export async function createPortfolio(db: Db, orgId: string, name: string) {
  const [row] = await db.insert(portfolios).values({ organizationId: orgId, name }).returning();
  if (!row) throw new Error("Could not create portfolio");
  return row;
}

/** Saves a portfolio's workplace brief. Returns false if the portfolio is not this organization's. */
export async function updateExperienceStandards(
  db: Db,
  orgId: string,
  portfolioId: string,
  standards: ExperienceStandardsValues,
): Promise<boolean> {
  const rows = await db
    .update(portfolios)
    .set({ experienceStandards: standards })
    .where(and(eq(portfolios.organizationId, orgId), eq(portfolios.id, portfolioId)))
    .returning({ id: portfolios.id });
  return rows.length === 1;
}

export async function deletePortfolio(db: Db, orgId: string, portfolioId: string) {
  await db.delete(portfolios).where(and(eq(portfolios.organizationId, orgId), eq(portfolios.id, portfolioId)));
}

export async function listSites(db: Db, orgId: string, portfolioId: string) {
  return db
    .select()
    .from(sites)
    .where(and(eq(sites.organizationId, orgId), eq(sites.portfolioId, portfolioId)))
    .orderBy(asc(sites.createdAt), asc(sites.name));
}

export async function createSite(db: Db, orgId: string, portfolioId: string, values: SiteFormValues) {
  if (!(await getPortfolio(db, orgId, portfolioId))) throw new NotInOrganizationError("Portfolio");
  const [row] = await db
    .insert(sites)
    .values({
      ...values,
      ...optionalSiteColumns(values),
      organizationId: orgId,
      portfolioId,
    })
    .returning();
  if (!row) throw new Error("Could not create site");
  return row;
}

/** Updates a site's lease and occupancy terms. The name is not editable. Returns false if the site is not this organization's. */
export async function updateSite(db: Db, orgId: string, siteId: string, values: SiteUpdateValues): Promise<boolean> {
  const rows = await db
    .update(sites)
    .set({ ...values, ...optionalSiteColumns(values) })
    .where(and(eq(sites.organizationId, orgId), eq(sites.id, siteId)))
    .returning({ id: sites.id });
  return rows.length === 1;
}

/** Blank optional fields are stored as null, so an edit can clear them. */
function optionalSiteColumns(values: SiteUpdateValues) {
  return {
    breakDate: values.breakDate ?? null,
    breakNoticeMonths: values.breakNoticeMonths ?? null,
    workstations: values.workstations ?? null,
    focusRooms: values.focusRooms ?? null,
    confidentialRooms: values.confidentialRooms ?? null,
    collaborationSpaces: values.collaborationSpaces ?? null,
    socialSpaces: values.socialSpaces ?? null,
    quietestAttendancePct: values.quietestAttendancePct ?? null,
  };
}

export async function deleteSite(db: Db, orgId: string, siteId: string) {
  await db.delete(sites).where(and(eq(sites.organizationId, orgId), eq(sites.id, siteId)));
}

export async function listScenarios(db: Db, orgId: string, portfolioId: string) {
  return db
    .select()
    .from(scenarios)
    .where(and(eq(scenarios.organizationId, orgId), eq(scenarios.portfolioId, portfolioId)))
    .orderBy(desc(scenarios.createdAt));
}

export async function getScenario(db: Db, orgId: string, scenarioId: string) {
  const [row] = await db
    .select()
    .from(scenarios)
    .where(and(eq(scenarios.organizationId, orgId), eq(scenarios.id, scenarioId)))
    .limit(1);
  return row ?? null;
}

export async function createScenario(
  db: Db,
  orgId: string,
  portfolioId: string,
  payload: ScenarioPayload,
  valuationDate: string,
) {
  if (!(await getPortfolio(db, orgId, portfolioId))) throw new NotInOrganizationError("Portfolio");
  const ids = [...new Set(referencedSiteIds(payload))];
  const owned = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.organizationId, orgId), eq(sites.portfolioId, portfolioId), inArray(sites.id, ids)));
  if (owned.length !== ids.length) throw new NotInOrganizationError("A site in this scenario");

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(scenarios)
      .values({
        organizationId: orgId,
        portfolioId,
        name: payload.name,
        type: payload.type,
        horizonYears: payload.horizonYears ?? null,
        discountRate: payload.discountRatePct ?? null,
        targetDensity: payload.targetDensity,
        valuationDate,
        effectiveDate: payload.effectiveDate,
        assumptions: payload,
      })
      .returning();
    if (!row) throw new Error("Could not create scenario");
    const links = scenarioSiteRows(payload).map((l) => ({ ...l, organizationId: orgId, scenarioId: row.id }));
    if (links.length > 0) await tx.insert(scenarioSites).values(links);
    return row;
  });
}

export async function deleteScenario(db: Db, orgId: string, scenarioId: string) {
  await db.delete(scenarios).where(and(eq(scenarios.organizationId, orgId), eq(scenarios.id, scenarioId)));
}

export async function listBenchmarks(db: Db): Promise<Benchmark[]> {
  return db.select().from(benchmarks).orderBy(asc(benchmarks.segment));
}

export function toSiteInput(row: typeof sites.$inferSelect): SiteInput {
  const spaceMix = [row.workstations, row.focusRooms, row.confidentialRooms, row.collaborationSpaces, row.socialSpaces];
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    segment: row.segment,
    rentableArea: row.rentableArea,
    usableArea: row.usableArea,
    headcount: row.headcount,
    peakAttendancePct: row.peakAttendancePct,
    netRentPsf: row.netRentPsf,
    additionalRentPsf: row.additionalRentPsf,
    netEscalationPct: row.netEscalationPct,
    additionalEscalationPct: row.additionalEscalationPct,
    leaseStart: row.leaseStart,
    leaseExpiry: row.leaseExpiry,
    breakDate: row.breakDate,
    breakNoticeMonths: row.breakNoticeMonths,
    makeGoodPsf: row.makeGoodPsf,
    quietestAttendancePct: row.quietestAttendancePct,
    ...(spaceMix.some((n) => n !== null)
      ? {
          spaceMix: {
            workstations: row.workstations,
            focusRooms: row.focusRooms,
            confidentialRooms: row.confidentialRooms,
            collaborationSpaces: row.collaborationSpaces,
            socialSpaces: row.socialSpaces,
          },
        }
      : {}),
  };
}

function scenarioSiteRows(p: ScenarioPayload): Array<Omit<typeof scenarioSites.$inferInsert, "organizationId" | "scenarioId">> {
  switch (p.type) {
    case "close_and_absorb":
      return [
        { siteId: p.siteId, action: "exit", exitMechanism: p.exitMechanism },
        ...p.allocations.map((a) => ({
          siteId: a.receivingSiteId,
          action: "receive" as const,
          receivingSiteId: a.receivingSiteId,
          headcount: a.headcount,
        })),
      ];
    case "relocate_and_consolidate":
      return p.exits.map((e) => ({ siteId: e.siteId, action: "exit" as const, exitMechanism: e.exitMechanism }));
    default:
      return [{ siteId: p.siteId, action: "subject" }];
  }
}
