import type { SpeakerDriver } from "./acoustics";

export const MECHANICAL_DERIVED_FIELDS = ["fsHz", "vasL", "sdCm2", "mmsG", "cmsMmN"] as const;
export const QUALITY_DERIVED_FIELDS = ["qts", "qes", "qms"] as const;
export const MOTOR_DERIVED_FIELDS = ["qes", "blTm"] as const;
export const DRIVER_FORMULA_FIELDS = ["fsHz", "qts", "qes", "qms", "vasL", "sdCm2", "reOhm", "mmsG", "cmsMmN", "blTm"] as const;

export type MechanicalDerivedField = (typeof MECHANICAL_DERIVED_FIELDS)[number];
export type QualityDerivedField = (typeof QUALITY_DERIVED_FIELDS)[number];
export type MotorDerivedField = (typeof MOTOR_DERIVED_FIELDS)[number];
export type DriverFormulaField = (typeof DRIVER_FORMULA_FIELDS)[number];
export type DriverFormulaKind = "mechanical" | "motor" | "quality";

const DRIVER_DERIVATION_AIR_DENSITY = 1.204;
const DRIVER_DERIVATION_SPEED_OF_SOUND = 343;

const mechanicalDerivedFieldSet = new Set<keyof SpeakerDriver>(MECHANICAL_DERIVED_FIELDS);
const motorDerivedFieldSet = new Set<keyof SpeakerDriver>(MOTOR_DERIVED_FIELDS);
const qualityDerivedFieldSet = new Set<keyof SpeakerDriver>(QUALITY_DERIVED_FIELDS);
const driverFormulaFieldSet = new Set<keyof SpeakerDriver>(DRIVER_FORMULA_FIELDS);
const motorFormulaFields = new Set<keyof SpeakerDriver>(["fsHz", "mmsG", "reOhm", "qes", "blTm"]);

const derivedFieldLimits = new Map<keyof SpeakerDriver, { min: number; max?: number }>([
  ["fsHz", { min: 1, max: 2000 }],
  ["qts", { min: 0.01, max: 5 }],
  ["qes", { min: 0.01, max: 10 }],
  ["qms", { min: 0.1, max: 100 }],
  ["vasL", { min: 0.01, max: 10000 }],
  ["sdCm2", { min: 0.1, max: 10000 }],
  ["mmsG", { min: 0.01, max: 10000 }],
  ["cmsMmN", { min: 0.0001, max: 1000 }],
  ["blTm", { min: 0.01, max: 100 }],
]);

export function deriveMechanicalField(
  driver: SpeakerDriver,
  target: MechanicalDerivedField,
  changedKey?: keyof SpeakerDriver,
): number | undefined {
  const fsHz = positiveNumber(driver.fsHz);
  const vasL = positiveNumber(driver.vasL);
  const sdCm2 = positiveNumber(driver.sdCm2);
  const mmsG = positiveNumber(driver.mmsG);
  const cmsMmN = positiveNumber(driver.cmsMmN);

  if (target === "mmsG") {
    if (fsHz === undefined) {
      return undefined;
    }
    const cms = complianceForDriver(
      driver,
      changedKey === "fsHz" || changedKey === "mmsG" ? undefined : changedKey,
    );
    if (cms === undefined) {
      return undefined;
    }
    const omegaS = Math.PI * 2 * fsHz;
    return normalizeDerivedDriverValue(target, 1000 / (omegaS * omegaS * cms));
  }

  if (target === "fsHz") {
    if (mmsG === undefined) {
      return undefined;
    }
    const cms = complianceForDriver(
      driver,
      changedKey === "fsHz" || changedKey === "mmsG" ? undefined : changedKey,
    );
    if (cms === undefined) {
      return undefined;
    }
    const fs = 1 / (Math.PI * 2 * Math.sqrt((mmsG / 1000) * cms));
    return normalizeDerivedDriverValue(target, fs);
  }

  if (target === "vasL") {
    if (sdCm2 === undefined) {
      return undefined;
    }
    const cms = complianceForDriver(driver, changedKey, "resonanceFirst");
    if (cms === undefined) {
      return undefined;
    }
    const sdM2 = sdCm2 / 10000;
    const vasLValue = cms *
      DRIVER_DERIVATION_AIR_DENSITY *
      DRIVER_DERIVATION_SPEED_OF_SOUND *
      DRIVER_DERIVATION_SPEED_OF_SOUND *
      sdM2 *
      sdM2 *
      1000;
    return normalizeDerivedDriverValue(target, vasLValue);
  }

  if (target === "sdCm2") {
    if (vasL === undefined) {
      return undefined;
    }
    const cms = complianceForDriver(driver, changedKey, "resonanceFirst");
    if (cms === undefined) {
      return undefined;
    }
    const vasM3 = vasL / 1000;
    const denominator = cms *
      DRIVER_DERIVATION_AIR_DENSITY *
      DRIVER_DERIVATION_SPEED_OF_SOUND *
      DRIVER_DERIVATION_SPEED_OF_SOUND;
    const sdM2 = denominator > 0 ? Math.sqrt(vasM3 / denominator) : Number.NaN;
    return normalizeDerivedDriverValue(target, sdM2 * 10000);
  }

  if (changedKey === "fsHz" || changedKey === "mmsG") {
    const resonanceCms = complianceFromFsMms(fsHz, mmsG);
    if (resonanceCms !== undefined) {
      return normalizeDerivedDriverValue(target, resonanceCms * 1000);
    }
  }
  const acousticCms = vasL !== undefined && sdCm2 !== undefined
    ? complianceFromVasSd(vasL, sdCm2)
    : undefined;
  if (acousticCms !== undefined) {
    return normalizeDerivedDriverValue(target, acousticCms * 1000);
  }
  const resonanceCms = cmsMmN !== undefined
    ? cmsMmN / 1000
    : complianceFromFsMms(fsHz, mmsG);
  return resonanceCms !== undefined ? normalizeDerivedDriverValue(target, resonanceCms * 1000) : undefined;
}

export function deriveMotorField(driver: SpeakerDriver, target: MotorDerivedField): number | undefined {
  const fsHz = positiveNumber(driver.fsHz);
  const mmsG = positiveNumber(driver.mmsG);
  const reOhm = positiveNumber(driver.reOhm);
  if (target === "qes") {
    const blTm = positiveNumber(driver.blTm);
    if (fsHz === undefined || mmsG === undefined || reOhm === undefined || blTm === undefined) {
      return undefined;
    }
    const qes = (Math.PI * 2 * fsHz * (mmsG / 1000) * reOhm) / (blTm * blTm);
    return normalizeDerivedDriverValue(target, qes);
  }

  if (target !== "blTm") {
    return undefined;
  }
  const qes = positiveNumber(driver.qes);
  if (fsHz === undefined || mmsG === undefined || reOhm === undefined || qes === undefined) {
    return undefined;
  }
  const bl = Math.sqrt((Math.PI * 2 * fsHz * (mmsG / 1000) * reOhm) / qes);
  return normalizeDerivedDriverValue(target, bl);
}

export function deriveQualityField(driver: SpeakerDriver, target: QualityDerivedField): number | undefined {
  if (target === "qts") {
    const qes = positiveNumber(driver.qes);
    const qms = positiveNumber(driver.qms);
    if (qes === undefined || qms === undefined) {
      return undefined;
    }
    return normalizeDerivedDriverValue(target, (qes * qms) / (qes + qms));
  }

  if (target === "qes") {
    const qts = positiveNumber(driver.qts);
    const qms = positiveNumber(driver.qms);
    if (qts === undefined || qms === undefined || qms <= qts) {
      return undefined;
    }
    return normalizeDerivedDriverValue(target, 1 / (1 / qts - 1 / qms));
  }

  const qts = positiveNumber(driver.qts);
  const qes = positiveNumber(driver.qes);
  if (qts === undefined || qes === undefined || qes <= qts) {
    return undefined;
  }
  return normalizeDerivedDriverValue(target, 1 / (1 / qts - 1 / qes));
}

export function reconcileMechanicalDerivedField(
  driver: SpeakerDriver,
  target?: MechanicalDerivedField,
  changedKey?: keyof SpeakerDriver,
): SpeakerDriver {
  if (target === undefined) {
    return driver;
  }
  if (changedKey !== undefined && (changedKey === target || !isMechanicalDerivedField(changedKey))) {
    return driver;
  }

  const derivedValue = deriveMechanicalField(driver, target, changedKey);
  if (derivedValue === undefined) {
    return driver;
  }
  return { ...driver, [target]: derivedValue };
}

export function reconcileMotorDerivedField(
  driver: SpeakerDriver,
  target?: MotorDerivedField,
  changedKey?: keyof SpeakerDriver,
): SpeakerDriver {
  if (target === undefined) {
    return driver;
  }
  if (changedKey !== undefined && (changedKey === target || !motorFormulaFields.has(changedKey))) {
    return driver;
  }

  const derivedValue = deriveMotorField(driver, target);
  if (derivedValue === undefined) {
    return driver;
  }
  return { ...driver, [target]: derivedValue };
}

export function reconcileQualityDerivedField(
  driver: SpeakerDriver,
  target?: QualityDerivedField,
  changedKey?: keyof SpeakerDriver,
): SpeakerDriver {
  if (target === undefined) {
    return driver;
  }
  if (changedKey !== undefined && (changedKey === target || !isQualityDerivedField(changedKey))) {
    return driver;
  }

  const derivedValue = deriveQualityField(driver, target);
  if (derivedValue === undefined) {
    return driver;
  }
  return { ...driver, [target]: derivedValue };
}

export function reconcileDriverDerivedFields(
  driver: SpeakerDriver,
  changedKey: keyof SpeakerDriver,
  mechanicalDerivedField?: MechanicalDerivedField,
  motorDerivedField?: MotorDerivedField,
  qualityDerivedField?: QualityDerivedField,
): SpeakerDriver {
  const mechanicalDriver = reconcileMechanicalDerivedField(driver, mechanicalDerivedField, changedKey);
  const downstreamChangedKey = mechanicalDriver === driver ? changedKey : undefined;

  if (motorDerivedField === "qes") {
    const motorDriver = reconcileMotorDerivedField(mechanicalDriver, motorDerivedField, downstreamChangedKey);
    const qualityChangedKey = motorDriver === mechanicalDriver ? downstreamChangedKey : "qes";
    return reconcileQualityDerivedField(motorDriver, qualityDerivedField, qualityChangedKey);
  }

  const qualityDriver = reconcileQualityDerivedField(mechanicalDriver, qualityDerivedField, downstreamChangedKey);
  const motorChangedKey = qualityDriver === mechanicalDriver
    ? downstreamChangedKey
    : qualityDerivedField === "qes"
      ? "qes"
      : downstreamChangedKey;
  return reconcileMotorDerivedField(qualityDriver, motorDerivedField, motorChangedKey);
}

export function isMechanicalDerivedField(value: unknown): value is MechanicalDerivedField {
  return typeof value === "string" && mechanicalDerivedFieldSet.has(value as keyof SpeakerDriver);
}

export function isMotorDerivedField(value: unknown): value is MotorDerivedField {
  return typeof value === "string" && motorDerivedFieldSet.has(value as keyof SpeakerDriver);
}

export function isQualityDerivedField(value: unknown): value is QualityDerivedField {
  return typeof value === "string" && qualityDerivedFieldSet.has(value as keyof SpeakerDriver);
}

export function isDriverFormulaField(value: unknown): value is DriverFormulaField {
  return typeof value === "string" && driverFormulaFieldSet.has(value as keyof SpeakerDriver);
}

export function driverActiveFormulaForField(
  key: keyof SpeakerDriver,
  derivedFields: {
    mechanical?: MechanicalDerivedField;
    motor?: MotorDerivedField;
    quality?: QualityDerivedField;
  },
): DriverFormulaKind | undefined {
  if (isMechanicalDerivedField(key) && derivedFields.mechanical === key) {
    return "mechanical";
  }
  if (isMotorDerivedField(key) && derivedFields.motor === key) {
    return "motor";
  }
  if (isQualityDerivedField(key) && derivedFields.quality === key) {
    return "quality";
  }
  return undefined;
}

export function driverFormulaPromptForField(
  changedKey: keyof SpeakerDriver,
  candidateKey: keyof SpeakerDriver,
  derivedFields: {
    motor?: MotorDerivedField;
  } = {},
): DriverFormulaKind | undefined {
  if (candidateKey === changedKey) {
    return undefined;
  }
  if (isMechanicalDerivedField(candidateKey) && isMechanicalDerivedField(changedKey)) {
    return "mechanical";
  }
  if (isQualityDerivedField(candidateKey) && isQualityDerivedField(changedKey)) {
    return "quality";
  }
  if (
    isQualityDerivedField(candidateKey) &&
    candidateKey !== "qes" &&
    derivedFields.motor === "qes" &&
    motorFormulaFields.has(changedKey)
  ) {
    return "quality";
  }
  if (isMotorDerivedField(candidateKey) && motorFormulaFields.has(changedKey)) {
    return "motor";
  }
  return undefined;
}

export function driverFormulaPromptForChangedFields(
  changedKeys: readonly (keyof SpeakerDriver)[],
  candidateKey: keyof SpeakerDriver,
  derivedFields: {
    motor?: MotorDerivedField;
  } = {},
): DriverFormulaKind | undefined {
  return driverFormulaPromptSourceForChangedFields(changedKeys, candidateKey, derivedFields)?.formula;
}

export function driverFormulaPromptSourceForChangedFields(
  changedKeys: readonly (keyof SpeakerDriver)[],
  candidateKey: keyof SpeakerDriver,
  derivedFields: {
    motor?: MotorDerivedField;
  } = {},
): { changedKey: keyof SpeakerDriver; formula: DriverFormulaKind } | undefined {
  if (changedKeys.includes(candidateKey)) {
    return undefined;
  }
  for (const changedKey of changedKeys) {
    const prompt = driverFormulaPromptForField(changedKey, candidateKey, derivedFields);
    if (prompt !== undefined) {
      return { changedKey, formula: prompt };
    }
  }
  return undefined;
}

export function changedDriverFormulaFields(
  before: SpeakerDriver,
  after: SpeakerDriver,
  changedKey: keyof SpeakerDriver,
): Array<keyof SpeakerDriver> {
  const changedFields = DRIVER_FORMULA_FIELDS.filter((field) => before[field] !== after[field]);
  if (isDriverFormulaField(changedKey) && before[changedKey] !== after[changedKey]) {
    return [changedKey, ...changedFields.filter((field) => field !== changedKey)];
  }
  return changedFields;
}

export function driverFormulaValueDiffers(currentValue: unknown, derivedValue: number): boolean {
  if (typeof currentValue !== "number" || !Number.isFinite(currentValue)) {
    return true;
  }
  return Math.abs(currentValue - derivedValue) > Math.max(1e-6, Math.abs(currentValue) * 1e-6);
}

export function defaultFormulaForField(
  field: MechanicalDerivedField | MotorDerivedField | QualityDerivedField,
): DriverFormulaKind {
  if (isMechanicalDerivedField(field)) {
    return "mechanical";
  }
  if (isQualityDerivedField(field)) {
    return "quality";
  }
  return "motor";
}

export function defaultDerivedFieldValue(driver: SpeakerDriver, key: keyof SpeakerDriver): number | undefined {
  if (isMechanicalDerivedField(key)) {
    return deriveMechanicalField(driver, key);
  }
  if (isQualityDerivedField(key)) {
    return deriveQualityField(driver, key);
  }
  if (isMotorDerivedField(key)) {
    return deriveMotorField(driver, key);
  }
  return undefined;
}

export function deriveDriverFormulaValue(
  driver: SpeakerDriver,
  key: keyof SpeakerDriver,
  formula: DriverFormulaKind,
): number | undefined {
  if (formula === "mechanical" && isMechanicalDerivedField(key)) {
    return deriveMechanicalField(driver, key);
  }
  if (formula === "quality" && isQualityDerivedField(key)) {
    return deriveQualityField(driver, key);
  }
  if (formula === "motor" && isMotorDerivedField(key)) {
    return deriveMotorField(driver, key);
  }
  return undefined;
}

function complianceForDriver(
  driver: SpeakerDriver,
  changedKey?: keyof SpeakerDriver,
  priority: "explicitFirst" | "resonanceFirst" = "explicitFirst",
): number | undefined {
  const fsHz = positiveNumber(driver.fsHz);
  const mmsG = positiveNumber(driver.mmsG);
  const cmsMmN = positiveNumber(driver.cmsMmN);
  const vasL = positiveNumber(driver.vasL);
  const sdCm2 = positiveNumber(driver.sdCm2);
  const explicitCms = cmsMmN !== undefined ? cmsMmN / 1000 : undefined;
  const resonanceCms = complianceFromFsMms(fsHz, mmsG);
  const acousticCms = vasL !== undefined && sdCm2 !== undefined ? complianceFromVasSd(vasL, sdCm2) : undefined;

  if (changedKey === "cmsMmN") {
    return explicitCms ?? acousticCms ?? resonanceCms;
  }
  if (changedKey === "fsHz" || changedKey === "mmsG") {
    return resonanceCms ?? explicitCms ?? acousticCms;
  }
  if (changedKey === "vasL" || changedKey === "sdCm2") {
    return acousticCms ?? explicitCms ?? resonanceCms;
  }
  if (priority === "resonanceFirst") {
    return resonanceCms ?? explicitCms ?? acousticCms;
  }
  return explicitCms ?? acousticCms ?? resonanceCms;
}

function complianceFromVasSd(vasL: number, sdCm2: number): number | undefined {
  const vasM3 = vasL / 1000;
  const sdM2 = sdCm2 / 10000;
  const cms = vasM3 /
    (DRIVER_DERIVATION_AIR_DENSITY * DRIVER_DERIVATION_SPEED_OF_SOUND * DRIVER_DERIVATION_SPEED_OF_SOUND * sdM2 * sdM2);
  return Number.isFinite(cms) && cms > 0 ? cms : undefined;
}

function complianceFromFsMms(fsHz?: number, mmsG?: number): number | undefined {
  if (fsHz === undefined || mmsG === undefined || fsHz <= 0 || mmsG <= 0) {
    return undefined;
  }
  const omegaS = Math.PI * 2 * fsHz;
  const cms = 1 / (omegaS * omegaS * (mmsG / 1000));
  return Number.isFinite(cms) && cms > 0 ? cms : undefined;
}

function normalizeDerivedDriverValue(
  key: MechanicalDerivedField | MotorDerivedField | QualityDerivedField,
  value: number,
): number | undefined {
  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  const limits = derivedFieldLimits.get(key);
  const clamped = limits ? clampNumber(value, limits.min, limits.max ?? Number.POSITIVE_INFINITY) : value;
  return roundTo(clamped, 4);
}

export function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
