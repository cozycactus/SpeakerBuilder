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
  await importFile(page, "box.zma", ZMA_CONTENT);
  await importFile(page, "measured.frd", FRD_CONTENT);

  const list = page.getByTestId("measurement-list");
  await expect(list.locator("li")).toHaveCount(2);
  await expect(list).toContainText("box.zma");
  await expect(list).toContainText("measured.frd");

  await list
    .locator("li", { hasText: "measured.frd" })
    .getByRole("button", { name: /Удалить|Remove/ })
    .click();

  await expect(list.locator("li")).toHaveCount(1);
  await expect(list).toContainText("box.zma");
  await expect(page.getByTestId("spl-align-tool")).toContainText(/Загрузи FRD|Load an FRD/);

  await list
    .locator("li", { hasText: "box.zma" })
    .getByRole("button", { name: /Удалить|Remove/ })
    .click();

  await expect(page.getByTestId("measurement-list")).toHaveCount(0);
});
