import { expect, test, type Page } from "@playwright/test";

// Invented test data.
async function addSite(page: Page, site: Record<string, string>) {
  await page.getByRole("button", { name: "Add a site" }).click();
  for (const [label, value] of Object.entries(site)) {
    await page.getByLabel(label, { exact: true }).fill(value);
  }
  await page.getByRole("button", { name: "Save site" }).click();
  await expect(page.getByText(site["Site name"] ?? "", { exact: true })).toBeVisible();
}

const lease = {
  "Usable area (sq ft)": "8000",
  "Net rent ($/sq ft/yr)": "30",
  "Additional rent ($/sq ft/yr)": "20",
  "Net rent escalation (%/yr)": "2",
  "Additional rent escalation (%/yr)": "3",
  "Lease start": "2020-01-01",
  "Lease expiry": "2030-12-31",
  "Make-good ($/sq ft)": "10",
};

test("sign up, build a portfolio, run close and absorb, see the constraints report", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("E2E Tester");
  await page.getByLabel("Organization").fill("E2E Org");
  await page.getByLabel("Email").fill(`e2e-${Date.now()}@example.invalid`);
  await page.getByLabel("Password").fill("a-long-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Portfolios" })).toBeVisible();

  await page.getByLabel("New portfolio").fill("E2E portfolio");
  await page.getByRole("button", { name: "Create portfolio" }).click();
  await expect(page.getByRole("heading", { name: "E2E portfolio" })).toBeVisible();

  await addSite(page, {
    "Site name": "Alpha (test)",
    City: "Toronto",
    "Rentable area (sq ft)": "10000",
    "Headcount": "100",
    "Peak attendance (%)": "60",
    ...lease,
  });
  // Beta is full at the target density: 60 peak occupants × 150 = 9,000 sq ft.
  await addSite(page, {
    "Site name": "Beta (test)",
    City: "Toronto",
    "Rentable area (sq ft)": "9000",
    "Headcount": "60",
    "Peak attendance (%)": "100",
    ...lease,
  });

  await page.getByRole("link", { name: "Model a real offer" }).first().click();
  // Defaults: close the smallest site (Beta) into the largest (Alpha). Alpha holds 66 at 150 sq ft; 60 + 60 do not fit.
  await expect(page.getByText("Close and absorb").first()).toBeVisible();
  await page.getByRole("button", { name: "Run scenario" }).click();

  await expect(page.getByRole("heading", { name: "Constraints report" })).toBeVisible();
  await expect(page.getByText("Infeasible", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Alpha \(test\) can hold 66 peak occupants/)).toBeVisible();
  await expect(page.getByText("The leases do not permit this scenario as set up.")).toBeVisible();
});

test("the demo ranks options and opens one as a full analysis", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo, no sign-up" }).click();
  await page.getByRole("link", { name: "Rank my options" }).first().click();
  await expect(page.getByText("Sample cost rates (invented).")).toBeVisible();
  await expect(page.getByRole("heading", { name: /feasible option/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ruled out" })).toBeVisible();
  await page.getByRole("button", { name: "Open full analysis" }).first().click();
  await expect(page.getByRole("heading", { name: "Constraints report" })).toBeVisible();
  await expect(page.getByText("NPV of saving vs baseline")).toBeVisible();
});

test("a sample site can be edited, but not renamed", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo, no sign-up" }).click();
  await page.getByRole("link", { name: "Edit" }).first().click();
  await expect(page.getByText(/^Edit .*\(sample\)$/)).toBeVisible();
  await expect(page.getByLabel("Site name")).toHaveCount(0);
  // Bay Street: 300 people × 55% = 165 peak occupants.
  await page.getByLabel("Headcount").fill("300");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("300 × 55%")).toBeVisible();
  await expect(page.getByRole("cell", { name: /^165/ })).toBeVisible();
});

test("the demo button opens a sample portfolio and a feasible scenario runs", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo, no sign-up" }).click();
  await expect(page.getByText("Sample data.", { exact: false }).first()).toBeVisible();
  await page.getByRole("link", { name: "Model a real offer" }).first().click();
  await page.getByRole("button", { name: "Run scenario" }).click();
  await expect(page.getByRole("heading", { name: "Constraints report" })).toBeVisible();
  await expect(page.getByText("NPV of saving vs baseline")).toBeVisible();
  await expect(page.getByText("Feasible", { exact: true })).toBeVisible();
});
