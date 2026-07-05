import { describe, expect, it } from "vitest";
import {
  FREQUENCIES,
  createDefaultDesigns,
  PRESET_DRIVERS,
  simulateDesign,
} from "./acoustics";

function expectNear(value: number | undefined, expected: number, tolerance: number) {
  expect(value).toBeDefined();
  expect(Math.abs((value ?? 0) - expected)).toBeLessThanOrEqual(tolerance);
}

function designByName(driverIndex: number, name: string) {
  const driver = PRESET_DRIVERS[driverIndex];
  const design = createDefaultDesigns(driver).find((item) => item.name === name);
  expect(design).toBeDefined();
  return { design: design!, driver };
}

function presetById(id: string) {
  const driver = PRESET_DRIVERS.find((item) => item.id === id);
  expect(driver).toBeDefined();
  return driver!;
}

describe("acoustic reference scenarios", () => {
  it("keeps datasheet-backed preset T/S parameters in expected units", () => {
    expect(presetById("usher-8945p")).toMatchObject({
      fsHz: 34.012,
      qts: 0.335,
      qes: 0.388,
      qms: 2.441,
      vasL: 37.1679,
      sdCm2: 136,
      reOhm: 5.8,
      leMh: 0.237,
      xmaxMm: 6,
      peW: 70,
      sensitivityDb: 86,
      mmsG: 14.5948,
      blTm: 6.9338,
    });
    expect(presetById("dayton-rs180-8")).toMatchObject({
      fsHz: 35.7,
      qts: 0.31,
      qes: 0.42,
      qms: 1.22,
      vasL: 24.4,
      sdCm2: 124.7,
      reOhm: 6.4,
      leMh: 0.73,
      xmaxMm: 6,
      peW: 60,
      sensitivityDb: 86.1,
      mmsG: 17.9,
      blTm: 7.82,
    });
    expect(presetById("sb17nrxc35-8")).toMatchObject({
      fsHz: 32,
      qts: 0.34,
      qes: 0.36,
      qms: 5,
      vasL: 44.5,
      sdCm2: 118,
      reOhm: 5.7,
      leMh: 0.15,
      xmaxMm: 5.5,
      peW: 60,
      sensitivityDb: 87.5,
      mmsG: 11,
      blTm: 5.9,
    });
    expect(presetById("scan-speak-18w-8545-01")).toMatchObject({
      fsHz: 25,
      qts: 0.2,
      qes: 0.22,
      qms: 1.55,
      vasL: 68.6,
      sdCm2: 145,
      reOhm: 5.7,
      leMh: 0.39,
      xmaxMm: 6.5,
      peW: 100,
      sensitivityDb: 86.5,
      mmsG: 18,
      blTm: 8.4,
    });
  });

  it("keeps verified datasheet source metadata on datasheet-backed presets", () => {
    const expectedSources = {
      "usher-8945p": "https://www.audioalchemy.ro/difuzoare/usher/296-602.pdf",
      "dayton-rs180-8": "https://www.daytonaudio.com/images/resources/295-355--dayton-audio-rs180-8-reference-woofer-8-ohm-specifications.pdf",
      "sb17nrxc35-8": "https://sbacoustics.com/product/6in-sb17nrxc35-8/",
      "scan-speak-18w-8545-01": "https://www.scan-speak.dk/product/18w-8545-01/",
    };

    for (const [id, url] of Object.entries(expectedSources)) {
      const driver = presetById(id);

      expect(driver.source?.verified).toBe(true);
      expect(driver.source?.url).toBe(url);
      expect(driver.source?.title).toBeTruthy();
    }
    expect(presetById("usher-8945p").source?.notes).toContain("usherPeRms");
    expect(presetById("sb17nrxc35-8").source?.notes).toContain("sbXmaxPeakToPeak");
  });

  it("can simulate each datasheet-backed preset without invalid metrics", () => {
    for (const id of ["usher-8945p", "dayton-rs180-8", "sb17nrxc35-8", "scan-speak-18w-8545-01"]) {
      const driver = presetById(id);
      const design = createDefaultDesigns(driver).find((item) => item.name === "Vented QB3");
      expect(design).toBeDefined();
      const result = simulateDesign(driver, design!, { powerW: 25 });

      expect(result.metrics.f3Hz).toBeGreaterThan(10);
      expect(result.metrics.f3Hz).toBeLessThan(120);
      expect(result.metrics.maxUsableSplDb).toBeGreaterThan(80);
      expect(result.metrics.maxExcursionMm).toBeGreaterThan(0);
      expect(result.metrics.minImpedanceOhm).toBeGreaterThan(0);
    }
  });

  it("calibrates datasheet-backed SPL to 1 W sensitivity", () => {
    for (const id of ["usher-8945p", "dayton-rs180-8", "sb17nrxc35-8", "scan-speak-18w-8545-01"]) {
      const driver = presetById(id);
      expect(driver.sensitivityDb).toBeDefined();
      const sensitivityDb = driver.sensitivityDb!;
      const design = createDefaultDesigns(driver).find((item) => item.name === "Vented QB3");
      expect(design).toBeDefined();

      const result = simulateDesign(driver, design!, { powerW: 1 });
      const referenceBand = result.splDb
        .filter((point) => point.x >= 300 && point.x <= 600)
        .map((point) => point.y)
        .sort((left, right) => left - right);

      expect(referenceBand.length).toBeGreaterThan(0);
      expectNear(referenceBand[Math.floor(referenceBand.length / 2)], sensitivityDb, 0.1);
      expect(result.metrics.spl50HzDb).toBeLessThan(sensitivityDb + 1);
    }
  });

  it("keeps the 6.5 inch sealed Butterworth alignment stable", () => {
    const { design, driver } = designByName(0, "Closed Butterworth Qtc 0.71");
    const result = simulateDesign(driver, design, { powerW: 25 });

    expectNear(result.metrics.qtc, 0.708, 0.01);
    expectNear(result.metrics.f3Hz, 77.6, 1);
    expectNear(result.metrics.f6Hz, 59.8, 1);
    expectNear(result.metrics.spl50HzDb, 87.9, 1);
    expectNear(result.metrics.spl80HzDb, 93.8, 1);
    expectNear(result.metrics.maxUsableSplDb, 97.6, 1);
    expect(result.metrics.maxUsableSplReason).toBe("xmax");
  });

  it("keeps the 6.5 inch vented QB3 port and headroom stable", () => {
    const { design, driver } = designByName(0, "Vented QB3");
    const result = simulateDesign(driver, design, { powerW: 25 });

    expectNear(result.metrics.f3Hz, 44.7, 1);
    expectNear(result.metrics.f6Hz, 39.2, 1);
    expectNear(result.metrics.portLengthCm, 25, 1);
    expectNear(result.metrics.maxPortMach, 0.026, 0.006);
    expectNear(result.metrics.maxUsableSplDb, 98.7, 1);
    expect(result.metrics.maxUsableSplReason).toBe("power");
    expect(result.metrics.notes).toContain("Xmax exceeded at 10 Hz");
  });

  it("keeps the 10 inch vented QB3 low-frequency tuning stable", () => {
    const { design, driver } = designByName(1, "Vented QB3");
    const result = simulateDesign(driver, design, { powerW: 25 });

    expectNear(result.metrics.f3Hz, 33.1, 1);
    expectNear(result.metrics.f6Hz, 27.4, 1);
    expectNear(result.metrics.portLengthCm, 19.7, 1);
    expectNear(result.metrics.maxPortMach, 0.035, 0.008);
    expectNear(result.metrics.maxUsableSplDb, 102.9, 1);
    expect(result.metrics.maxUsableSplReason).toBe("power");
  });

  it("keeps the 12 inch vented QB3 output limit tied to port speed", () => {
    const { design, driver } = designByName(2, "Vented QB3");
    const result = simulateDesign(driver, design, { powerW: 25 });

    expectNear(result.metrics.f3Hz, 21.6, 1);
    expectNear(result.metrics.peakDb, 1.13, 0.2);
    expectNear(result.metrics.portLengthCm, 10.8, 1);
    expectNear(result.metrics.maxPortMach, 0.051, 0.01);
    expectNear(result.metrics.maxUsableSplDb, 102.4, 1);
    expect(result.metrics.maxUsableSplReason).toBe("port");
  });

  it("can calculate only the SPL graph without filling unrelated series", () => {
    const { design, driver } = designByName(0, "Vented QB3");
    const result = simulateDesign(driver, design, { powerW: 25, outputs: ["spl"] });

    expect(result.splDb).toHaveLength(FREQUENCIES.length);
    expect(result.responseDb).toHaveLength(0);
    expect(result.excursionMm).toHaveLength(0);
    expect(result.groupDelayMs).toHaveLength(0);
    expect(result.portMach).toHaveLength(0);
    expect(result.metrics.f3Hz).toBeUndefined();
  });

  it("extends chart simulation points beyond the default 500 Hz range", () => {
    const { design, driver } = designByName(0, "Vented QB3");
    const result = simulateDesign(driver, design, {
      frequencyMaxHz: 3000,
      outputs: ["response"],
      powerW: 25,
    });

    expect(result.responseDb.length).toBeGreaterThan(FREQUENCIES.length);
    expect(result.responseDb[result.responseDb.length - 1]?.x).toBeCloseTo(3000, 3);
  });
});
