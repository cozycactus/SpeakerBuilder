import { describe, expect, it } from "vitest";

import type { SpeakerDriver } from "./acoustics";
import {
  type MechanicalDerivedField,
  type MotorDerivedField,
  type QualityDerivedField,
  changedDriverFormulaFields,
  deriveMotorField,
  deriveQualityField,
  driverFormulaPromptForChangedFields,
  driverFormulaValueDiffers,
  reconcileDriverDerivedFields,
} from "./driverDerivations";

type NumericDriverField =
  | "fsHz"
  | "qts"
  | "qes"
  | "qms"
  | "vasL"
  | "sdCm2"
  | "reOhm"
  | "leMh"
  | "xmaxMm"
  | "peW"
  | "sensitivityDb"
  | "mmsG"
  | "cmsMmN"
  | "blTm";

interface FormulaModes {
  mechanical?: MechanicalDerivedField;
  motor?: MotorDerivedField;
  quality?: QualityDerivedField;
}

const AIR_DENSITY = 1.204;
const SPEED_OF_SOUND = 343;
const NUMERIC_FIELDS: NumericDriverField[] = [
  "fsHz",
  "qts",
  "qes",
  "qms",
  "vasL",
  "sdCm2",
  "reOhm",
  "leMh",
  "xmaxMm",
  "peW",
  "sensitivityDb",
  "mmsG",
  "cmsMmN",
  "blTm",
];

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function complianceMmNFromFsMms(fsHz: number, mmsG: number): number {
  const omegaS = Math.PI * 2 * fsHz;
  return roundTo(1000 / (omegaS * omegaS * (mmsG / 1000)), 4);
}

function vasFromComplianceSd(cmsMmN: number, sdCm2: number): number {
  const cmsMN = cmsMmN / 1000;
  const sdM2 = sdCm2 / 10000;
  return roundTo(cmsMN * AIR_DENSITY * SPEED_OF_SOUND * SPEED_OF_SOUND * sdM2 * sdM2 * 1000, 4);
}

function createDriver(): SpeakerDriver {
  const fsHz = 40;
  const mmsG = 20;
  const sdCm2 = 136;
  const qes = 0.5;
  const qms = 2;
  const cmsMmN = complianceMmNFromFsMms(fsHz, mmsG);
  const driver: SpeakerDriver = {
    id: "test-driver",
    name: "Test driver",
    fsHz,
    qts: 0.4,
    qes,
    qms,
    vasL: vasFromComplianceSd(cmsMmN, sdCm2),
    sdCm2,
    reOhm: 6,
    leMh: 0.25,
    xmaxMm: 6,
    peW: 70,
    sensitivityDb: 86,
    mmsG,
    cmsMmN,
  };
  return {
    ...driver,
    blTm: deriveMotorField(driver, "blTm"),
    qts: deriveQualityField(driver, "qts") ?? driver.qts,
  };
}

function withManualValue<Key extends NumericDriverField>(
  driver: SpeakerDriver,
  key: Key,
  value: NonNullable<SpeakerDriver[Key]>,
): SpeakerDriver {
  return { ...driver, [key]: value };
}

function cascade<Key extends NumericDriverField>(
  driver: SpeakerDriver,
  key: Key,
  value: NonNullable<SpeakerDriver[Key]>,
  modes: FormulaModes,
): SpeakerDriver {
  return reconcileDriverDerivedFields(
    withManualValue(driver, key, value),
    key,
    modes.mechanical,
    modes.motor,
    modes.quality,
  );
}

function changedNumericFields(before: SpeakerDriver, after: SpeakerDriver): NumericDriverField[] {
  return NUMERIC_FIELDS.filter((field) => before[field] !== after[field]);
}

function expectChangedFields(
  before: SpeakerDriver,
  after: SpeakerDriver,
  expected: NumericDriverField[],
): void {
  expect(changedNumericFields(before, after).sort()).toEqual([...expected].sort());
}

describe("driver derivation cascades", () => {
  it.each([
    {
      key: "fsHz",
      value: 45,
      modes: { mechanical: "mmsG", motor: "qes", quality: "qts" },
      changed: ["fsHz", "mmsG", "qes", "qts"],
    },
    {
      key: "qts",
      value: 0.45,
      modes: { quality: "qes", motor: "blTm" },
      changed: ["qts", "qes", "blTm"],
    },
    {
      key: "qes",
      value: 0.6,
      modes: { quality: "qts", motor: "blTm" },
      changed: ["qts", "qes", "blTm"],
    },
    {
      key: "qms",
      value: 3,
      modes: { quality: "qes", motor: "blTm" },
      changed: ["qes", "qms", "blTm"],
    },
    {
      key: "vasL",
      value: 14,
      modes: { mechanical: "mmsG", motor: "qes", quality: "qts" },
      changed: ["vasL", "mmsG", "qes", "qts"],
    },
    {
      key: "sdCm2",
      value: 160,
      modes: { mechanical: "mmsG", motor: "qes", quality: "qts" },
      changed: ["sdCm2", "mmsG", "qes", "qts"],
    },
    {
      key: "reOhm",
      value: 7.2,
      modes: { motor: "qes", quality: "qts" },
      changed: ["reOhm", "qes", "qts"],
    },
    {
      key: "mmsG",
      value: 24,
      modes: { mechanical: "cmsMmN", motor: "qes", quality: "qts" },
      changed: ["mmsG", "cmsMmN", "qes", "qts"],
    },
    {
      key: "cmsMmN",
      value: 0.65,
      modes: { mechanical: "mmsG", motor: "qes", quality: "qts" },
      changed: ["mmsG", "cmsMmN", "qes", "qts"],
    },
    {
      key: "blTm",
      value: 7,
      modes: { motor: "qes", quality: "qts" },
      changed: ["qts", "qes", "blTm"],
    },
  ] satisfies Array<{
    key: NumericDriverField;
    value: number;
    modes: FormulaModes;
    changed: NumericDriverField[];
  }>)("updates the configured cascade when $key is edited", ({ key, value, modes, changed }) => {
    const before = createDriver();
    const after = cascade(before, key, value, modes);

    expect(after[key]).toBe(value);
    expectChangedFields(before, after, changed);
  });

  it.each([
    { key: "leMh", value: 0.6 },
    { key: "xmaxMm", value: 8 },
    { key: "peW", value: 100 },
    { key: "sensitivityDb", value: 88 },
  ] satisfies Array<{ key: NumericDriverField; value: number }>)(
    "does not start a T/S cascade when $key is edited",
    ({ key, value }) => {
      const before = createDriver();
      const after = cascade(before, key, value, {
        mechanical: "cmsMmN",
        motor: "qes",
        quality: "qts",
      });

      expect(after[key]).toBe(value);
      expectChangedFields(before, after, [key]);
    },
  );

  it("keeps a manually edited active derived field and only updates downstream fields", () => {
    const before = createDriver();
    const after = cascade(before, "qes", 0.61, { motor: "qes", quality: "qts" });

    expect(after.qes).toBe(0.61);
    expectChangedFields(before, after, ["qes", "qts"]);
  });

  it("prompts from fields that changed through the cascade, not only from the manual field", () => {
    const before = createDriver();
    const after = cascade(before, "qms", 3, { quality: "qes" });
    const changedFields = changedDriverFormulaFields(before, after, "qms");
    const promptedBl = deriveMotorField(after, "blTm");
    const promptedQts = deriveQualityField(after, "qts");

    expect(changedFields).toEqual(["qms", "qes"]);
    expect(driverFormulaPromptForChangedFields(changedFields, "blTm")).toBe("motor");
    expect(promptedBl).toBeDefined();
    expect(driverFormulaValueDiffers(after.blTm, promptedBl as number)).toBe(true);
    expect(promptedQts).toBeDefined();
    expect(driverFormulaValueDiffers(after.qts, promptedQts as number)).toBe(false);
  });
});
