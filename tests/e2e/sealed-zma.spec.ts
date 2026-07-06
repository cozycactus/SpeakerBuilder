import { expect, test, type Locator, type Page } from "@playwright/test";

type DriverFieldKey = "fsHz" | "qts" | "vasL";

const input = (page: Page, key: DriverFieldKey) => page.getByTestId(`driver-input-${key}`);
const mode = (page: Page, key: DriverFieldKey) => page.getByTestId(`driver-mode-${key}-measured`);

const SEALED_ZMA_CONTENT = [
  "20 6",
  "32 7",
  "40 13.4164",
  "60 30",
  "90 13.4164",
  "140 8",
  "260 6.5",
  "500 6.4",
].join("\n");

function readout(page: Page, label: RegExp): Locator {
  return page
    .locator(".sealed-zma-readout > div")
    .filter({ has: page.getByText(label) })
    .locator("strong");
}

async function readoutNumber(page: Page, label: RegExp): Promise<number> {
  const value = Number.parseFloat(await readout(page, label).innerText());
  expect(Number.isFinite(value)).toBe(true);
  return value;
}

async function importSealedZma(page: Page) {
  await page.locator('input[accept*=".zma"]').setInputFiles({
    name: "sealed-box.zma",
    mimeType: "text/plain",
    buffer: Buffer.from(SEALED_ZMA_CONTENT),
  });
  await expect(page.locator(".sealed-zma-readout")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test("sealed-box ZMA import derives Vas and Qts for the selected driver", async ({ page }) => {
  await page.getByTestId("driver-select").selectOption({ label: "Usher 8945P" });
  await expect(input(page, "fsHz")).toBeVisible();

  await mode(page, "fsHz").click();
  await mode(page, "qts").click();
  await mode(page, "vasL").click();
  await input(page, "fsHz").fill("30");
  await input(page, "qts").fill("0.4");
  await input(page, "vasL").fill("30");

  await importSealedZma(page);

  const volume = page.locator("label.field", { hasText: /Vb тест|Test Vb/ }).locator("input");
  await expect(volume).toHaveValue("10");

  expect(await readoutNumber(page, /^Qtc$/)).toBeCloseTo(1.2, 1);
  expect(Math.abs(await readoutNumber(page, /^Vas (по|by) ZMA$/) - 30)).toBeLessThan(0.5);
  expect(Math.abs(await readoutNumber(page, /^Qts (по|by) ZMA$/) - 0.6)).toBeLessThan(0.03);
  await expect(readout(page, /^T\/S Fc \/ Qtc$/)).toHaveText("60.0 Hz / 0.80");
});

test("changing the test volume rescales the ZMA-derived T/S estimate", async ({ page }) => {
  await page.getByTestId("driver-select").selectOption({ label: "Usher 8945P" });
  await expect(input(page, "fsHz")).toBeVisible();

  await mode(page, "fsHz").click();
  await mode(page, "qts").click();
  await mode(page, "vasL").click();
  await input(page, "fsHz").fill("30");
  await input(page, "qts").fill("0.4");
  await input(page, "vasL").fill("30");

  await importSealedZma(page);

  const volume = page.locator("label.field", { hasText: /Vb тест|Test Vb/ }).locator("input");
  await expect(volume).toHaveValue("10");
  const qtsBefore = await readoutNumber(page, /^Qts (по|by) ZMA$/);

  await volume.fill("20");

  await expect(readout(page, /^T\/S Fc \/ Qtc$/)).toHaveText("47.4 Hz / 0.63");
  expect(Math.abs(await readoutNumber(page, /^Vas (по|by) ZMA$/) - 60)).toBeLessThan(1);
  expect(await readoutNumber(page, /^Qts (по|by) ZMA$/)).toBeCloseTo(qtsBefore, 5);
});
