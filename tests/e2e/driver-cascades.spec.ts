import { expect, test, type Page } from "@playwright/test";

type DriverFieldKey =
  | "fsHz"
  | "qes"
  | "vasL"
  | "sdCm2"
  | "reOhm"
  | "mmsG"
  | "cmsMmN"
  | "blTm";

type FieldMode = "measured" | "fixed" | "derive";

const field = (page: Page, key: DriverFieldKey) => page.getByTestId(`driver-field-${key}`);
const input = (page: Page, key: DriverFieldKey) => page.getByTestId(`driver-input-${key}`);
const mode = (page: Page, key: DriverFieldKey, name: FieldMode) => page.getByTestId(`driver-mode-${key}-${name}`);
const chain = (page: Page, key: DriverFieldKey) => page.getByTestId(`driver-chain-${key}`);

function expectedCmsMmN(fsHz: number, mmsG: number): number {
  const cms = 1000 / ((Math.PI * 2 * fsHz) ** 2 * (mmsG / 1000));
  return Math.round(cms * 10000) / 10000;
}

async function setMeasured(page: Page, key: DriverFieldKey) {
  await mode(page, key, "measured").click();
}

async function numberValue(page: Page, key: DriverFieldKey): Promise<number> {
  const value = Number(await input(page, key).inputValue());
  expect(Number.isFinite(value)).toBe(true);
  return value;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto("/");
});

test("manual Mms change offers motor recalculations and cascades active Cms after deriving Fs", async ({ page }) => {
  await page.getByTestId("driver-select").selectOption({ label: "Usher 8945P" });
  await expect(field(page, "mmsG")).toBeVisible();

  await setMeasured(page, "mmsG");
  await setMeasured(page, "fsHz");
  await setMeasured(page, "qes");
  await setMeasured(page, "reOhm");
  await setMeasured(page, "blTm");
  await setMeasured(page, "cmsMmN");

  await mode(page, "cmsMmN", "derive").click();
  await expect(mode(page, "cmsMmN", "derive")).toContainText(/расчет|derived/i);
  const cmsBefore = await numberValue(page, "cmsMmN");

  await input(page, "mmsG").fill("13.91");

  await expect(chain(page, "fsHz")).toContainText("Mms -> Fs");
  await expect(chain(page, "qes")).toContainText("Mms -> Qes");
  await expect(chain(page, "reOhm")).toContainText("Mms -> Re");
  await expect(chain(page, "blTm")).toContainText("Mms -> BL");
  await expect(chain(page, "vasL")).toHaveCount(0);
  await expect(chain(page, "sdCm2")).toHaveCount(0);

  await mode(page, "fsHz", "derive").click();

  const fs = await numberValue(page, "fsHz");
  const mms = await numberValue(page, "mmsG");
  const cms = await numberValue(page, "cmsMmN");

  expect(cms).toBeCloseTo(expectedCmsMmN(fs, mms), 4);
  expect(cms).not.toBe(cmsBefore);
});
