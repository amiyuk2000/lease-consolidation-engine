import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const orgId = () =>
  uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" });

// Rates and money are numeric so Postgres never stores a float; Drizzle returns them as strings.
const money = (name: string) => numeric(name, { precision: 14, scale: 4 });
const area = (name: string) => numeric(name, { precision: 14, scale: 2 });
const pct = (name: string) => numeric(name, { precision: 7, scale: 3 });

export const users = pgTable("users", {
  id: id(),
  email: text("email").unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  isGuest: boolean("is_guest").notNull().default(false),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the session token; the token itself is only ever in the cookie. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    organizationId: orgId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "member"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("memberships_org_user_idx").on(t.organizationId, t.userId)],
);

export const portfolios = pgTable(
  "portfolios",
  {
    id: id(),
    organizationId: orgId(),
    name: text("name").notNull(),
    /** Invented sample data; the UI labels it as such. */
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("portfolios_org_idx").on(t.organizationId)],
);

export const sites = pgTable(
  "sites",
  {
    id: id(),
    organizationId: orgId(),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    city: text("city").notNull(),
    segment: text("segment").notNull(),
    rentableArea: area("rentable_area").notNull(),
    usableArea: area("usable_area").notNull(),
    headcount: integer("headcount").notNull(),
    peakAttendancePct: pct("peak_attendance_pct").notNull(),
    netRentPsf: money("net_rent_psf").notNull(),
    additionalRentPsf: money("additional_rent_psf").notNull(),
    netEscalationPct: pct("net_escalation_pct").notNull(),
    additionalEscalationPct: pct("additional_escalation_pct").notNull(),
    leaseStart: date("lease_start").notNull(),
    leaseExpiry: date("lease_expiry").notNull(),
    breakDate: date("break_date"),
    breakNoticeMonths: integer("break_notice_months"),
    makeGoodPsf: money("make_good_psf").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sites_org_idx").on(t.organizationId), index("sites_portfolio_idx").on(t.portfolioId)],
);

export const scenarios = pgTable(
  "scenarios",
  {
    id: id(),
    organizationId: orgId(),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type", {
      enum: [
        "densify_in_place",
        "partial_surrender_at_expiry",
        "partial_surrender_mid_term",
        "sublet_surplus",
        "close_and_absorb",
        "blend_and_extend",
        "relocate_and_consolidate",
      ],
    }).notNull(),
    /** Null means the engine default applies; the result labels it as a default. */
    horizonYears: integer("horizon_years"),
    discountRate: pct("discount_rate"),
    targetDensity: area("target_density").notNull(),
    valuationDate: date("valuation_date").notNull(),
    effectiveDate: date("effective_date").notNull(),
    /** Type-specific parameters and one-time costs, validated by lib/schemas/scenario.ts. */
    assumptions: jsonb("assumptions").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("scenarios_org_idx").on(t.organizationId), index("scenarios_portfolio_idx").on(t.portfolioId)],
);

export const scenarioSites = pgTable(
  "scenario_sites",
  {
    id: id(),
    organizationId: orgId(),
    scenarioId: uuid("scenario_id")
      .notNull()
      .references(() => scenarios.id, { onDelete: "cascade" }),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    action: text("action", { enum: ["subject", "exit", "receive"] }).notNull(),
    receivingSiteId: uuid("receiving_site_id").references(() => sites.id, { onDelete: "cascade" }),
    /** Headcount moved, for receiving sites. */
    headcount: integer("headcount"),
    /** Exit mechanism, for exiting sites. */
    exitMechanism: text("exit_mechanism", { enum: ["expiry", "break_option", "surrender", "assignment", "none"] }),
  },
  (t) => [index("scenario_sites_scenario_idx").on(t.scenarioId)],
);

/** Market data. Not client data: shared, read-only, and every row cites its source. */
export const benchmarks = pgTable("benchmarks", {
  id: id(),
  segment: text("segment").notNull(),
  market: text("market").notNull(),
  period: text("period").notNull(),
  vacancyPct: pct("vacancy_pct"),
  netRentPsf: money("net_rent_psf"),
  subletSharePct: pct("sublet_share_pct"),
  source: text("source").notNull(),
  sourceUrl: text("source_url").notNull(),
});
