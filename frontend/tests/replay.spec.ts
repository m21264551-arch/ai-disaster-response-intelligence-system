import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("horizon-specific scores, reveal clearing, and missing coverage", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Show observations", exact: true })
    .click();
  await page.getByLabel("Metric matching").waitFor();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await page.getByLabel("Show cells").selectOption("miss");
  await page
    .getByRole("button", { name: "Inspect cell", exact: false })
    .first()
    .click();
  await page.getByLabel("Forecast horizon").selectOption("48");
  await page
    .getByRole("button", { name: "Show observations", exact: true })
    .waitFor();
  await expect(page.getByLabel("Metric matching")).toHaveCount(0);
  await expect(page.locator(".cell-details")).toContainText("+48h");
  const row = page.getByRole("row").filter({
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
    page.getByRole("button", { name: "Show observations", exact: true }),
  ).toHaveCount(0);
});
test("an older frame response cannot overwrite a new horizon", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Show observations", exact: true })
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
    .getByRole("button", { name: "Show observations", exact: true })
    .waitFor();
  await page.route("**/api/reveal", async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({ response }).catch(() => {});
  });
  await page
    .getByRole("button", { name: "Show observations", exact: true })
    .click();
  await page.getByLabel("Historical cutoff").selectOption("1");
  await page
    .getByRole("button", { name: "Show observations", exact: true })
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
  await page.getByRole("link", {name:"How to use",exact:true}).click();
  await expect(page.getByRole("heading", {name:"How to use NSW Hotspot Replay",exact:true})).toBeVisible();
});
for (const width of [1440, 390])
  test(`replay accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Show observations", exact: true })
      .waitFor();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Results" }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

test("map/table switches retain selection and hiding outcomes clears outcome filters", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Show observations", exact: true })
    .click();
  await page.getByLabel("Metric matching").waitFor();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await page.getByLabel("Show cells").selectOption("miss");
  await page
    .getByRole("button", { name: /Inspect cell/ })
    .first()
    .click();
  const selected = await page.locator(".cell-details code").textContent();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.locator(".cell-details code")).toHaveText(selected!);
  await page
    .getByRole("button", { name: "Hide observations", exact: true })
    .click();
  await expect(page.getByLabel("Metric matching")).toHaveCount(0);
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(page.getByLabel("Show cells")).toHaveValue("selected");
  await expect(
    page.getByRole("cell", { name: "Not revealed", exact: true }).first(),
  ).toBeVisible();
});

test("guide navigation keeps the current selection", async ({page})=>{
  await page.goto("/?source=portfolio");
  await page.getByLabel("Forecast horizon").selectOption("48"); await page.getByRole("button",{name:"Show observations",exact:true}).click(); await page.getByLabel("Metric matching").waitFor();
  await page.getByRole("link",{name:"How to use",exact:true}).click();
  await expect(page.getByRole("heading",{name:"How to use NSW Hotspot Replay",exact:true})).toBeVisible();
  await page.getByRole("link",{name:"Back to tool ↑"}).click();
  expect(new URL(page.url()).search).toBe("?source=portfolio");
  await expect(page.getByLabel("Forecast horizon")).toHaveValue("48"); await expect(page.getByLabel("Metric matching")).toBeVisible();
});
