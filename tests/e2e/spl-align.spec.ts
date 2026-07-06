import { expect, test, type Page } from "@playwright/test";

const PROJECT_STORAGE_KEY = "speaker-builder-project-v1";

const FRD_CONTENT = [
  "100 70 10",
  "150 70.5 8",
  "200 70 5",
  "300 69.5 2",
  "400 70 0",
  "600 70 -2",
  "800 70 -5",
  "1000 70 -8",
].join("\n");

const offsetInput = (page: Page) =>
  page.getByTestId("spl-align-tool").locator("label.field", { hasText: /Сдвиг|Offset/ }).locator("input");

async function importFrd(page: Page) {
  await page.locator('input[accept*=".zma"]').setInputFiles({
    name: "measured.frd",
    mimeType: "text/plain",
    buffer: Buffer.from(FRD_CONTENT),
  });
  await expect(offsetInput(page)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test("auto-aligns an imported FRD to the modeled SPL", async ({ page }) => {
  await page.getByTestId("driver-select").selectOption({ label: "Usher 8945P" });
  await importFrd(page);

  const tool = page.getByTestId("spl-align-tool");
  await expect(offsetInput(page)).toHaveValue("0");

  await tool.getByRole("button", { name: /Авто по модели|Auto to model/ }).click();

  await expect(page.locator(".status-line")).toContainText(/выровнен|aligned/i);
  const aligned = Number(await offsetInput(page).inputValue());
  expect(Number.isFinite(aligned)).toBe(true);
  expect(aligned).toBeGreaterThan(3);

  await tool.getByRole("button", { name: /Сброс|Reset/ }).click();
  await expect(offsetInput(page)).toHaveValue("0");
});

test("manual SPL offset labels the measured series and persists", async ({ page }) => {
  await page.getByTestId("driver-select").selectOption({ label: "Usher 8945P" });
  await importFrd(page);

  await offsetInput(page).fill("12.5");

  await page.locator(".tabs").getByRole("button", { name: "SPL", exact: true }).click();
  await expect(page.locator(".legend")).toContainText("measured.frd +12.5 dB");

  await page.waitForFunction((storageKey) => {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return false;
    }
    const project = JSON.parse(raw) as { measurements?: Array<{ offsetDb?: number }> };
    return project.measurements?.some((measurement) => measurement.offsetDb === 12.5) ?? false;
  }, PROJECT_STORAGE_KEY);
  await page.reload();

  await expect(offsetInput(page)).toHaveValue("12.5");
});
