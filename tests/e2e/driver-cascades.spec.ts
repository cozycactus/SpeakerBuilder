import { expect, test, type Page } from "@playwright/test";

type DriverFieldKey =
  | "fsHz"
  | "qts"
  | "qes"
  | "qms"
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

function expectedQts(qes: number, qms: number): number {
  return Math.round(((qes * qms) / (qes + qms)) * 10000) / 10000;
}

function expectedQes(qts: number, qms: number): number {
  return Math.round((1 / (1 / qts - 1 / qms)) * 10000) / 10000;
}

function expectedBlTm(fsHz: number, mmsG: number, reOhm: number, qes: number): number {
  const mmsKg = mmsG / 1000;
  const bl = Math.sqrt((Math.PI * 2 * fsHz * mmsKg * reOhm) / qes);
  return Math.round(bl * 10000) / 10000;
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

test("manual Qms change offers Qts and Qes quality recalculations", async ({ page }) => {
  await page.getByTestId("driver-select").selectOption({ label: "Usher 8945P" });
  await expect(field(page, "qms")).toBeVisible();

  await setMeasured(page, "qts");
  await setMeasured(page, "qes");
  await setMeasured(page, "qms");

  const qtsBefore = await numberValue(page, "qts");
  await input(page, "qms").fill("1.3725");

  await expect(chain(page, "qts")).toContainText("Qms -> Qts");
  await expect(chain(page, "qes")).toContainText("Qms -> Qes");

  await mode(page, "qts", "derive").click();

  const qts = await numberValue(page, "qts");
  const qes = await numberValue(page, "qes");
  const qms = await numberValue(page, "qms");

  expect(qts).toBeCloseTo(expectedQts(qes, qms), 4);
  expect(qts).not.toBe(qtsBefore);
});

test("manual Qms change cascades active Qes and offers BL recalculation", async ({ page }) => {
  await page.getByTestId("driver-select").selectOption({ label: "Usher 8945P" });
  await expect(field(page, "qms")).toBeVisible();

  await setMeasured(page, "qts");
  await setMeasured(page, "qes");
  await setMeasured(page, "qms");
  await setMeasured(page, "blTm");

  await mode(page, "qes", "derive").click();
  await expect(mode(page, "qes", "derive")).toContainText(/расчет|derived/i);
  const qesBefore = await numberValue(page, "qes");
  const blBefore = await numberValue(page, "blTm");

  await input(page, "qms").fill("1.3725");

  await expect(chain(page, "blTm")).toContainText("Qms -> Qes -> BL");
  await expect(chain(page, "qts")).toHaveCount(0);
  expect(await numberValue(page, "qes")).not.toBe(qesBefore);

  await mode(page, "blTm", "derive").click();

  const fs = await numberValue(page, "fsHz");
  const mms = await numberValue(page, "mmsG");
  const re = await numberValue(page, "reOhm");
  const qes = await numberValue(page, "qes");
  const bl = await numberValue(page, "blTm");

  expect(bl).toBeCloseTo(expectedBlTm(fs, mms, re, qes), 4);
  expect(bl).not.toBe(blBefore);
});

test("manual Qts change offers Qes and Qms quality recalculations", async ({ page }) => {
  await page.getByTestId("driver-select").selectOption({ label: "Usher 8945P" });
  await expect(field(page, "qts")).toBeVisible();

  await setMeasured(page, "qts");
  await setMeasured(page, "qes");
  await setMeasured(page, "qms");

  const qesBefore = await numberValue(page, "qes");
  await input(page, "qts").fill("0.36");

  await expect(chain(page, "qes")).toContainText("Qts -> Qes");
  await expect(chain(page, "qms")).toContainText("Qts -> Qms");

  await mode(page, "qes", "derive").click();

  const qts = await numberValue(page, "qts");
  const qes = await numberValue(page, "qes");
  const qms = await numberValue(page, "qms");

  expect(qes).toBeCloseTo(expectedQes(qts, qms), 4);
  expect(qes).not.toBe(qesBefore);
});

test("manual Qts change cascades active Qes and offers BL recalculation", async ({ page }) => {
  await page.getByTestId("driver-select").selectOption({ label: "Usher 8945P" });
  await expect(field(page, "qts")).toBeVisible();

  await setMeasured(page, "qts");
  await setMeasured(page, "qes");
  await setMeasured(page, "qms");
  await setMeasured(page, "blTm");

  await mode(page, "qes", "derive").click();
  await expect(mode(page, "qes", "derive")).toContainText(/расчет|derived/i);
  const qesBefore = await numberValue(page, "qes");
  const blBefore = await numberValue(page, "blTm");

  await input(page, "qts").fill("0.36");

  await expect(chain(page, "blTm")).toContainText("Qts -> Qes -> BL");
  await expect(chain(page, "qms")).toContainText("Qts -> Qes -> Qms");
  expect(await numberValue(page, "qes")).not.toBe(qesBefore);

  await mode(page, "blTm", "derive").click();

  const fs = await numberValue(page, "fsHz");
  const mms = await numberValue(page, "mmsG");
  const re = await numberValue(page, "reOhm");
  const qes = await numberValue(page, "qes");
  const bl = await numberValue(page, "blTm");

  expect(bl).toBeCloseTo(expectedBlTm(fs, mms, re, qes), 4);
  expect(bl).not.toBe(blBefore);
});

test("manual Qes change offers quality and motor recalculations", async ({ page }) => {
  await page.getByTestId("driver-select").selectOption({ label: "Usher 8945P" });
  await expect(field(page, "qes")).toBeVisible();

  await setMeasured(page, "qts");
  await setMeasured(page, "qes");
  await setMeasured(page, "qms");
  await setMeasured(page, "blTm");

  const qtsBefore = await numberValue(page, "qts");
  await input(page, "qes").fill("0.488");

  await expect(chain(page, "qts")).toContainText("Qes -> Qts");
  await expect(chain(page, "qms")).toContainText("Qes -> Qms");
  await expect(chain(page, "blTm")).toContainText("Qes -> BL");

  await mode(page, "qts", "derive").click();

  const qts = await numberValue(page, "qts");
  const qes = await numberValue(page, "qes");
  const qms = await numberValue(page, "qms");

  expect(qts).toBeCloseTo(expectedQts(qes, qms), 4);
  expect(qts).not.toBe(qtsBefore);
});

test("manual Qes change can derive BL from the motor formula", async ({ page }) => {
  await page.getByTestId("driver-select").selectOption({ label: "Usher 8945P" });
  await expect(field(page, "qes")).toBeVisible();

  await setMeasured(page, "qes");
  await setMeasured(page, "blTm");

  const blBefore = await numberValue(page, "blTm");
  await input(page, "qes").fill("0.488");

  await expect(chain(page, "blTm")).toContainText("Qes -> BL");
  await mode(page, "blTm", "derive").click();

  const fs = await numberValue(page, "fsHz");
  const mms = await numberValue(page, "mmsG");
  const re = await numberValue(page, "reOhm");
  const qes = await numberValue(page, "qes");
  const bl = await numberValue(page, "blTm");

  expect(bl).toBeCloseTo(expectedBlTm(fs, mms, re, qes), 4);
  expect(bl).not.toBe(blBefore);
});
