import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

async function chartBox(page: Page) {
  const svg = page.getByTestId("chart-svg");
  await expect(svg).toBeVisible();
  const box = await svg.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function dragYAxis(page: Page, deltaY: number) {
  const box = await chartBox(page);
  const x = box.x + box.width * 0.04;
  const y = box.y + box.height * 0.52;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + deltaY, { steps: 8 });
  await page.mouse.up();
}

test("frequency presets update the chart range and show the 3 kHz tick", async ({ page }) => {
  await page.getByRole("button", { name: "20-3k", exact: true }).click();

  await expect(page.getByTestId("chart-x-min")).toHaveValue("20");
  await expect(page.getByTestId("chart-x-max")).toHaveValue("3000");
  await expect(page.getByTestId("chart-svg").locator("text").filter({ hasText: "3k" })).toBeVisible();
});

test("dragging the vertical axis pans the Y range and disables Auto Y", async ({ page }) => {
  await expect(page.getByTestId("chart-y-auto")).toBeChecked();

  await dragYAxis(page, 90);

  await expect(page.getByTestId("chart-y-auto")).not.toBeChecked();
  await expect(page.getByTestId("chart-y-min")).toBeVisible();
  await expect(page.getByTestId("chart-y-max")).toBeVisible();

  const yMin = Number(await page.getByTestId("chart-y-min").inputValue());
  const yMax = Number(await page.getByTestId("chart-y-max").inputValue());
  expect(Number.isFinite(yMin)).toBe(true);
  expect(Number.isFinite(yMax)).toBe(true);
  expect(yMin).toBeGreaterThan(-36);
  expect(yMax).toBeGreaterThan(9);

  const box = await chartBox(page);
  await page.mouse.dblclick(box.x + box.width * 0.04, box.y + box.height * 0.52);

  await expect(page.getByTestId("chart-y-auto")).toBeChecked();
  await expect(page.getByTestId("chart-y-min")).toHaveCount(0);
});

test("chart SVG and PNG exports contain rendered chart data", async ({ page }) => {
  const [svgDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-chart-svg").click(),
  ]);
  expect(svgDownload.suggestedFilename()).toMatch(/\.svg$/);
  const svgPath = await svgDownload.path();
  expect(svgPath).toBeTruthy();
  const svgText = await readFile(svgPath!, "utf8");

  expect(svgText).toContain("<svg");
  expect(svgText).toContain("export-bg");
  expect(svgText).toContain("series-line");
  expect(svgText).toMatch(/<path[^>]+d="M/);
  expect(svgText).not.toContain("plot-hitbox");
  expect(svgText).not.toContain("y-axis-hitbox");

  const [pngDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-chart-png").click(),
  ]);
  expect(pngDownload.suggestedFilename()).toMatch(/\.png$/);
  const pngPath = await pngDownload.path();
  expect(pngPath).toBeTruthy();
  const png = await readFile(pngPath!);

  expect(png.length).toBeGreaterThan(5_000);
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});
