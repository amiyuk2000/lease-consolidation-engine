import { migrate } from "drizzle-orm/pglite/migrator";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import type { Db } from "@/lib/db/connect";
import * as schema from "@/lib/db/schema";
import { SAMPLE_SITES, SAMPLE_STANDARDS } from "@/lib/db/sample-portfolio";
import { parseStoredStandards } from "@/lib/schemas/experience";
import type { ScenarioPayload } from "@/lib/schemas/scenario";
import type { SiteUpdateValues } from "@/lib/schemas/site";
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
  toSiteInput,
  updateExperienceStandards,
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

/** A sample site as the edit form submits it: no name, blanks as undefined. */
function formValues(overrides: Partial<SiteUpdateValues> = {}): SiteUpdateValues {
  const { name: _name, breakDate: _b, breakNoticeMonths: _n, workstations: _w, focusRooms: _f, confidentialRooms: _c, collaborationSpaces: _co, socialSpaces: _s, quietestAttendancePct: _q, ...rest } = SAMPLE_SITES[0]!;
  return { ...rest, segment: "Central Class A", ...overrides };
}

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
    const values = { ...formValues(), name: "Intruder site" };
    await expect(createSite(db, orgB.organizationId, orgA.samplePortfolioId, values)).rejects.toBeInstanceOf(NotInOrganizationError);
  });

  it("lets an organization edit its own site, keeps the name, and blocks other organizations", async () => {
    const [site] = await listSites(db, orgA.organizationId, orgA.samplePortfolioId);
    const values = formValues({ headcount: 999 });
    expect(await updateSite(db, orgB.organizationId, site!.id, values)).toBe(false);
    expect((await listSites(db, orgA.organizationId, orgA.samplePortfolioId)).find((s) => s.id === site!.id)?.headcount).not.toBe(999);
    expect(await updateSite(db, orgA.organizationId, site!.id, values)).toBe(true);
    const updated = (await listSites(db, orgA.organizationId, orgA.samplePortfolioId)).find((s) => s.id === site!.id);
    expect(updated?.headcount).toBe(999);
    expect(updated?.name).toBe(site!.name);
  });

  it("saves the workplace inventory, and an edit with blanks clears it to unknown", async () => {
    const site = (await listSites(db, orgA.organizationId, orgA.samplePortfolioId)).find((s) => s.name.startsWith("Mississauga"));
    expect(toSiteInput(site!).spaceMix).toEqual({ workstations: 140, focusRooms: 6, confidentialRooms: 3, collaborationSpaces: 5, socialSpaces: 1 });
    expect(toSiteInput(site!).quietestAttendancePct).toBe("15.000");

    expect(await updateSite(db, orgB.organizationId, site!.id, formValues())).toBe(false);
    expect(await updateSite(db, orgA.organizationId, site!.id, formValues({ focusRooms: 15 }))).toBe(true);
    const cleared = (await listSites(db, orgA.organizationId, orgA.samplePortfolioId)).find((s) => s.id === site!.id)!;
    expect(cleared.focusRooms).toBe(15);
    expect(cleared.workstations).toBeNull();
    expect(cleared.quietestAttendancePct).toBeNull();
  });

  it("gives the sample portfolio invented standards, and only its own organization can change them", async () => {
    expect(parseStoredStandards((await getPortfolio(db, orgA.organizationId, orgA.samplePortfolioId))?.experienceStandards)).toEqual(SAMPLE_STANDARDS);
    const changed = { ...SAMPLE_STANDARDS, maxPeoplePerFocusRoom: "8" };
    expect(await updateExperienceStandards(db, orgB.organizationId, orgA.samplePortfolioId, changed)).toBe(false);
    expect(parseStoredStandards((await getPortfolio(db, orgA.organizationId, orgA.samplePortfolioId))?.experienceStandards)?.maxPeoplePerFocusRoom).toBe("10");
    expect(await updateExperienceStandards(db, orgA.organizationId, orgA.samplePortfolioId, changed)).toBe(true);
    expect(parseStoredStandards((await getPortfolio(db, orgA.organizationId, orgA.samplePortfolioId))?.experienceStandards)?.maxPeoplePerFocusRoom).toBe("8");
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
