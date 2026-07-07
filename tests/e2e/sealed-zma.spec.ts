import { expect, test, type Locator, type Page } from "@playwright/test";

type DriverFieldKey = "fsHz" | "qts" | "qes" | "qms" | "reOhm" | "vasL";

const input = (page: Page, key: DriverFieldKey) => page.getByTestId(`driver-input-${key}`);
const mode = (page: Page, key: DriverFieldKey) => page.getByTestId(`driver-mode-${key}-measured`);

// mass-preserved sealed box over a 30 Hz / Qes 0.671 / Qms 2.683 driver:
// fc = 60, rc = 5, dF = fc*sqrt(rc)/Qmc = 25
const SEALED_ZMA_CONTENT = [
  "20 6",
  "32 7",
  "48.79 13.4164",
  "60 30",
  "73.79 13.4164",
  "140 8",
  "260 6.5",
  "500 6.4",
].join("\n");

const ADDED_MASS_ZMA_CONTENT = [
  "8 6.2",
  "12 7",
  "16 10",
  "21.2132 28",
  "30 9",
  "48 6.6",
  "120 6.3",
  "400 6.5",
].join("\n");

const FREE_AIR_ZMA_CONTENT = [
  "10 6",
  "16 7",
  "20 13.4164",
  "30 30",
  "45 13.4164",
  "70 8",
  "140 6.5",
  "400 6.4",
].join("\n");

function readout(tool: Locator, label: RegExp): Locator {
  return tool
    .locator(".sealed-zma-readout > div")
    .filter({ has: tool.page().getByText(label) })
    .locator("strong");
}

async function readoutNumber(tool: Locator, label: RegExp): Promise<number> {
  const value = Number.parseFloat(await readout(tool, label).innerText());
  expect(Number.isFinite(value)).toBe(true);
  return value;
}

function toolField(tool: Locator, label: RegExp): Locator {
  return tool.locator("label.field", { hasText: label }).locator("input");
}

async function selectedDriverLabel(page: Page): Promise<string> {
  return page.getByTestId("driver-select").evaluate((select) =>
    select instanceof HTMLSelectElement
      ? select.selectedOptions[0]?.textContent ?? ""
      : "",
  );
}

async function importZma(page: Page, name: string, content: string) {
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

async function fillSealedScenarioDriver(page: Page) {
  await mode(page, "fsHz").click();
  await mode(page, "qes").click();
  await mode(page, "qts").click();
  await mode(page, "vasL").click();
  await input(page, "fsHz").fill("30");
  await input(page, "qes").fill("0.6708");
  await input(page, "qts").fill("0.5367");
  await input(page, "vasL").fill("30");
}

test("sealed-box ZMA import derives Vas and Qts for the selected driver", async ({ page }) => {
  await page.getByTestId("driver-select").selectOption({ label: "Usher 8945P" });
  await expect(input(page, "fsHz")).toBeVisible();
  await fillSealedScenarioDriver(page);

  await importZma(page, "sealed-box.zma", SEALED_ZMA_CONTENT);

  const tool = page.getByTestId("sealed-zma-tool");
  await expect(tool.locator(".sealed-zma-readout")).toBeVisible();
  await expect(toolField(tool, /Vb тест|Test Vb/)).toHaveValue("10");
  await toolField(tool, /Re \(DC\)/).fill("6");

  // Small eqs. 45-47: Qmc = 60*sqrt(5)/25, Qec = Qmc/4, Qtc = Qmc/5
  expect(Math.abs(await readoutNumber(tool, /^Qmc$/) - 5.367)).toBeLessThan(0.02);
  expect(Math.abs(await readoutNumber(tool, /^Qec$/) - 1.342)).toBeLessThan(0.01);
  expect(Math.abs(await readoutNumber(tool, /^Qtc$/) - 1.07)).toBeLessThan(0.01);
  // eq. 48: alpha = fc*Qec/(fs*Qes) - 1 = 3
  expect(Math.abs(await readoutNumber(tool, /^Vas (по|by) ZMA$/) - 30)).toBeLessThan(0.5);
  expect(Math.abs(await readoutNumber(tool, /^Qts (по|by) ZMA$/) - 0.537)).toBeLessThan(0.01);
  await expect(readout(tool, /^T\/S Fc \/ Qtc$/)).toHaveText("60.0 Hz / 1.07");

  // Small eqs. 75-78: f3/fc = 0.764 for Qtc = 1.07, peak +1.7 dB near 80 Hz
  expect(Math.abs(await readoutNumber(tool, /^F3$/) - 45.8)).toBeLessThan(0.3);
  await expect(readout(tool, /^Пик$|^Peak$/)).toContainText("dB");
  await expect(readout(tool, /^Выравнивание$|^Alignment$/)).toContainText(/Чебышев|Chebyshev/);

  // Small eq. 24: eta0 = 4pi^2*fc^3*V_AT/(c^3*Qec) with V_AT = 0.75*Vb
  expect(Math.abs(await readoutNumber(tool, /^КПД η0$|^Efficiency η0$/) - 0.12)).toBeLessThan(0.01);
  expect(Math.abs(await readoutNumber(tool, /^SPL 1Вт\/1м$|^SPL 1W\/1m$/) - 82.7)).toBeLessThan(0.2);

  await expect(page.getByTestId("added-mass-tool")).toContainText(/должен быть ниже|must be below/);
});

test("changing the test volume rescales the ZMA-derived T/S estimate", async ({ page }) => {
  await page.getByTestId("driver-select").selectOption({ label: "Usher 8945P" });
  await expect(input(page, "fsHz")).toBeVisible();
  await fillSealedScenarioDriver(page);

  await importZma(page, "sealed-box.zma", SEALED_ZMA_CONTENT);

  const tool = page.getByTestId("sealed-zma-tool");
  await expect(tool.locator(".sealed-zma-readout")).toBeVisible();
  const volume = toolField(tool, /Vb тест|Test Vb/);
  await expect(volume).toHaveValue("10");
  await toolField(tool, /Re \(DC\)/).fill("6");
  const qtsBefore = await readoutNumber(tool, /^Qts (по|by) ZMA$/);

  await volume.fill("20");

  await expect(readout(tool, /^T\/S Fc \/ Qtc$/)).toHaveText("47.4 Hz / 0.85");
  expect(Math.abs(await readoutNumber(tool, /^Vas (по|by) ZMA$/) - 60)).toBeLessThan(1);
  expect(await readoutNumber(tool, /^Qts (по|by) ZMA$/)).toBeCloseTo(qtsBefore, 5);
});

test("response tab shows the ZMA estimate next to the target Qtc curve", async ({ page }) => {
  await page.getByTestId("driver-select").selectOption({ label: "Usher 8945P" });
  await expect(input(page, "fsHz")).toBeVisible();

  await mode(page, "fsHz").click();
  await mode(page, "qts").click();
  await input(page, "fsHz").fill("30");
  await input(page, "qts").fill("0.4");

  await importZma(page, "sealed-box.zma", SEALED_ZMA_CONTENT);

  await page.locator(".tabs").getByRole("button", { name: /АЧХ|Response/ }).click();
  await expect(page.locator(".legend")).toContainText(/Оценка ЗЯ по ZMA|ZMA closed estimate/);
  await expect(page.locator(".legend")).toContainText(/Цель ЗЯ|Sealed target/);

  // hiding the source trace hides both derived curves
  await page.getByTestId("measurement-list").locator("li").first()
    .getByRole("button", { name: /Скрыть|Hide/ }).click();

  await expect(page.locator(".legend")).not.toContainText(/Оценка ЗЯ|closed estimate/);
  await expect(page.locator(".legend")).not.toContainText(/Цель ЗЯ|Sealed target/);
});

test("free-air ZMA import derives Fs, Re, and Q factors", async ({ page }) => {
  await page.getByTestId("driver-select").selectOption({ label: "Usher 8945P" });
  await importZma(page, "free-air.zma", FREE_AIR_ZMA_CONTENT);

  const tool = page.getByTestId("free-air-tool");
  await expect(tool.locator(".sealed-zma-readout")).toBeVisible();

  // Re (DC) is prefilled from the driver parameters, not taken from the curve
  const reInput = toolField(tool, /Re \(DC\)/);
  await expect(reInput).toHaveValue("5.8");
  await reInput.fill("6");

  // r0 = 5, dF = 25 Hz: Qms = 30*sqrt(5)/25, Qes = Qms/4, Qts = Qms/5
  await expect(readout(tool, /^Fs$/)).toHaveText("30.0 Hz");
  await expect(readout(tool, /^Re (по|by) ZMA$/)).toHaveText("6.00 Ω");
  expect(Math.abs(await readoutNumber(tool, /^Qms$/) - 2.683)).toBeLessThan(0.01);
  expect(Math.abs(await readoutNumber(tool, /^Qes$/) - 0.671)).toBeLessThan(0.005);
  expect(Math.abs(await readoutNumber(tool, /^Qts$/) - 0.537)).toBeLessThan(0.005);
});

test("free-air T/S values can be applied to the driver", async ({ page }) => {
  await page.getByTestId("driver-select").selectOption({ label: "Usher 8945P" });
  await importZma(page, "free-air.zma", FREE_AIR_ZMA_CONTENT);

  const tool = page.getByTestId("free-air-tool");
  await expect(tool.locator(".sealed-zma-readout")).toBeVisible();
  await toolField(tool, /Re \(DC\)/).fill("6");

  await tool.getByRole("button", { name: /Применить|Apply/ }).click();

  await expect(page.locator(".status-line")).toContainText(/применены|applied/i);
  await expect.poll(() => selectedDriverLabel(page)).toMatch(/копия|copy/i);

  await expect(input(page, "fsHz")).toHaveValue("30");
  await expect(input(page, "qms")).toHaveValue("2.6833");
  await expect(input(page, "qes")).toHaveValue("0.6708");
  await expect(input(page, "qts")).toHaveValue("0.5367");
  // Re is an input to the method, not a result - the driver keeps its own value
  await expect(input(page, "reOhm")).toHaveValue("5.8");
});

test("added-mass derivation chains Fs from the free-air measurement", async ({ page }) => {
  await page.getByTestId("driver-select").selectOption({ label: "Usher 8945P" });
  // the driver keeps its datasheet Fs of 34.012 Hz - the chain must override it
  await importZma(page, "free-air.zma", FREE_AIR_ZMA_CONTENT);
  await importZma(page, "added-mass.zma", ADDED_MASS_ZMA_CONTENT);

  const tool = page.getByTestId("added-mass-tool");
  await tool.locator("select").selectOption({ label: "added-mass.zma" });

  await expect(tool).toContainText(/по свободному воздуху|free-air measurement/);
  await expect(tool.locator(".sealed-zma-readout")).toBeVisible();

  // Mms = 10 g only when Fs = 30 Hz comes from the free-air ZMA, not the driver
  expect(Math.abs(await readoutNumber(tool, /^Mms (по|by) ZMA$/) - 10)).toBeLessThan(0.05);
});

test("added-mass ZMA import derives Mms, Cms, and Vas for the selected driver", async ({ page }) => {
  await page.getByTestId("driver-select").selectOption({ label: "Usher 8945P" });
  await expect(input(page, "fsHz")).toBeVisible();

  await mode(page, "fsHz").click();
  await input(page, "fsHz").fill("30");

  await importZma(page, "added-mass.zma", ADDED_MASS_ZMA_CONTENT);

  const tool = page.getByTestId("added-mass-tool");
  await expect(tool.locator(".sealed-zma-readout")).toBeVisible();
  const mass = toolField(tool, /Груз|Added mass/);
  await expect(mass).toHaveValue("10");

  await expect(readout(tool, /^Fm$/)).toHaveText("21.2 Hz");
  expect(Math.abs(await readoutNumber(tool, /^Mms (по|by) ZMA$/) - 10)).toBeLessThan(0.01);
  expect(Math.abs(await readoutNumber(tool, /^Cms (по|by) ZMA$/) - 2.8145)).toBeLessThan(0.002);
  expect(Math.abs(await readoutNumber(tool, /^Vas (по|by) ZMA$/) - 73.7)).toBeLessThan(0.2);

  await mass.fill("20");

  expect(Math.abs(await readoutNumber(tool, /^Mms (по|by) ZMA$/) - 20)).toBeLessThan(0.01);
  expect(Math.abs(await readoutNumber(tool, /^Vas (по|by) ZMA$/) - 36.9)).toBeLessThan(0.2);
});
