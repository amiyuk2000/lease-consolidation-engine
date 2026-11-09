# CLAUDE.md

Project instructions for the lease consolidation scenario engine.

## What this is

A web app that lets a corporate real estate or workplace lead model what happens to a multi-site office portfolio under different consolidation strategies, and compare them against doing nothing.

The core question it answers is not "how much space is surplus" — that is arithmetic. It is "which surplus can I actually act on, what does acting cost up front, and does that pay back before the lease would have expired anyway."

Most footprint tools skip the second half. This one must not.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind for styling
- PostgreSQL. Production: Vercel's Postgres (Neon) via `DATABASE_URL`. Local dev and tests: PGlite, an embedded Postgres in `./.pglite`, used automatically when `DATABASE_URL` is unset.
- Auth written in the app (`lib/auth/`): scrypt password hashes, server-side sessions with SHA-256-hashed tokens in an httpOnly cookie, and a one-click guest login for the demo. No third-party auth service.
- Drizzle ORM
- Zod for all input validation at API and form boundaries
- Recharts for charts
- Vitest for unit tests, Playwright for end-to-end
- Deployed on Vercel; every PR gets a preview deploy

## Commands

```
npm run dev          # local dev server
npm run test         # vitest
npm run test:e2e     # playwright
npm run db:generate  # drizzle migration from schema changes
npm run db:push      # apply migrations and reload benchmarks (runs before dev and build)
npm run lint
npm run typecheck
```

Run `npm run typecheck && npm run test` before saying any task is finished.

## Domain glossary

Use these terms exactly. Do not substitute American or generic equivalents.

- **Rentable area** — the area the tenant pays for, including a share of common areas. All rent calculations use rentable area. Usable area is what the tenant occupies; the ratio between them is the load factor or gross-up, typically 1.10–1.20.
- **Net rent** (also base rent) — the landlord's rent, $/sq ft/year.
- **Additional rent** — operating costs plus realty taxes, $/sq ft/year. Escalates separately from net rent and is usually reconciled annually against actuals.
- **Gross rent** — net rent + additional rent. Never hard-code the two as one figure.
- **Step rent / escalation** — scheduled increases in net rent over the term.
- **Free rent / abatement** — months of rent forgiven, usually at the start of a term.
- **TI allowance** — tenant improvement money the landlord contributes to fit-out.
- **Make-good / restoration** — the tenant's obligation to return the space to a defined condition at expiry. A real and frequently underestimated cost of exit.
- **Break option / early termination** — a contractual right to end the lease early, usually with notice and a penalty. Treat as an expiry date for actionability purposes.
- **Partial surrender** — handing back part of the premises mid-term, by agreement.
- **Sublet** — the tenant lets space to a third party while remaining liable under the head lease. Assignment transfers the lease entirely.
- **Blend and extend** — renegotiating rent downward now in exchange for a longer term.
- **Peak attendance** — the busiest day of a normal week, as a percentage of people assigned to the site. Not the average. Average attendance systematically undersizes a workplace and must never be used as the planning basis.
- **Density** — rentable sq ft per peak occupant. The planning variable.

## Scenario engine

Every scenario is evaluated over a horizon (default 10 years) against a baseline.

### Baseline (always computed, always shown)

Do nothing. Hold all sites, renew each at expiry at the market rent for its segment, apply escalations. Every other scenario is reported as a delta against this, never as an absolute saving.

### Scenario types

- **Densify in place** — reduce area per occupant at an existing site without changing the lease. Saves nothing on rent. Models the fit-out cost and the operational consequences only. Include it because it is often what actually happens.
- **Partial surrender at expiry** — renew a smaller footprint at expiry.
- **Partial surrender mid-term** — by agreement, with a surrender premium.
- **Sublet surplus** — tenant remains liable; model void period, sublet rent at a discount to passing rent, and the possibility of no taker.
- **Close and absorb** — exit a site entirely, move its people into named receiving sites. Must check receiving capacity.
- **Blend and extend** — lower rent now, longer term. Model the full term cost, not the headline rent reduction.
- **Relocate and consolidate** — exit two or more sites into one new lease.

### Required inputs per scenario

Sites affected, effective date, target density, receiving sites and their available capacity, and the one-time cost assumptions below.

### One-time costs — never omit these

A consolidation that ignores these looks free and is not. Every scenario that changes the physical estate must account for:

- Make-good / restoration on space being released
- Fit-out of receiving space, net of any TI allowance
- Moving, IT, furniture, signage
- Surrender premium or early termination penalty
- Double-running rent during any overlap between new and old premises
- Professional fees (broker, project management, legal) — default 6% of the above
- Business disruption, if the user supplies an estimate; never invent one

### Outputs per scenario

- Annual occupancy cost, by year, over the horizon
- Cumulative delta vs baseline, by year
- Total one-time cost
- Net present value of the delta, discounted at `discount_rate` (default 8% nominal)
- Payback period in months, or "does not pay back within horizon"
- Area released, and area per peak occupant after the change
- A constraints report: anything the scenario violates

## Calculation rules

Be precise about these. They are the product.

```
peak_occupants      = round(headcount × peak_attendance_pct / 100)
required_area       = peak_occupants × target_density
surplus_area        = rentable_area − required_area
gross_rent_psf      = net_rent_psf + additional_rent_psf
annual_cost(year)   = rentable_area × gross_rent_psf(year)
```

- Escalate net rent and additional rent separately, each at its own rate.
- Apply free rent as a reduction in the year it falls, not amortised.
- `months_to_action` is months to lease expiry, or to a break option if one exists and its notice period can still be met. Whichever is sooner.
- A surplus is actionable only if `months_to_action <= horizon_months` or the scenario uses a mid-term mechanism (surrender, sublet, blend and extend).
- Never round in intermediate calculations. Round only at display.
- All figures are CAD. State the currency in every exported output.
- If a site's segment has no market rent benchmark, the baseline cost after that lease's expiry is unknown (null), and so are every delta, NPV and payback that depend on it. Show "unknown", never carry the passing rent forward.

### Engine conventions (decided; change only deliberately)

- Month granularity. Month 0 is the month containing the valuation date. Rent is payable through the end of the month containing a lease end date.
- Escalations step every 12 months from the valuation date (from commencement for new leases, from renewal for market renewals). Additional rent does not reset on renewal.
- Free rent abates net rent only; additional rent is still payable.
- Double-running rent is reported as a one-time cost, not in annual occupancy cost; it is counted once.
- NPV discounts each month's flow from the end of that month: (1 + r)^((m + 1) / 12).
- Payback is undiscounted, in months from the first month the cumulative position goes negative.
- A break option is usable if the break date is before expiry and its notice deadline (break date minus notice months) has not passed.

## Workplace experience

Every option also reports the employee experience of the workplace it leaves behind: what it is like to come in once the change is made (`lib/engine/experience.ts`). Six indicators, scored against the portfolio's own workplace brief:

- **Room on the busiest day** — workstations vs peak occupants
- **Space to focus** — peak occupants per focus room
- **Confidential meetings** — peak occupants per confidential room
- **Variety and choice** — how many of four space types exist (focus, confidential, collaboration, social)
- **An office with a purpose** — each purpose in the brief has at least one space of its type
- **Busy and quiet days** — busiest-day fullness minus quietest-day fullness, against workstations

Rules:

- Do not quote or cite outside articles in the app or docs. Sq ft per peak occupant is shown, not scored. The targets are the user's brief.
- A space-mix field left blank is unknown, never zero. A null target is not scored.
- When space is given back, each count is assumed to shrink with the area kept, to the nearest whole space, and the output says it is an assumption. A densified site keeps today's mix, flagged as changing with the fit-out. New premises are unknown until a test-fit.
- The scorecard measures what the workplace provides, not how people feel. Never estimate survey results.

## Constraints the engine must enforce

Return these as a structured constraints report, never as a silent clamp:

- A receiving site cannot exceed its own rentable area at the target density.
- Space cannot be released mid-term without a named mechanism (surrender, sublet, assignment, break option). If none exists, the scenario is infeasible, and it must say so rather than quietly assume an exit.
- Sublet scenarios carry a void risk. Default to a 9-month void. Flag the sublet market as thin using the sublet share of vacant space from the benchmarks table (`sublet_share_pct`), citing its source and period. The figure is data, not code: never hard-code it in the engine or UI. Seed row: Canada, all office, 2026-Q3, 10.4% sublet share, 15.6% vacancy, source Cushman & Wakefield Canada Office MarketBeat (https://www.cushmanwakefield.com/en/canada/insights/canada-marketbeats/office-marketbeats). If no row exists, say sublet demand is unknown.
- If density falls below 120 sq ft per peak occupant, flag the operational load on HVAC, washrooms, lifts and cleaning. Do not block it; flag it.

## Data model

Every table holding client data carries `organization_id`. Tenant isolation is enforced in `lib/data/repo.ts`: every function takes the caller's organization id and scopes every query to it, and writes check that every referenced portfolio and site belongs to that organization. Pages and actions never query client tables directly. Any new table or query gets an isolation test in `lib/data/__tests__/repo.test.ts` in the same change.

Auth tables: `users` (email, name, password_hash, is_guest), `sessions` (hashed token, user, expiry). Every new organization, including a demo guest's, gets its own copy of the invented sample portfolio (`lib/db/sample-portfolio.ts`).

- `organizations`
- `memberships` (user, organization, role)
- `portfolios` (organization_id, experience_standards jsonb: the workplace brief, null until set)
- `sites` (portfolio_id, name, city, segment, rentable_area, usable_area, headcount, peak_attendance_pct, net_rent_psf, additional_rent_psf, net_escalation_pct, additional_escalation_pct, lease_start, lease_expiry, break_date, break_notice_months, make_good_psf, workstations, focus_rooms, confidential_rooms, collaboration_spaces, social_spaces, quietest_attendance_pct — the last six optional, null meaning not recorded)
- `scenarios` (portfolio_id, type, horizon_years, discount_rate, target_density, effective_date, assumptions jsonb)
- `scenario_sites` (scenario_id, site_id, action, receiving_site_id)
- `benchmarks` (segment, market, period, vacancy_pct, net_rent_psf, sublet_share_pct, source, source_url)

## Hard rules

- **Never invent market data.** Vacancy rates, market rents and absorption figures come from the benchmarks table only, and every row carries its source and period. If a benchmark for a segment is missing, return null and say so in the UI. Do not interpolate, estimate, or fill from training knowledge.
- **Never put real client lease data in fixtures, seeds, tests or example portfolios.** Commercial lease terms are frequently confidential between tenant and landlord. All sample data is clearly invented and labelled as such in the UI.
- **Always show the baseline.** A scenario result without the cost of doing nothing beside it is not a result.
- **Always show assumptions with outputs.** Discount rate, escalations, density target, void period, horizon. Every exported view carries them.
- **Never present an estimate as a fact.** Anything derived from a default rather than user input is labelled as a default in the output.
- **Infeasible is a valid answer.** If the lease does not permit the action, say so. Do not produce a number that implies it does.

## Code conventions

- Calculation logic lives in `lib/engine/`, is pure, takes explicit inputs and returns explicit outputs. No database access, no dates from `new Date()` inside it — pass the valuation date in. This is what makes it testable and auditable.
- Money and area use the `Decimal` from `lib/engine/decimal.ts` (decimal.js, 40 significant digits). Integer cents are not used because the no-intermediate-rounding rule produces fractional cents. Never float arithmetic on currency.
- Zod schemas in `lib/schemas/`, shared between the form and the API route.
- Server components by default; client components only where there is interaction.
- No `any`. If the type is genuinely unknown, use `unknown` and narrow it.

## Testing

- Every function in `lib/engine/` has unit tests, including the boundary cases: zero headcount, a lease already expired, a break option whose notice window has passed, a receiving site with no spare capacity, negative surplus.
- At least one worked example per scenario type, with the arithmetic checked by hand and the expected values written as literals in the test — not computed by the same code under test.
- End-to-end: sign in, create a portfolio, add two sites, run a close-and-absorb scenario, see the constraints report.

## Out of scope for the MVP

Do not build these without being asked: imports from Excel or CMMS, lease abstraction from documents, badge or sensor integrations, multi-currency, capital accounting or IFRS 16 treatment, forecasting headcount, PDF export, an admin console.
