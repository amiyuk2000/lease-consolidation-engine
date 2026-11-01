import { migrate } from "drizzle-orm/pglite/migrator";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import type { Db } from "@/lib/db/connect";
import * as schema from "@/lib/db/schema";
import { SAMPLE_SITES } from "@/lib/db/sample-portfolio";
import type { ScenarioPayload } from "@/lib/schemas/scenario";
import {
  NotInOrganizationError,
  createScenario,
  createSite,
  getPortfolio,
  getScenario,
  listPortfolios,
  listScenarios,
  listSites,
  provisionUser,
  updateSite,
} from "../repo";

let db: Db;
let orgA: Awaited<ReturnType<typeof provisionUser>>;
let orgB: Awaited<ReturnType<typeof provisionUser>>;

beforeAll(async () => {
  const pglite = drizzle("memory://", { schema });
  await migrate(pglite as unknown as PgliteDatabase, { migrationsFolder: "./drizzle" });
  db = pglite;
  orgA = await provisionUser(db, { name: "A", email: "a@example.invalid", passwordHash: null, isGuest: false }, "Org A");
  orgB = await provisionUser(db, { name: "B", email: "b@example.invalid", passwordHash: null, isGuest: false }, "Org B");
}, 60_000);

const densify = (siteId: string): ScenarioPayload => ({
  type: "densify_in_place",
  name: "Densify",
  siteId,
  effectiveDate: "2027-01-01",
  targetDensity: "150",
  horizonYears: undefined,
  discountRatePct: undefined,
  oneTimeCosts: {
    fitOut: undefined,
    tiAllowance: undefined,
    moving: undefined,
    it: undefined,
    furniture: undefined,
    signage: undefined,
    surrenderPremium: undefined,
    terminationPenalty: undefined,
    businessDisruption: undefined,
    professionalFeesPct: undefined,
  },
});

describe("provisioning", () => {
  it("gives each new organization its own copy of the sample portfolio", async () => {
    const portfolios = await listPortfolios(db, orgA.organizationId);
    expect(portfolios).toHaveLength(1);
    expect(portfolios[0]?.isSample).toBe(true);
    expect(await listSites(db, orgA.organizationId, orgA.samplePortfolioId)).toHaveLength(SAMPLE_SITES.length);
  });
});

describe("tenant isolation", () => {
  it("cannot read another organization's portfolio or sites", async () => {
    expect(await getPortfolio(db, orgB.organizationId, orgA.samplePortfolioId)).toBeNull();
    expect(await listSites(db, orgB.organizationId, orgA.samplePortfolioId)).toEqual([]);
  });

  it("cannot add a site to another organization's portfolio", async () => {
    const values = { ...SAMPLE_SITES[0]!, segment: "Central Class A" as const, breakDate: undefined, breakNoticeMonths: undefined };
    await expect(createSite(db, orgB.organizationId, orgA.samplePortfolioId, values)).rejects.toBeInstanceOf(NotInOrganizationError);
  });

  it("lets an organization edit its own site, keeps the name, and blocks other organizations", async () => {
    const [site] = await listSites(db, orgA.organizationId, orgA.samplePortfolioId);
    const { name: _name, ...rest } = SAMPLE_SITES[0]!;
    const values = { ...rest, segment: "Central Class A" as const, headcount: 999, breakDate: undefined, breakNoticeMonths: undefined };
    expect(await updateSite(db, orgB.organizationId, site!.id, values)).toBe(false);
    expect((await listSites(db, orgA.organizationId, orgA.samplePortfolioId)).find((s) => s.id === site!.id)?.headcount).not.toBe(999);
    expect(await updateSite(db, orgA.organizationId, site!.id, values)).toBe(true);
    const updated = (await listSites(db, orgA.organizationId, orgA.samplePortfolioId)).find((s) => s.id === site!.id);
    expect(updated?.headcount).toBe(999);
    expect(updated?.name).toBe(site!.name);
  });

  it("cannot build a scenario on another organization's site", async () => {
    const [siteOfA] = await listSites(db, orgA.organizationId, orgA.samplePortfolioId);
    await expect(
      createScenario(db, orgB.organizationId, orgB.samplePortfolioId, densify(siteOfA!.id), "2027-01-01"),
    ).rejects.toBeInstanceOf(NotInOrganizationError);
  });

  it("cannot read another organization's scenario", async () => {
    const [siteOfA] = await listSites(db, orgA.organizationId, orgA.samplePortfolioId);
    const scenario = await createScenario(db, orgA.organizationId, orgA.samplePortfolioId, densify(siteOfA!.id), "2027-01-01");
    expect(await getScenario(db, orgA.organizationId, scenario.id)).not.toBeNull();
    expect(await getScenario(db, orgB.organizationId, scenario.id)).toBeNull();
    expect(await listScenarios(db, orgB.organizationId, orgA.samplePortfolioId)).toEqual([]);
  });
});

describe("passwords", () => {
  it("verifies the right password only", async () => {
    const hash = await hashPassword("correct horse");
    expect(hash).not.toContain("correct horse");
    expect(await verifyPassword("correct horse", hash)).toBe(true);
    expect(await verifyPassword("wrong horse", hash)).toBe(false);
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
  });
});
