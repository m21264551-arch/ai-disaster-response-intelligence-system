import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("horizon-specific scores, reveal clearing, and missing coverage", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Reveal observed outcomes", exact: true })
    .click();
  await page.getByLabel("Metric matching").waitFor();
  await page.getByLabel("Show cells").selectOption("miss");
  await page
    .getByRole("button", { name: "Inspect cell", exact: false })
    .first()
    .click();
  await page.getByLabel("Forecast horizon").selectOption("48");
  await page
    .getByRole("button", { name: "Reveal observed outcomes", exact: true })
    .waitFor();
  await expect(page.getByLabel("Metric matching")).toHaveCount(0);
  await expect(page.locator(".cell-details")).toContainText("+48h");
  const row = page
    .getByRole("row")
    .filter({
      has: page
        .getByRole("button", { name: "Inspect cell", exact: false })
        .first(),
    });
  const score = await row.getByRole("cell").first().textContent();
  await expect(page.locator(".cell-details")).toContainText(score!);
  await page.getByLabel("Historical cutoff").selectOption("8");
  await expect(
    page.getByRole("heading", { name: "Observation coverage unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reveal observed outcomes", exact: true }),
  ).toHaveCount(0);
});
test("an older frame response cannot overwrite a new horizon", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Reveal observed outcomes", exact: true })
    .waitFor();
  await page.route("**/api/dashboard/frame", async (route) => {
    const body = route.request().postDataJSON();
    const response = await route.fetch();
    if (body.frame_id.endsWith("-48"))
      await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({ response }).catch(() => {});
  });
  await page.getByLabel("Forecast horizon").selectOption("48");
  await page.getByLabel("Forecast horizon").selectOption("72");
  await expect(page.locator(".cell-details")).toContainText("+72h");
  await page.waitForTimeout(850);
  await expect(page.locator(".cell-details")).toContainText("+72h");
  await expect(page.locator(".map-heading")).toContainText("+72h");
});
test("a reveal started before a cutoff change cannot reappear", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Reveal observed outcomes", exact: true })
    .waitFor();
  await page.route("**/api/reveal", async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({ response }).catch(() => {});
  });
  await page
    .getByRole("button", { name: "Reveal observed outcomes", exact: true })
    .click();
  await page.getByLabel("Historical cutoff").selectOption("1");
  await page
    .getByRole("button", { name: "Reveal observed outcomes", exact: true })
    .waitFor();
  await page.waitForTimeout(850);
  await expect(page.getByLabel("Metric matching")).toHaveCount(0);
});
test("unavailable model does not substitute a fixture", async ({ page }) => {
  await page.route("**/api/v2/study", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"detail":"Unavailable"}',
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Reload study" }),
  ).toBeVisible();
  await expect(page.locator(".forecast-map")).toHaveCount(0);
});
for (const width of [1440, 390])
  test(`replay accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Reveal observed outcomes", exact: true })
      .waitFor();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Evaluation & calibration" })
      .click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
