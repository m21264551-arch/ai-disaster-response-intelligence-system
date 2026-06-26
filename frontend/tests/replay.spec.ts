import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("horizon-specific scores, reveal clearing, and missing coverage", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Show observations", exact: true })
    .click();
  await page.getByRole("region", { name: "Exact-cell outcomes" }).waitFor();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await page.getByRole("region",{name:"Exact-cell outcomes"}).getByRole("button",{name:/Misses/}).click();
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
  const row = page.locator(".cell-scroll tbody tr").first();
  await row.getByRole("button").click();
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
  await page.getByRole("link", { name: "How to use", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "How to use NSW Hotspot Replay",
      exact: true,
    }),
  ).toBeVisible();
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
  await page.getByRole("region", { name: "Exact-cell outcomes" }).waitFor();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await page.getByRole("region",{name:"Exact-cell outcomes"}).getByRole("button",{name:/Misses/}).click();
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
  await expect(page.getByLabel("Show cells")).toHaveValue("all");
  await expect(
    page.getByRole("rowheader", { name: "In forecast", exact: true }).first(),
  ).toBeVisible();
});

test("guide navigation keeps the current selection", async ({ page }) => {
  await page.goto("/?source=portfolio");
  await page.getByLabel("Forecast horizon").selectOption("48");
  await page
    .getByRole("button", { name: "Show observations", exact: true })
    .click();
  await page.getByRole("region", { name: "Exact-cell outcomes" }).waitFor();
  await page.getByRole("link", { name: "How to use", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "How to use NSW Hotspot Replay",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to tool ↑" }).click();
  expect(new URL(page.url()).search).toBe("?source=portfolio");
  await expect(page.getByLabel("Forecast horizon")).toHaveValue("48");
  await expect(
    page.getByRole("region", { name: "Exact-cell outcomes" }),
  ).toBeVisible();
});

test("outcome filters share map/table cells without changing counts or viewport", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Show observations", exact: true })
    .waitFor();
  const map = page.locator(".forecast-map");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(map).toHaveAttribute("data-viewport", /.+/);
  // Wait for Leaflet's zoom animation, then record the user-selected viewport.
  await page.waitForTimeout(350);
  const viewport = await map.getAttribute("data-viewport");
  const responsePromise = page.waitForResponse(
    (r) => r.url().endsWith("/api/reveal") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Show observations", exact: true })
    .click();
  const result = await (await responsePromise).json();
  const summary = page.getByRole("region", { name: "Exact-cell outcomes" });
  await summary.waitFor();
  await expect(map).toHaveAttribute("data-viewport", viewport!);
  const text = await summary.textContent();
  for (const status of ["hit", "miss", "false_alarm"]) {
    const ids = result.comparisonCells
      .filter((c: { status: string }) => c.status === status)
      .map((c: { h3_id: string }) => c.h3_id);
    await summary.getByRole("button",{name:status === "hit" ? /Hits/ : status === "miss" ? /Misses/ : /False alarms/}).click();
    await expect(page.locator(".forecast-cell")).toHaveCount(ids.length);
    await expect(page.locator(`.forecast-cell.${status}`)).toHaveCount(
      ids.length,
    );
    await expect(map).toHaveAttribute("data-viewport", viewport!);
    await page.getByRole("button", { name: "Table", exact: true }).click();
    const buttons = page.locator(".cell-scroll tbody button");
    expect((await buttons.evaluateAll(nodes=>nodes.map(n=>n.getAttribute("aria-label")!.replace("Inspect cell ","")))).sort()).toEqual(ids.sort());
    await buttons.first().press("Enter");
    await expect(page.locator(".cell-details .cell-outcome")).toHaveText(
      status === "hit" ? "Hit" : status === "miss" ? "Miss" : "False alarm",
    );
    await page.getByRole("button", { name: "Map", exact: true }).click();
    await expect(map).toHaveAttribute("data-viewport", viewport!);
    await expect(summary).toHaveText(text!);
  }
  await page.getByText("Advanced comparison", { exact: true }).click();
  await page.getByLabel("Metric matching").selectOption("1");
  await expect(
    page.getByRole("button", { name: "Hide observations", exact: true }),
  ).toBeEnabled();
  await expect(summary).toHaveText(text!);
  await expect(map).toHaveAttribute("data-viewport", viewport!);
  await page.getByRole("button", { name: "Fit event", exact: true }).click();
  await expect(map).not.toHaveAttribute("data-viewport", viewport!);
});

test("decimal scores agree across the table, selected cell and map tooltip", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Table", exact: true }).click();
  const first = page.locator(".cell-scroll tbody tr").first();
  const value = await first.locator("td").first().textContent();
  expect(value).toMatch(/^Score 0\.\d{3}$/);
  await first.getByRole("button").click();
  await expect(page.locator(".cell-score")).toHaveText(value!);
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page.locator(".forecast-cell.inspected").hover();
  await expect(page.locator(".leaflet-tooltip")).toContainText(value!);
});

for (const [width, height] of [
  [1280, 720],
  [800, 900],
  [390, 844],
])
  test(`replay and outcomes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Show observations", exact: true })
      .waitFor();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    const action = await page
      .getByRole("button", { name: "Show observations", exact: true })
      .boundingBox();
    expect(action!.y + action!.height).toBeLessThan(height);
    await page.screenshot({
      path: `../../../outputs/distinct-tested-bushfire-${width}.png`,
    });
    await page
      .getByRole("button", { name: "Show observations", exact: true })
      .click();
    await page.getByRole("region", { name: "Exact-cell outcomes" }).waitFor();
    const map = await page.locator(".forecast-map").boundingBox(),
      summary = await page.locator(".outcome-summary").boundingBox(),
      details = await page.locator(".cell-details").boundingBox();
    expect(summary!.y).toBeLessThan(map!.y);
    if (width <= 850) expect(details!.y).toBeGreaterThan(map!.y + map!.height);
    await page.screenshot({
      path: `../../../outputs/distinct-tested-bushfire-outcomes-${width}.png`,
    });
    await page.getByRole("link", { name: "How to use", exact: true }).click();
    await page.screenshot({
      path: `../../../outputs/distinct-tested-bushfire-guide-${width}.png`,
    });
  });

test('outcome count buttons filter both views and sections retain the map instance',async({page})=>{
 await page.goto('/?source=portfolio');
 const map=page.locator('.forecast-map');await map.waitFor();
 const cutoff=await page.getByLabel('Historical cutoff').inputValue();
 await map.evaluate(el=>el.setAttribute('data-instance-test','original'));
 await page.getByRole('button',{name:'Show observations',exact:true}).click();
 const summary=page.getByRole('region',{name:'Exact-cell outcomes'});await summary.waitFor();
 const totals=await summary.textContent();
 await summary.getByRole('button',{name:/Misses/}).click();
 await expect(summary.getByRole('button',{name:/Misses/})).toHaveAttribute('aria-pressed','true');
 const viewport=await map.getAttribute('data-viewport');
 await page.getByRole('button',{name:'Table',exact:true}).click();
 await page.getByRole('button',{name:'Results',exact:true}).click();
 await page.getByRole('button',{name:'Data and method',exact:true}).click();
 await page.getByRole('button',{name:'Replay',exact:true}).click();
 await expect(summary.getByRole('button',{name:/Misses/})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Map',exact:true}).click();
 await expect(map).toHaveAttribute('data-instance-test','original');
 await expect(map).toHaveAttribute('data-viewport',viewport!);
 await expect(summary).toHaveText(totals!);
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 await page.getByRole('button',{name:'Next cutoff',exact:true}).click();
 await expect(summary).toHaveCount(0);
 await expect(page.getByLabel('Show cells')).toHaveValue('all');
 await page.getByRole('button',{name:'Previous cutoff',exact:true}).click();
 await expect(page.getByLabel('Historical cutoff')).toHaveValue(cutoff);
});


test('explicit cell zoom preserves viewport through reveal and presentation changes',async({page})=>{
 await page.goto('/');const map=page.locator('.forecast-map');await map.waitFor();
 const event=await map.getAttribute('data-viewport');
 await page.getByRole('button',{name:'Zoom to cell',exact:true}).click();
 await expect(map).not.toHaveAttribute('data-viewport',event!);
 const focused=await map.getAttribute('data-viewport');
 await page.getByRole('button',{name:'Show observations',exact:true}).click();
 const summary=page.getByRole('region',{name:'Exact-cell outcomes'});await summary.waitFor();
 await expect(map).toHaveAttribute('data-viewport',focused!);
 await expect(page.getByLabel('Show cells')).toHaveCount(0);
 await page.getByRole('button',{name:'Table',exact:true}).click();
 await page.getByRole('button',{name:/Inspect cell/}).first().click();
 await expect(page.getByRole('heading',{name:'Inspecting cell',exact:true})).toBeFocused();
 await page.getByRole('button',{name:'Show on map',exact:true}).click();
 await expect(map).toBeFocused();
 await expect(page.getByRole('button',{name:'Map',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('mobile map movement is opt-in and Escape restores page scrolling',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 const map=page.locator('.forecast-map');await expect(map).toHaveAttribute('data-movement','page-scroll');
 await page.getByRole('button',{name:'Move map',exact:true}).click();
 await expect(map).toHaveAttribute('data-movement','enabled');
 await page.getByRole('button',{name:'Done moving',exact:true}).press('Escape');
 await expect(map).toHaveAttribute('data-movement','page-scroll');
 await expect(page.getByRole('button',{name:'Move map',exact:true})).toHaveAttribute('aria-pressed','false');
});

test('revealed summary explains misses and the expanded inspector leaves attribution exposed',async({page})=>{
 await page.setViewportSize({width:1280,height:720});await page.goto('/');
 await expect(page.locator('.cell-rank')).toContainText('Rank 1 of 481');
 await page.getByRole('button',{name:'Show observations',exact:true}).click();
 await expect(page.locator('.outcome-reading')).toContainText('20 of 49 forecast cells matched');
 await expect(page.locator('.outcome-reading')).toContainText('20 observed cells were missed');
 await page.getByText('Cell details',{exact:true}).click();await page.getByText('Advanced comparison',{exact:true}).click();
 const attribution=page.locator('.leaflet-control-attribution');
 expect(await attribution.evaluate(el=>{const b=el.getBoundingClientRect();return el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));})).toBe(true);
 const panel=await page.locator('.cell-inspector').boundingBox(),map=await page.locator('.forecast-map').boundingBox();
 expect(panel!.y+panel!.height).toBeLessThan(map!.y+map!.height-20);
 await page.getByRole('button',{name:'Table',exact:true}).click();
 await expect(page.locator('.cell-short-id').first()).toHaveText(/^[0-9a-f]{7}$/);
});
test('study retry restores keyboard focus after frame loading',async({page})=>{
 await page.route('**/api/v2/study',r=>r.fulfill({status:503,body:'{}'}));await page.goto('/');
 await expect(page.getByRole('button',{name:'Reload study'})).toBeVisible();
 await page.unroute('**/api/v2/study');await page.getByRole('button',{name:'Reload study'}).click();
 await expect(page.getByLabel('Historical cutoff')).toBeFocused();
});
