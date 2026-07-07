import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test("passport shows T/S efficiency, computed sensitivity, and the ceiling", async ({ page }) => {
  await page.getByTestId("driver-select").selectOption({ label: "Usher 8945P" });

  const passport = page.locator(".calculation-passport");
  // Small eq. 23 for the Usher preset: eta0 = 0.37 %, SPL = 87.7 dB vs spec 86.0
  await expect(passport).toContainText(/КПД η0 по T\/S|T\/S efficiency η0/);
  await expect(passport).toContainText("0.37 %");
  await expect(passport).toContainText("87.7 / 86.0 dB");
  // Small eq. 36 ceiling with utilization percentage
  await expect(passport).toContainText(/Потолок η0|η0 ceiling/);
  await expect(passport).toContainText("· исп.");

  // Small eqs. 54-57: the B2 sealed box this driver implies
  const analysis = page.locator(".driver-analysis");
  await expect(analysis).toContainText(/ЗЯ B2|Sealed B2/);
  await expect(analysis).toContainText("Vb ≈ 10.8 L");
  await expect(analysis).toContainText("71.8 Hz");
});
