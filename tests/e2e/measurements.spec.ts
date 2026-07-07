import { expect, test, type Page } from "@playwright/test";

const ZMA_CONTENT = [
  "20 6",
  "32 7",
  "40 13.4164",
  "60 30",
  "90 13.4164",
  "140 8",
  "260 6.5",
  "500 6.4",
].join("\n");

const FRD_CONTENT = [
  "100 70 10",
  "200 70 5",
  "400 70 0",
  "800 70 -5",
  "1000 70 -8",
].join("\n");

async function importFile(page: Page, name: string, content: string) {
  await page.locator('input[accept*=".zma"]').setInputFiles({
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(content),
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test("a single imported measurement can be removed", async ({ page }) => {
  await page.getByTestId("driver-select").selectOption({ label: "Usher 8945P" });
  await expect(page.locator(".measurement-panel").getByRole("button", { name: /Импорт FRD|Import FRD/ })).toBeVisible();
  await importFile(page, "box.zma", ZMA_CONTENT);
  await importFile(page, "measured.frd", FRD_CONTENT);

  const rows = page.getByTestId("measurement-list").locator("li");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator("input.measurement-name")).toHaveValue("box.zma");
  await expect(rows.nth(1).locator("input.measurement-name")).toHaveValue("measured.frd");

  await rows.nth(1).getByRole("button", { name: /Удалить|Remove/ }).click();

  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0).locator("input.measurement-name")).toHaveValue("box.zma");
  await expect(page.getByTestId("spl-align-tool")).toContainText(/Загрузи FRD|Load an FRD/);

  await rows.nth(0).getByRole("button", { name: /Удалить|Remove/ }).click();

  await expect(page.getByTestId("measurement-list")).toHaveCount(0);
});

test("a trace can be renamed and hidden from the chart", async ({ page }) => {
  await page.getByTestId("driver-select").selectOption({ label: "Usher 8945P" });
  await importFile(page, "measured.frd", FRD_CONTENT);

  await expect(page.locator(".legend")).toContainText("measured.frd · norm");

  const row = page.getByTestId("measurement-list").locator("li").first();
  await row.locator("input.measurement-name").fill("mic-1");

  await expect(page.locator(".legend")).toContainText("mic-1 · norm");
  await expect(page.getByTestId("spl-align-tool").locator("option", { hasText: "mic-1" })).toHaveCount(1);

  await row.getByRole("button", { name: /Скрыть|Hide/ }).click();
  await expect(page.locator(".legend")).not.toContainText("mic-1");

  await row.getByRole("button", { name: /Показать|Show/ }).click();
  await expect(page.locator(".legend")).toContainText("mic-1 · norm");
});
