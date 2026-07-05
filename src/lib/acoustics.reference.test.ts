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

describe("acoustic reference scenarios", () => {
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
});
