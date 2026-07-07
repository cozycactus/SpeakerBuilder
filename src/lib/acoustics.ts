export type BoxKind =
  | "sealed"
  | "vented"
  | "passive"
  | "aperiodic"
  | "infinite"
  | "bandpass";

export interface SpeakerDriver {
  id: string;
  name: string;
  fsHz: number;
  qts: number;
  qes?: number;
  qms?: number;
  vasL: number;
  sdCm2: number;
  reOhm: number;
  leMh?: number;
  xmaxMm?: number;
  peW?: number;
  sensitivityDb?: number;
  mmsG?: number;
  cmsMmN?: number;
  blTm?: number;
  source?: DriverSource;
}

export type DriverSourceNote = "usherPeRms" | "sbXmaxPeakToPeak" | "modifiedFromDatasheet";

export interface DriverSource {
  title: string;
  url?: string;
  verified?: boolean;
  modified?: boolean;
  notes?: DriverSourceNote[];
}

export interface BoxDesign {
  id: string;
  name: string;
  kind: BoxKind;
  enabled: boolean;
  vbLiters: number;
  fbHz?: number;
  ql?: number;
  bandpassRearLiters?: number;
  bandpassFrontLiters?: number;
  aperiodicMode?: AperiodicMode;
  aperiodicMaterial?: AperiodicMaterial;
  aperiodicThicknessMm?: number;
  flowResistivityPaSecM2?: number;
  passiveRadiatorSdCm2?: number;
  passiveRadiatorMmsG?: number;
  passiveRadiatorQms?: number;
  passiveRadiatorXmaxMm?: number;
  passiveRadiatorCount?: number;
  portShape?: "round" | "slot";
  portDiameterCm?: number;
  portWidthCm?: number;
  portHeightCm?: number;
  portCount?: number;
  color: string;
}

export type AperiodicMode = "flow" | "ql";
export type AperiodicMaterial = "foam" | "felt" | "denseFelt" | "custom";
export type SplInputMode = "oneWatt" | "twoPointEightThreeVolt" | "nominalPower" | "rePower";

export interface SimulationOptions {
  frequencyMaxHz?: number;
  powerW: number;
  splInputMode?: SplInputMode;
  outputs?: SimulationOutput[];
}

export type SimulationOutput =
  | "response"
  | "spl"
  | "phase"
  | "groupDelay"
  | "excursion"
  | "port"
  | "impedance"
  | "impulse"
  | "step"
  | "metrics";

export type OptimizerGoal = "balanced" | "flat" | "deep" | "compact" | "transient" | "output";

export interface Point {
  x: number;
  y: number;
}

export type MeasurementTraceKind = "frd" | "zma";

export interface ParsedMeasurementTrace {
  kind: MeasurementTraceKind;
  name: string;
  points: Point[];
}

export type SealedZmaEstimateQuality = "good" | "fair" | "poor";

export interface SealedZmaEstimate {
  baselineOhm: number;
  confidence: SealedZmaEstimateQuality;
  f1Hz?: number;
  f2Hz?: number;
  fcHz: number;
  qec?: number;
  qmc?: number;
  qtc?: number;
  reOhm: number;
  responseDb: Point[];
  targetOhm?: number;
  zMaxOhm: number;
}

export interface SealedBoxTsEstimate {
  alpha: number;
  fcFromTsHz: number;
  qtcFromTs?: number;
  qts?: number;
  vasL: number;
}

export interface AddedMassTsEstimate {
  cmsMmN: number;
  fmHz: number;
  massRatio: number;
  mmsG: number;
  vasL?: number;
}

export interface FreeAirTsEstimate {
  baselineReOhm: number;
  fsHz: number;
  peakRatio: number;
  qes: number;
  qms: number;
  qts: number;
  reOhm: number;
  zMaxOhm: number;
}

export type SplLimitReason = "xmax" | "passive" | "port" | "power";

export interface SimulationResult {
  design: BoxDesign;
  responseDb: Point[];
  splDb: Point[];
  phaseDeg: Point[];
  groupDelayMs: Point[];
  excursionMm: Point[];
  passiveRadiatorExcursionMm: Point[];
  portMach: Point[];
  impedanceOhm: Point[];
  impulse: Point[];
  step: Point[];
  metrics: {
    f3Hz?: number;
    f6Hz?: number;
    peakDb: number;
    peakHz: number;
    currentMaxSplDb: number;
    currentMaxSplHz: number;
    spl50HzDb?: number;
    spl80HzDb?: number;
    maxUsableSplDb?: number;
    maxUsableSplHz?: number;
    maxUsableSplReason?: SplLimitReason;
    maxSplByExcursionDb?: number;
    maxSplByPortDb?: number;
    maxSplByPowerDb?: number;
    groupDelay30Ms?: number;
    groupDelay40Ms?: number;
    groupDelayAtF3Ms?: number;
    maxExcursionMm: number;
    maxExcursionHz: number;
    maxPassiveRadiatorExcursionMm?: number;
    maxPassiveRadiatorExcursionHz?: number;
    passiveRadiatorTuningHz?: number;
    maxPortMach?: number;
    portLengthCm?: number;
    portResonanceHz?: number;
    minImpedanceOhm: number;
    qtc?: number;
    fcHz?: number;
    effectiveQ?: number;
    impedancePeakOhm?: number;
    impedancePeakReductionDb?: number;
    notes: string[];
  };
}

export interface OptimizerCandidate {
  id: string;
  design: BoxDesign;
  flatnessDb: number;
  result: SimulationResult;
  score: number;
}

interface Complex {
  re: number;
  im: number;
}

interface DerivedDriver {
  fsHz: number;
  qts: number;
  qes: number;
  qms: number;
  vasM3: number;
  sdM2: number;
  reOhm: number;
  leH: number;
  xmaxM?: number;
  peW?: number;
  cms: number;
  mms: number;
  rms: number;
  bl: number;
  warnings: string[];
}

interface ResponseAtFrequency {
  acoustic: Complex;
  coneVelocity: Complex;
  portVolumeVelocity: Complex;
  inputImpedance: Complex;
}

interface SplLimitPoint {
  db: number;
  frequency: number;
  reason: SplLimitReason;
}

interface SplLimitSummary {
  excursion?: SplLimitPoint;
  passive?: SplLimitPoint;
  port?: SplLimitPoint;
  power?: SplLimitPoint;
  usable?: SplLimitPoint;
}

const RHO = 1.204;
const SPEED_OF_SOUND = 343;
// SPL at 1 m produced by 1 W of acoustic power radiating into half space:
// I = P / (2*pi*r^2), p = sqrt(I*rho*c), SPL = 20*log10(p / 20 uPa) ~ 112 dB.
// Small cites this watts-to-SPL conversion (Beranek, Acoustics, p. 14) for the
// dual scale of Part I Fig. 11; a system passband therefore sits at
// HALF_SPACE_SPL_1W_DB + 10*log10(eta0 * Pe).
const HALF_SPACE_SPL_1W_DB = 112.02;
const TWO_PI = Math.PI * 2;
const REFERENCE_PRESSURE_PA = 20e-6;
const SPL_DISTANCE_M = 1;
const PORT_LIMIT_MACH = 0.16;
const DEFAULT_SPL_INPUT_MODE: SplInputMode = "rePower";
export const DEFAULT_FREQUENCY_MAX_HZ = 500;
export const MIN_FREQUENCY_MAX_HZ = 100;
export const MAX_FREQUENCY_MAX_HZ = 20000;
const DEFAULT_SIMULATION_OUTPUTS: SimulationOutput[] = [
  "response",
  "spl",
  "phase",
  "groupDelay",
  "excursion",
  "port",
  "impedance",
  "metrics",
];

export const FREQUENCIES = logspace(10, DEFAULT_FREQUENCY_MAX_HZ, 220);

export const DESIGN_COLORS = [
  "#0f766e",
  "#c2410c",
  "#4338ca",
  "#b45309",
  "#be123c",
  "#047857",
  "#7c3aed",
  "#0369a1",
  "#a21caf",
  "#4d7c0f",
];

export const APERIODIC_MATERIALS: Record<AperiodicMaterial, { flowResistivityPaSecM2: number; label: string }> = {
  foam: { flowResistivityPaSecM2: 3000, label: "Open-cell foam" },
  felt: { flowResistivityPaSecM2: 8000, label: "Felt" },
  denseFelt: { flowResistivityPaSecM2: 18000, label: "Dense felt" },
  custom: { flowResistivityPaSecM2: 8000, label: "Custom" },
};

export interface DriveInput {
  electricalPowerW: number;
  nominalOhm: number;
  voltageRms: number;
}

export const PRESET_DRIVERS: SpeakerDriver[] = [
  {
    id: "midwoofer-65",
    name: "6.5 inch midwoofer",
    fsHz: 42,
    qts: 0.38,
    qes: 0.43,
    qms: 5.2,
    vasL: 24,
    sdCm2: 132,
    reOhm: 5.8,
    leMh: 0.45,
    xmaxMm: 5,
    peW: 80,
  },
  {
    id: "woofer-10",
    name: "10 inch woofer",
    fsHz: 27,
    qts: 0.34,
    qes: 0.38,
    qms: 4.5,
    vasL: 92,
    sdCm2: 346,
    reOhm: 6.1,
    leMh: 1.05,
    xmaxMm: 8,
    peW: 180,
  },
  {
    id: "subwoofer-12",
    name: "12 inch subwoofer",
    fsHz: 22,
    qts: 0.41,
    qes: 0.47,
    qms: 6.1,
    vasL: 138,
    sdCm2: 530,
    reOhm: 3.6,
    leMh: 1.7,
    xmaxMm: 14,
    peW: 500,
  },
  {
    id: "usher-8945p",
    name: "Usher 8945P",
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
    source: {
      title: "Usher 8945P",
      url: "https://www.audioalchemy.ro/difuzoare/usher/296-602.pdf",
      verified: true,
      notes: ["usherPeRms"],
    },
  },
  {
    id: "dayton-rs180-8",
    name: "Dayton Audio RS180-8",
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
    source: {
      title: "Dayton Audio RS180-8",
      url: "https://www.daytonaudio.com/images/resources/295-355--dayton-audio-rs180-8-reference-woofer-8-ohm-specifications.pdf",
      verified: true,
    },
  },
  {
    id: "sb17nrxc35-8",
    name: "SB Acoustics SB17NRXC35-8",
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
    source: {
      title: "SB Acoustics SB17NRXC35-8",
      url: "https://sbacoustics.com/product/6in-sb17nrxc35-8/",
      verified: true,
      notes: ["sbXmaxPeakToPeak"],
    },
  },
  {
    id: "scan-speak-18w-8545-01",
    name: "Scan-Speak 18W/8545-01",
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
    source: {
      title: "Scan-Speak 18W/8545-01",
      url: "https://www.scan-speak.dk/product/18w-8545-01/",
      verified: true,
    },
  },
];

export function createDefaultDesigns(driver: SpeakerDriver): BoxDesign[] {
  const sealedB2 = sealedForQtc(driver, 0.577);
  const sealedBw = sealedForQtc(driver, 0.707);
  const sealedCompact = sealedForQtc(driver, 0.9);
  const ventedBase = ventedBaseVolumeFactor(driver.qts);
  const passiveVb = driver.vasL * ventedBase * 1.2;
  const passiveFb = driver.fsHz * 0.78;
  const passiveSd = defaultPassiveRadiatorSdCm2(driver);
  const passiveCount = 1;

  const designs: BoxDesign[] = [
    {
      id: newId("sealed-bessel"),
      name: "Closed Bessel Qtc 0.58",
      kind: "sealed",
      enabled: true,
      vbLiters: sealedB2,
      color: DESIGN_COLORS[0],
    },
    {
      id: newId("sealed-butterworth"),
      name: "Closed Butterworth Qtc 0.71",
      kind: "sealed",
      enabled: true,
      vbLiters: sealedBw,
      color: DESIGN_COLORS[1],
    },
    {
      id: newId("vented-qb3"),
      name: "Vented QB3",
      kind: "vented",
      enabled: true,
      vbLiters: driver.vasL * ventedBase * 0.72,
      fbHz: driver.fsHz * 1.03,
      ql: 7,
      portDiameterCm: 7,
      portCount: 1,
      portShape: "round",
      color: DESIGN_COLORS[2],
    },
    {
      id: newId("vented-ebs"),
      name: "Vented EBS",
      kind: "vented",
      enabled: true,
      vbLiters: driver.vasL * ventedBase * 1.75,
      fbHz: driver.fsHz * 0.68,
      ql: 7,
      portDiameterCm: 8,
      portCount: 1,
      portShape: "round",
      color: DESIGN_COLORS[3],
    },
    {
      id: newId("sealed-compact"),
      name: "Closed compact Qtc 0.90",
      kind: "sealed",
      enabled: false,
      vbLiters: sealedCompact,
      color: DESIGN_COLORS[4],
    },
    {
      id: newId("vented-bb4"),
      name: "Vented BB4",
      kind: "vented",
      enabled: false,
      vbLiters: driver.vasL * ventedBase * 1.05,
      fbHz: driver.fsHz * 0.92,
      ql: 7,
      portDiameterCm: 7,
      portCount: 1,
      portShape: "round",
      color: DESIGN_COLORS[5],
    },
    {
      id: newId("vented-sbb4"),
      name: "Vented SBB4",
      kind: "vented",
      enabled: false,
      vbLiters: driver.vasL * ventedBase * 1.32,
      fbHz: driver.fsHz * 0.82,
      ql: 6,
      portDiameterCm: 8,
      portCount: 1,
      portShape: "round",
      color: DESIGN_COLORS[6],
    },
    {
      id: newId("passive-radiator"),
      name: "Passive radiator",
      kind: "passive",
      enabled: false,
      vbLiters: passiveVb,
      fbHz: passiveFb,
      ql: 9,
      passiveRadiatorSdCm2: passiveSd,
      passiveRadiatorMmsG: passiveRadiatorMassForTarget(driver, passiveVb, passiveFb, passiveSd, passiveCount),
      passiveRadiatorQms: 9,
      passiveRadiatorXmaxMm: defaultPassiveRadiatorXmaxMm(driver),
      passiveRadiatorCount: passiveCount,
      color: DESIGN_COLORS[7],
    },
    {
      id: newId("aperiodic"),
      name: "Aperiodic damped",
      kind: "aperiodic",
      enabled: false,
      vbLiters: sealedBw * 0.68,
      ql: 1.7,
      aperiodicMode: "flow",
      aperiodicMaterial: "felt",
      aperiodicThicknessMm: 8,
      flowResistivityPaSecM2: APERIODIC_MATERIALS.felt.flowResistivityPaSecM2,
      portShape: "round",
      portDiameterCm: aperiodicVentDiameterCm(driver),
      portCount: 1,
      color: DESIGN_COLORS[8],
    },
    {
      id: newId("bandpass"),
      name: "Bandpass 4th order",
      kind: "bandpass",
      enabled: false,
      vbLiters: Math.max(sealedBw * 1.1, driver.vasL * 0.3) + Math.max(sealedBw * 1.7, driver.vasL * 0.45),
      bandpassRearLiters: Math.max(sealedBw * 1.1, driver.vasL * 0.3),
      bandpassFrontLiters: Math.max(sealedBw * 1.7, driver.vasL * 0.45),
      fbHz: driver.fsHz * 1.55,
      ql: 7,
      portDiameterCm: 8,
      portCount: 1,
      portShape: "round",
      color: DESIGN_COLORS[9],
    },
  ];

  return designs.map((design) => {
    const bandpassRearLiters = design.bandpassRearLiters
      ? roundTo(design.bandpassRearLiters, 1)
      : undefined;
    const bandpassFrontLiters = design.bandpassFrontLiters
      ? roundTo(design.bandpassFrontLiters, 1)
      : undefined;
    return {
      ...design,
      vbLiters: bandpassRearLiters && bandpassFrontLiters
        ? roundTo(bandpassRearLiters + bandpassFrontLiters, 1)
        : roundTo(Math.max(0.5, design.vbLiters), 1),
      fbHz: design.fbHz ? roundTo(design.fbHz, 1) : undefined,
      bandpassRearLiters,
      bandpassFrontLiters,
    };
  });
}

export function createDesignFromTemplate(
  template: string,
  driver: SpeakerDriver,
  index: number,
): BoxDesign {
  const designs = createDefaultDesigns(driver);
  const byName = designs.find((design) => slug(design.name) === template);
  const base = byName ?? designs[0];
  return {
    ...base,
    id: newId(template),
    enabled: true,
    color: DESIGN_COLORS[index % DESIGN_COLORS.length],
  };
}

export function getDesignTemplates(driver: SpeakerDriver): BoxDesign[] {
  return createDefaultDesigns(driver).map((design) => ({ ...design, enabled: true }));
}

export function nominalImpedanceOhm(driver: SpeakerDriver): number {
  const re = Math.max(0.2, driver.reOhm);
  if (re <= 3.4) {
    return 4;
  }
  if (re <= 6.8) {
    return 8;
  }
  return 16;
}

export function resolveDriveInput(
  driver: SpeakerDriver,
  options: Pick<SimulationOptions, "powerW" | "splInputMode">,
): DriveInput {
  const reOhm = Math.max(0.2, driver.reOhm);
  const nominalOhm = nominalImpedanceOhm(driver);
  const powerW = Math.max(0.1, options.powerW);
  const mode = options.splInputMode ?? DEFAULT_SPL_INPUT_MODE;
  const voltageRms = mode === "oneWatt"
    ? Math.sqrt(reOhm)
    : mode === "twoPointEightThreeVolt"
      ? 2.83
      : mode === "nominalPower"
        ? Math.sqrt(powerW * nominalOhm)
        : Math.sqrt(powerW * reOhm);

  return {
    electricalPowerW: (voltageRms * voltageRms) / reOhm,
    nominalOhm,
    voltageRms,
  };
}

export function simulateDesign(
  driver: SpeakerDriver,
  design: BoxDesign,
  options: SimulationOptions,
): SimulationResult {
  const derived = deriveDriver(driver);
  const notes = [...derived.warnings];
  const outputs = new Set(options.outputs ?? DEFAULT_SIMULATION_OUTPUTS);
  const needsMetrics = outputs.has("metrics");
  const needsResponse = outputs.has("response") || needsMetrics;
  const needsSpl = outputs.has("spl") || needsMetrics;
  const needsPhase = outputs.has("phase") || outputs.has("groupDelay") || needsMetrics;
  const needsGroupDelay = outputs.has("groupDelay") || needsMetrics;
  const needsExcursion = outputs.has("excursion") || needsMetrics;
  const needsPort = outputs.has("port") || needsMetrics;
  const needsImpedance = outputs.has("impedance") || needsMetrics;
  const needsImpulse = outputs.has("impulse");
  const needsStep = outputs.has("step");
  const powerW = Math.max(0.1, options.powerW);
  const driveInput = resolveDriveInput(driver, {
    powerW,
    splInputMode: options.splInputMode,
  });
  const voltageRms = driveInput.voltageRms;
  const frequencies = simulationFrequencies(options.frequencyMaxHz);
  const raw = frequencies.map((frequency) => ({
    frequency,
    response: responseAtFrequency(derived, design, frequency),
  }));

  const refMagnitude = getReferenceMagnitude(raw.map((item) => ({
    frequency: item.frequency,
    magnitude: cabs(item.response.acoustic),
  })), design.kind);

  const responseDb = needsResponse
    ? raw.map((item) => ({
        x: item.frequency,
        y: db(cabs(item.response.acoustic) / refMagnitude),
      }))
    : [];
  const splDb = needsSpl
    ? raw.map((item) => ({
        x: item.frequency,
        y: splAtOneMeter(item.response.acoustic, voltageRms),
      }))
    : [];
  const rawFrequencies = raw.map((point) => point.frequency);
  const phaseRad = needsPhase ? unwrapPhase(raw.map((item) => carg(item.response.acoustic))) : [];
  const phaseDeg = outputs.has("phase")
    ? raw.map((item, index) => ({
        x: item.frequency,
        y: (phaseRad[index] * 180) / Math.PI,
      }))
    : [];
  const groupDelayMs = needsGroupDelay
    ? raw.map((item, index) => ({
        x: item.frequency,
        y: groupDelayAt(index, rawFrequencies, phaseRad),
      }))
    : [];
  const excursionMm = needsExcursion
    ? raw.map((item) => {
        const omega = TWO_PI * item.frequency;
        return {
          x: item.frequency,
          y: (cabs(item.response.coneVelocity) * voltageRms * 1000) / omega,
        };
      })
    : [];
  const portArea = getPortAreaM2(design);
  const portMach = needsPort
    ? raw.map((item) => {
        const velocity =
          (design.kind === "vented" || design.kind === "bandpass") && portArea > 0
            ? (cabs(item.response.portVolumeVelocity) * voltageRms) / portArea
            : 0;
        return { x: item.frequency, y: velocity / SPEED_OF_SOUND };
      })
    : [];
  const passiveRadiatorExcursionMm = needsExcursion
    ? raw.map((item) => {
        if (design.kind !== "passive") {
          return { x: item.frequency, y: 0 };
        }
        const omega = TWO_PI * item.frequency;
        const sdM2 = passiveRadiatorSdM2(derived, design);
        const count = passiveRadiatorCount(design);
        const volumeVelocityPerRadiator = (cabs(item.response.portVolumeVelocity) * voltageRms) / count;
        return {
          x: item.frequency,
          y: (volumeVelocityPerRadiator * 1000) / (Math.max(0.0001, sdM2) * omega),
        };
      })
    : [];
  const impedanceOhm = needsImpedance
    ? raw.map((item) => ({
        x: item.frequency,
        y: cabs(item.response.inputImpedance),
      }))
    : [];
  const transient = needsImpulse || needsStep ? createTransientResponse(derived, design, refMagnitude) : { impulse: [], step: [] };
  let f3Hz: number | undefined;
  let f6Hz: number | undefined;
  let peak = { x: 0, y: 0 };
  let currentMaxSpl = { x: 0, y: 0 };
  let spl50HzDb: number | undefined;
  let spl80HzDb: number | undefined;
  let splLimits: SplLimitSummary = {};
  let maxExcursion = { x: 0, y: 0 };
  let maxPassiveRadiatorExcursion = { x: 0, y: 0 };
  let maxPort = { x: 0, y: 0 };
  let minImpedance = { x: 0, y: 0 };
  let qtc: number | undefined;
  let fcHz: number | undefined;
  let effectiveQ: number | undefined;
  let impedancePeakOhm: number | undefined;
  let peakReductionDb: number | undefined;
  let portLengthCm: number | undefined;
  let portResonanceHz: number | undefined;
  let passiveRadiatorTuningHz: number | undefined;

  if (needsMetrics) {
    f3Hz = findCutoff(responseDb, -3);
    f6Hz = findCutoff(responseDb, -6);
    peak = maxPoint(responseDb, (point) => point.y);
    currentMaxSpl = maxPoint(splDb, (point) => point.y);
    spl50HzDb = valueAt(splDb, 50);
    spl80HzDb = valueAt(splDb, 80);
    maxExcursion = maxPoint(excursionMm, (point) => point.y);
    maxPassiveRadiatorExcursion = maxPoint(passiveRadiatorExcursionMm, (point) => point.y);
    maxPort = maxPoint(portMach, (point) => point.y);
    minImpedance = minPoint(impedanceOhm, (point) => point.y);
    splLimits = calculateSplLimits({
      design,
      driver,
      excursionMm,
      f3Hz,
      passiveRadiatorExcursionMm,
      portMach,
      powerW: driveInput.electricalPowerW,
      splDb,
    });
    qtc = design.kind === "sealed"
      ? sealedQtc(driver, design.vbLiters)
      : undefined;
    fcHz = qtc ? driver.fsHz * Math.sqrt(1 + driver.vasL / design.vbLiters) : undefined;
    portLengthCm = design.kind === "vented" || design.kind === "bandpass" ? portLength(design) : undefined;
    portResonanceHz = portLengthCm !== undefined && portLengthCm > 0
      ? roundTo(SPEED_OF_SOUND / (2 * (portLengthCm / 100)), 0)
      : undefined;
    passiveRadiatorTuningHz = design.kind === "passive"
      ? passiveRadiatorTuning(derived, design)
      : undefined;

    if (driver.xmaxMm && maxExcursion.y > driver.xmaxMm) {
      notes.push(`Xmax exceeded at ${roundTo(maxExcursion.x, 1)} Hz`);
    }
    if (
      design.kind === "passive" &&
      design.passiveRadiatorXmaxMm &&
      maxPassiveRadiatorExcursion.y > design.passiveRadiatorXmaxMm
    ) {
      notes.push(`Passive radiator Xmax exceeded at ${roundTo(maxPassiveRadiatorExcursion.x, 1)} Hz`);
    }
    if (design.kind === "aperiodic") {
      const impedanceSummary = aperiodicImpedanceSummary(derived, design, rawFrequencies);
      peakReductionDb = impedanceSummary.peakReductionDb;
      effectiveQ = impedanceSummary.effectiveQ;
      impedancePeakOhm = impedanceSummary.peakOhm;
    }
    if (design.kind === "bandpass") {
      notes.push("Bandpass models low-frequency band only");
    }
    if (driver.peW && driveInput.electricalPowerW > driver.peW) {
      notes.push(`Power exceeds Pe: ${roundTo(driveInput.electricalPowerW, 1)} W`);
    }
    if (splLimits.usable?.reason === "xmax") {
      notes.push(`Max SPL limited by Xmax at ${roundTo(splLimits.usable.frequency, 1)} Hz`);
    }
    if (splLimits.usable?.reason === "port") {
      notes.push(`Max SPL limited by port at ${roundTo(splLimits.usable.frequency, 1)} Hz`);
    }
    if (splLimits.usable?.reason === "passive") {
      notes.push(`Max SPL limited by passive radiator at ${roundTo(splLimits.usable.frequency, 1)} Hz`);
    }
    if (splLimits.usable?.reason === "power") {
      notes.push(`Max SPL limited by Pe at ${roundTo(splLimits.usable.frequency, 1)} Hz`);
    }
    if ((design.kind === "vented" || design.kind === "bandpass") && maxPort.y > PORT_LIMIT_MACH) {
      notes.push(`High vent air speed: Mach ${roundTo(maxPort.y, 2)}`);
    }
    if ((design.kind === "vented" || design.kind === "bandpass") && maxPort.y > 0.1 && maxPort.y <= PORT_LIMIT_MACH) {
      notes.push(`Port air speed near noise limit: Mach ${roundTo(maxPort.y, 2)}`);
    }
    if ((design.kind === "vented" || design.kind === "bandpass") && portLengthCm !== undefined && portLengthCm <= 1) {
      notes.push("Vent is too short for this diameter/tuning");
    }
    if (design.kind === "vented" || design.kind === "bandpass") {
      const pistonDiameterCm = Math.sqrt((Math.max(1, driver.sdCm2) * 4) / Math.PI);
      const portAreaM2 = getPortAreaM2(design);
      const equivalentPortDiameterCm = portAreaM2 > 0 ? Math.sqrt((portAreaM2 * 4) / Math.PI) * 100 : 0;
      const boxCubeSideCm = Math.cbrt(Math.max(0.001, design.vbLiters / 1000)) * 100;
      if (equivalentPortDiameterCm > 0 && equivalentPortDiameterCm < pistonDiameterCm * 0.22) {
        notes.push("Port diameter is small for cone area");
      }
      if (portLengthCm !== undefined && portLengthCm > 60) {
        notes.push("Port is very long for this box");
      }
      if (portLengthCm !== undefined && portLengthCm > boxCubeSideCm * 1.8) {
        notes.push("Port may not fit inside the box");
      }
      if ((design.portCount ?? 1) > 1 && portLengthCm !== undefined && portLengthCm > 40) {
        notes.push("Multiple ports make the tuning tube long");
      }
      if (portResonanceHz !== undefined && portResonanceHz < 700) {
        notes.push(`Low port resonance: ${roundTo(portResonanceHz, 0)} Hz`);
      }
    }
    if ((design.kind === "vented" || design.kind === "passive") && driver.qts > 0.58) {
      notes.push("High Qts driver may prefer sealed or aperiodic loading");
    }
    if (design.vbLiters <= 0 || Number.isNaN(design.vbLiters)) {
      notes.push("Invalid box volume");
    }
  }

  return {
    design,
    responseDb: outputs.has("response") || needsMetrics ? responseDb : [],
    splDb: outputs.has("spl") || needsMetrics ? splDb : [],
    phaseDeg,
    groupDelayMs: outputs.has("groupDelay") || needsMetrics ? groupDelayMs : [],
    excursionMm: outputs.has("excursion") || needsMetrics ? excursionMm : [],
    passiveRadiatorExcursionMm: outputs.has("excursion") || needsMetrics ? passiveRadiatorExcursionMm : [],
    portMach: outputs.has("port") || needsMetrics ? portMach : [],
    impedanceOhm: outputs.has("impedance") || needsMetrics ? impedanceOhm : [],
    impulse: needsImpulse ? transient.impulse : [],
    step: needsStep ? transient.step : [],
    metrics: {
      f3Hz,
      f6Hz,
      peakDb: peak.y,
      peakHz: peak.x,
      currentMaxSplDb: currentMaxSpl.y,
      currentMaxSplHz: currentMaxSpl.x,
      spl50HzDb,
      spl80HzDb,
      maxUsableSplDb: splLimits.usable?.db,
      maxUsableSplHz: splLimits.usable?.frequency,
      maxUsableSplReason: splLimits.usable?.reason,
      maxSplByExcursionDb: splLimits.excursion?.db,
      maxSplByPortDb: splLimits.port?.db,
      maxSplByPowerDb: splLimits.power?.db,
      groupDelay30Ms: needsMetrics ? valueAt(groupDelayMs, 30) : undefined,
      groupDelay40Ms: needsMetrics ? valueAt(groupDelayMs, 40) : undefined,
      groupDelayAtF3Ms: needsMetrics && f3Hz ? valueAt(groupDelayMs, f3Hz) : undefined,
      maxExcursionMm: maxExcursion.y,
      maxExcursionHz: maxExcursion.x,
      maxPassiveRadiatorExcursionMm: needsMetrics && design.kind === "passive" ? maxPassiveRadiatorExcursion.y : undefined,
      maxPassiveRadiatorExcursionHz: needsMetrics && design.kind === "passive" ? maxPassiveRadiatorExcursion.x : undefined,
      passiveRadiatorTuningHz,
      maxPortMach: needsMetrics && (design.kind === "vented" || design.kind === "bandpass") ? maxPort.y : undefined,
      portLengthCm,
      portResonanceHz,
      minImpedanceOhm: minImpedance.y,
      qtc,
      fcHz,
      effectiveQ,
      impedancePeakOhm,
      impedancePeakReductionDb: peakReductionDb,
      notes,
    },
  };
}

export function optimizeDesigns(
  driver: SpeakerDriver,
  powerW: number,
  goal: OptimizerGoal,
  splInputMode?: SplInputMode,
): OptimizerCandidate[] {
  const seenAlignments = new Set<string>();
  return createOptimizerDesigns(driver)
    .map((design) => {
      const result = simulateDesign(driver, design, { powerW, splInputMode });
      const flatnessDb = responseFlatness(result.responseDb);

      return {
        id: design.id,
        design,
        flatnessDb,
        result,
        score: scoreOptimizerCandidate(result, driver, goal, flatnessDb),
      };
    })
    .sort((left, right) => right.score - left.score)
    .filter((candidate) => {
      // Port variants of one alignment produce visually identical cards; keep the best-scored one.
      const { kind, vbLiters, fbHz, ql } = candidate.design;
      const key = `${kind}|${vbLiters}|${fbHz ?? ""}|${ql ?? ""}`;
      if (seenAlignments.has(key)) {
        return false;
      }
      seenAlignments.add(key);
      return true;
    })
    .slice(0, 8);
}

function createOptimizerDesigns(driver: SpeakerDriver): BoxDesign[] {
  const designs: BoxDesign[] = [];
  const addDesign = (design: Omit<BoxDesign, "color" | "enabled">) => {
    designs.push({
      ...design,
      color: DESIGN_COLORS[designs.length % DESIGN_COLORS.length],
      enabled: true,
      vbLiters: roundTo(Math.max(0.5, design.vbLiters), 1),
      fbHz: design.fbHz ? roundTo(design.fbHz, 1) : undefined,
      portDiameterCm: design.portDiameterCm ? roundTo(design.portDiameterCm, 1) : undefined,
      bandpassRearLiters: design.bandpassRearLiters ? roundTo(design.bandpassRearLiters, 1) : undefined,
      bandpassFrontLiters: design.bandpassFrontLiters ? roundTo(design.bandpassFrontLiters, 1) : undefined,
    });
  };

  for (const qtc of [0.58, 0.65, 0.707, 0.8, 0.9, 1]) {
    addDesign({
      id: `opt-sealed-${qtc}`,
      name: `Optimized sealed Qtc ${qtc.toFixed(2)}`,
      kind: "sealed",
      vbLiters: volumeForQtc(driver, qtc),
    });
  }

  for (const qtc of [0.68, 0.78, 0.88]) {
    for (const ql of [1.3, 1.8]) {
      addDesign({
        id: `opt-aperiodic-${qtc}-${ql}`,
        name: `Optimized aperiodic Qtc ${qtc.toFixed(2)}`,
        kind: "aperiodic",
        vbLiters: volumeForQtc(driver, qtc) * 0.72,
        ql,
        aperiodicMode: "flow",
        aperiodicMaterial: "felt",
        aperiodicThicknessMm: 8,
        flowResistivityPaSecM2: APERIODIC_MATERIALS.felt.flowResistivityPaSecM2,
        portDiameterCm: aperiodicVentDiameterCm(driver),
        portCount: 1,
      });
    }
  }

  const baseVolumeFactor = optimizerVentedBaseVolumeFactor(driver.qts);
  const pistonDiameterCm = Math.sqrt((Math.max(1, driver.sdCm2) * 4) / Math.PI);
  const basePortCm = clamp(roundTo(pistonDiameterCm * 0.32, 1), 4, 16);
  const portOptions = [
    { diameterCm: basePortCm, count: 1 },
    { diameterCm: clamp(roundTo(basePortCm * 1.25, 1), 4, 18), count: 1 },
    { diameterCm: basePortCm, count: 2 },
  ];

  for (const volumeFactor of [0.62, 0.82, 1.05, 1.34, 1.72]) {
    for (const fbRatio of [0.64, 0.76, 0.88, 1, 1.12]) {
      for (const port of portOptions) {
        addDesign({
          id: `opt-vented-${volumeFactor}-${fbRatio}-${port.diameterCm}-${port.count}`,
          name: "Optimized vented",
          kind: "vented",
          vbLiters: driver.vasL * baseVolumeFactor * volumeFactor,
          fbHz: driver.fsHz * fbRatio,
          ql: 7,
          portDiameterCm: port.diameterCm,
          portCount: port.count,
        });
      }
    }
  }

  for (const volumeFactor of [0.85, 1.25, 1.7]) {
    for (const fbRatio of [0.64, 0.78, 0.92]) {
      const vbLiters = driver.vasL * baseVolumeFactor * volumeFactor;
      const fbHz = driver.fsHz * fbRatio;
      const passiveSd = defaultPassiveRadiatorSdCm2(driver);
      const passiveCount = 1;
      addDesign({
        id: `opt-passive-${volumeFactor}-${fbRatio}`,
        name: "Optimized passive radiator",
        kind: "passive",
        vbLiters,
        fbHz,
        ql: 9,
        passiveRadiatorSdCm2: passiveSd,
        passiveRadiatorMmsG: passiveRadiatorMassForTarget(driver, vbLiters, fbHz, passiveSd, passiveCount),
        passiveRadiatorQms: 9,
        passiveRadiatorXmaxMm: defaultPassiveRadiatorXmaxMm(driver),
        passiveRadiatorCount: passiveCount,
      });
    }
  }

  const sealedBw = sealedForQtc(driver, 0.707);
  for (const rearFactor of [0.9, 1.3, 1.8]) {
    for (const frontFactor of [1.3, 1.9, 2.6]) {
      for (const fbRatio of [1.35, 1.65]) {
        const rear = Math.max(sealedBw * rearFactor, driver.vasL * 0.25 * rearFactor);
        const front = Math.max(sealedBw * frontFactor, driver.vasL * 0.3 * frontFactor);
        addDesign({
          id: `opt-bandpass-${rearFactor}-${frontFactor}-${fbRatio}`,
          name: "Optimized bandpass",
          kind: "bandpass",
          vbLiters: rear + front,
          bandpassRearLiters: rear,
          bandpassFrontLiters: front,
          fbHz: driver.fsHz * fbRatio,
          ql: 7,
          portDiameterCm: clamp(roundTo(pistonDiameterCm * 0.34, 1), 4, 16),
          portCount: 1,
        });
      }
    }
  }

  return designs;
}

function scoreOptimizerCandidate(
  result: SimulationResult,
  driver: SpeakerDriver,
  goal: OptimizerGoal,
  flatnessDb: number,
): number {
  const metrics = result.metrics;
  const targetF3 = Math.max(18, driver.fsHz * optimizerF3TargetFactor(goal));
  const f3Hz = metrics.f3Hz ?? 500;
  const f3Penalty = Math.max(0, (f3Hz - targetF3) / targetF3) * 45;
  const flatPenalty = flatnessDb * 9 + Math.max(0, metrics.peakDb) * 5;
  const volumePenalty = clamp((result.design.vbLiters / Math.max(1, driver.vasL)) * 22, 0, 70);
  const groupDelayMs = metrics.groupDelay40Ms ?? metrics.groupDelay30Ms ?? 0;
  const groupDelayPenalty = clamp(groupDelayMs * 0.9, 0, 70);
  const excursionPenalty = driver.xmaxMm
    ? Math.max(0, metrics.maxExcursionMm / driver.xmaxMm - 0.95) * 70
    : 0;
  const passiveExcursionPenalty = result.design.kind === "passive" && result.design.passiveRadiatorXmaxMm && metrics.maxPassiveRadiatorExcursionMm !== undefined
    ? Math.max(0, metrics.maxPassiveRadiatorExcursionMm / result.design.passiveRadiatorXmaxMm - 0.95) * 70
    : 0;
  const portPenalty = metrics.maxPortMach !== undefined
    ? Math.max(0, metrics.maxPortMach - 0.14) * 260
    : 0;
  const portLengthPenalty = metrics.portLengthCm !== undefined && metrics.portLengthCm <= 1
    ? 22
    : metrics.portLengthCm !== undefined && metrics.portLengthCm < 4
      ? 8
      : 0;
  const outputPenalty = metrics.maxUsableSplDb
    ? clamp((112 - metrics.maxUsableSplDb) * 1.35, 0, 90)
    : 22;
  const limitPenalty = excursionPenalty + passiveExcursionPenalty + portPenalty + portLengthPenalty;
  const weights = optimizerWeights(goal);
  const weightedPenalty =
    f3Penalty * weights.f3 +
    flatPenalty * weights.flat +
    volumePenalty * weights.volume +
    groupDelayPenalty * weights.groupDelay +
    limitPenalty * weights.limits +
    outputPenalty * weights.output +
    optimizerKindPenalty(result.design.kind, goal);

  return clamp(100 - weightedPenalty, 0, 100);
}

function responseFlatness(points: Point[]): number {
  const passband = points
    .filter((point) => point.x >= 45 && point.x <= 220 && Number.isFinite(point.y))
    .map((point) => point.y);
  const values = passband.length > 0 ? passband : points.map((point) => point.y);
  const rms = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / Math.max(1, values.length));
  const peak = values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);

  return rms * 0.75 + peak * 0.25;
}

function optimizerWeights(goal: OptimizerGoal): {
  f3: number;
  flat: number;
  groupDelay: number;
  limits: number;
  output: number;
  volume: number;
} {
  if (goal === "flat") {
    return { f3: 0.12, flat: 0.5, groupDelay: 0.13, limits: 0.12, output: 0.05, volume: 0.08 };
  }
  if (goal === "deep") {
    return { f3: 0.52, flat: 0.12, groupDelay: 0.05, limits: 0.16, output: 0.07, volume: 0.08 };
  }
  if (goal === "compact") {
    return { f3: 0.11, flat: 0.17, groupDelay: 0.08, limits: 0.08, output: 0.04, volume: 0.52 };
  }
  if (goal === "transient") {
    return { f3: 0.11, flat: 0.19, groupDelay: 0.45, limits: 0.08, output: 0.05, volume: 0.12 };
  }
  if (goal === "output") {
    return { f3: 0.12, flat: 0.08, groupDelay: 0.04, limits: 0.34, output: 0.38, volume: 0.04 };
  }

  return { f3: 0.26, flat: 0.25, groupDelay: 0.11, limits: 0.14, output: 0.06, volume: 0.18 };
}

function optimizerF3TargetFactor(goal: OptimizerGoal): number {
  if (goal === "deep") {
    return 0.62;
  }
  if (goal === "compact") {
    return 1.05;
  }
  if (goal === "transient" || goal === "flat") {
    return 0.92;
  }
  if (goal === "output") {
    return 0.8;
  }

  return 0.85;
}

function optimizerKindPenalty(kind: BoxKind, goal: OptimizerGoal): number {
  if (goal === "transient" && (kind === "vented" || kind === "passive" || kind === "bandpass")) {
    return kind === "bandpass" ? 14 : 8;
  }
  if (goal === "deep" && (kind === "sealed" || kind === "aperiodic")) {
    return 4;
  }
  if (goal === "output" && kind === "sealed") {
    return 4;
  }
  if (goal === "compact" && kind === "bandpass") {
    return 8;
  }

  return 0;
}

function volumeForQtc(driver: SpeakerDriver, qtc: number): number {
  const ratio = Math.pow(qtc / Math.max(0.05, driver.qts), 2) - 1;
  if (ratio <= 0) {
    return driver.vasL * 4;
  }

  return driver.vasL / ratio;
}

function optimizerVentedBaseVolumeFactor(qts: number): number {
  return clamp(12 * Math.pow(clamp(qts, 0.18, 0.65), 2.4), 0.25, 1.7);
}

export function parseDriversFromFile(name: string, content: string): SpeakerDriver[] {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "json") {
    const parsed = JSON.parse(content) as unknown;
    const items = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.drivers)
        ? parsed.drivers
        : [parsed];
    return items.map(normalizeDriver).filter(Boolean) as SpeakerDriver[];
  }

  const rows = parseCsv(content);
  return rows.map(normalizeDriver).filter(Boolean) as SpeakerDriver[];
}

export function parseMeasurementTraceFile(name: string, content: string): ParsedMeasurementTrace | null {
  const lower = name.toLowerCase();
  const kind: MeasurementTraceKind = lower.endsWith(".zma") ? "zma" : "frd";
  const points = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("*") && !line.startsWith(";"))
    .map((line) => line.split(/[,\s;]+/).map(Number))
    .filter((columns) => columns.length >= 2 && Number.isFinite(columns[0]) && Number.isFinite(columns[1]))
    .map(([x, y]) => ({ x, y }))
    .filter((point) => point.x > 0 && Number.isFinite(point.y))
    .sort((left, right) => left.x - right.x);
  const uniquePoints = points.filter((point, index) => index === 0 || point.x !== points[index - 1].x);
  if (uniquePoints.length < 2) {
    return null;
  }
  return {
    kind,
    name,
    points: uniquePoints,
  };
}

interface ZmaPeakAnalysis {
  baselineOhm: number;
  peak: Point;
  peakIndex: number;
  validPoints: Point[];
}

function analyzeZmaPeak(points: Point[]): ZmaPeakAnalysis | null {
  const validPoints = points
    .filter((point) => point.x >= 5 && point.x <= 1000 && point.y > 0 && Number.isFinite(point.x) && Number.isFinite(point.y))
    .sort((left, right) => left.x - right.x);
  if (validPoints.length < 5) {
    return null;
  }

  const peak = validPoints
    .filter((point) => point.x >= 10 && point.x <= 500)
    .reduce((best, point) => (point.y > best.y ? point : best), validPoints[0]);
  const baselineCandidates = validPoints
    .filter((point) => point.x <= Math.max(peak.x * 0.75, 20) || point.x >= peak.x * 1.8)
    .map((point) => point.y)
    .sort((left, right) => left - right);
  const allValues = validPoints.map((point) => point.y).sort((left, right) => left - right);
  const baselineOhm = Math.max(
    0.01,
    baselineCandidates[Math.floor(baselineCandidates.length * 0.1)] ?? allValues[Math.floor(allValues.length * 0.1)] ?? allValues[0],
  );
  return { baselineOhm, peak, peakIndex: validPoints.indexOf(peak), validPoints };
}

export function estimateSealedBoxFromZma(points: Point[], reOhm?: number): SealedZmaEstimate | null {
  const analysis = analyzeZmaPeak(points);
  if (!analysis) {
    return null;
  }
  const { baselineOhm, peak, peakIndex, validPoints } = analysis;
  const usedReOhm = reOhm !== undefined && Number.isFinite(reOhm) && reOhm > 0 ? reOhm : baselineOhm;
  const peakRatio = peak.y / usedReOhm;
  const targetOhm = peakRatio > 1.2 ? Math.sqrt(peak.y * usedReOhm) : undefined;
  const f1Hz = targetOhm ? zmaCrossingFrequency(validPoints, targetOhm, 0, peakIndex, "rising") : undefined;
  const f2Hz = targetOhm ? zmaCrossingFrequency(validPoints, targetOhm, peakIndex, validPoints.length - 1, "falling") : undefined;
  // Small, "Closed-Box Loudspeaker Systems", eqs. 45-47, with Benson's
  // sqrt(f1*f2) substitution compensating voice-coil inductance skew
  const qmc = f1Hz !== undefined && f2Hz !== undefined && f2Hz > f1Hz
    ? (Math.sqrt(f1Hz * f2Hz) * Math.sqrt(peakRatio)) / (f2Hz - f1Hz)
    : undefined;
  const qec = qmc !== undefined ? qmc / (peakRatio - 1) : undefined;
  const qtc = qmc !== undefined ? qmc / peakRatio : undefined;
  const confidence: SealedZmaEstimateQuality =
    qtc !== undefined && peakRatio >= 2.5 && validPoints.length >= 12
      ? "good"
      : qtc !== undefined && peakRatio >= 1.6
        ? "fair"
        : "poor";

  return {
    baselineOhm,
    confidence,
    f1Hz,
    f2Hz,
    fcHz: peak.x,
    qec,
    qmc,
    qtc,
    reOhm: usedReOhm,
    responseDb: qtc ? sealedResponseFromFcQtc(peak.x, qtc, validPoints) : [],
    targetOhm,
    zMaxOhm: peak.y,
  };
}

export function estimateSealedBoxTsFromZma(
  driver: SpeakerDriver,
  estimate: SealedZmaEstimate | null,
  boxVolumeLiters: number,
): SealedBoxTsEstimate | null {
  if (
    !estimate ||
    !Number.isFinite(boxVolumeLiters) ||
    boxVolumeLiters <= 0 ||
    !Number.isFinite(driver.fsHz) ||
    driver.fsHz <= 0 ||
    !Number.isFinite(estimate.fcHz) ||
    estimate.fcHz <= driver.fsHz
  ) {
    return null;
  }

  // Small eq. 48 when the electrical Q of the box measurement is known;
  // the (fc/fs)^2 form ignores the air-load mass change inside the box
  const driverQes = driver.qes;
  const alpha = estimate.qec !== undefined && driverQes !== undefined && Number.isFinite(driverQes) && driverQes > 0
    ? (estimate.fcHz * estimate.qec) / (driver.fsHz * driverQes) - 1
    : Math.pow(estimate.fcHz / driver.fsHz, 2) - 1;
  if (!Number.isFinite(alpha) || alpha <= 0) {
    return null;
  }

  const complianceRatio = Math.sqrt(1 + alpha);
  const qts = estimate.qtc !== undefined && Number.isFinite(estimate.qtc) && estimate.qtc > 0
    ? estimate.qtc / complianceRatio
    : undefined;
  const tsAlpha = driver.vasL > 0 ? driver.vasL / boxVolumeLiters : undefined;

  return {
    alpha,
    fcFromTsHz: tsAlpha !== undefined ? driver.fsHz * Math.sqrt(1 + tsAlpha) : driver.fsHz,
    qtcFromTs: tsAlpha !== undefined ? driver.qts * Math.sqrt(1 + tsAlpha) : undefined,
    qts,
    vasL: alpha * boxVolumeLiters,
  };
}

export function estimateAddedMassTsFromZma(
  driver: SpeakerDriver,
  estimate: SealedZmaEstimate | null,
  addedMassGrams: number,
): AddedMassTsEstimate | null {
  if (
    !estimate ||
    !Number.isFinite(addedMassGrams) ||
    addedMassGrams <= 0 ||
    !Number.isFinite(driver.fsHz) ||
    driver.fsHz <= 0 ||
    !Number.isFinite(estimate.fcHz) ||
    estimate.fcHz <= 0 ||
    estimate.fcHz >= driver.fsHz
  ) {
    return null;
  }

  const massRatio = Math.pow(driver.fsHz / estimate.fcHz, 2) - 1;
  if (!Number.isFinite(massRatio) || massRatio <= 0) {
    return null;
  }

  const mmsKg = addedMassGrams / 1000 / massRatio;
  const cms = 1 / (Math.pow(TWO_PI * driver.fsHz, 2) * mmsKg);
  const sdM2 = driver.sdCm2 > 0 ? driver.sdCm2 / 10000 : undefined;

  return {
    cmsMmN: cms * 1000,
    fmHz: estimate.fcHz,
    massRatio,
    mmsG: mmsKg * 1000,
    vasL: sdM2 !== undefined
      ? cms * RHO * SPEED_OF_SOUND * SPEED_OF_SOUND * sdM2 * sdM2 * 1000
      : undefined,
  };
}

export function estimateFreeAirTsFromZma(points: Point[], reOhm?: number): FreeAirTsEstimate | null {
  const analysis = analyzeZmaPeak(points);
  if (!analysis) {
    return null;
  }

  const usedReOhm = reOhm !== undefined && Number.isFinite(reOhm) && reOhm > 0
    ? reOhm
    : analysis.baselineOhm;
  const peakRatio = analysis.peak.y / usedReOhm;
  if (!Number.isFinite(peakRatio) || peakRatio <= 1.2) {
    return null;
  }

  const targetOhm = Math.sqrt(analysis.peak.y * usedReOhm);
  const f1Hz = zmaCrossingFrequency(analysis.validPoints, targetOhm, 0, analysis.peakIndex, "rising");
  const f2Hz = zmaCrossingFrequency(analysis.validPoints, targetOhm, analysis.peakIndex, analysis.validPoints.length - 1, "falling");
  if (f1Hz === undefined || f2Hz === undefined || f2Hz <= f1Hz) {
    return null;
  }

  const qms = (Math.sqrt(f1Hz * f2Hz) * Math.sqrt(peakRatio)) / (f2Hz - f1Hz);
  if (!Number.isFinite(qms) || qms <= 0) {
    return null;
  }

  return {
    baselineReOhm: analysis.baselineOhm,
    fsHz: analysis.peak.x,
    peakRatio,
    qes: qms / (peakRatio - 1),
    qms,
    qts: qms / peakRatio,
    reOhm: usedReOhm,
    zMaxOhm: analysis.peak.y,
  };
}

export function alignSplOffsetDb(measured: Point[], model: Point[]): number | null {
  const modelPoints = model
    .filter((point) => point.x > 0 && Number.isFinite(point.y))
    .sort((left, right) => left.x - right.x);
  const measuredPoints = measured
    .filter((point) => point.x > 0 && Number.isFinite(point.y))
    .sort((left, right) => left.x - right.x);
  if (modelPoints.length < 2 || measuredPoints.length === 0) {
    return null;
  }

  const overlapMinHz = Math.max(measuredPoints[0].x, modelPoints[0].x);
  const overlapMaxHz = Math.min(
    measuredPoints[measuredPoints.length - 1].x,
    modelPoints[modelPoints.length - 1].x,
  );
  if (overlapMaxHz <= overlapMinHz) {
    return null;
  }

  const collectDiffs = (minHz: number, maxHz: number): number[] =>
    measuredPoints
      .filter((point) => point.x >= minHz && point.x <= maxHz)
      .map((point) => {
        const modelDb = valueAt(modelPoints, point.x);
        return modelDb === undefined ? undefined : modelDb - point.y;
      })
      .filter((diff): diff is number => diff !== undefined);

  const preferredDiffs = collectDiffs(Math.max(overlapMinHz, 100), Math.min(overlapMaxHz, 500));
  const diffs = preferredDiffs.length >= 5 ? preferredDiffs : collectDiffs(overlapMinHz, overlapMaxHz);
  if (diffs.length === 0) {
    return null;
  }
  diffs.sort((left, right) => left - right);
  return diffs[Math.floor(diffs.length / 2)];
}

function zmaCrossingFrequency(
  points: Point[],
  targetOhm: number,
  startIndex: number,
  endIndex: number,
  direction: "rising" | "falling",
): number | undefined {
  const start = Math.max(0, Math.min(startIndex, points.length - 1));
  const end = Math.max(0, Math.min(endIndex, points.length - 1));
  if (direction === "rising") {
    for (let index = Math.max(start + 1, 1); index <= end; index += 1) {
      const left = points[index - 1];
      const right = points[index];
      if (left.y <= targetOhm && right.y >= targetOhm) {
        return interpolateLogFrequency(left, right, targetOhm);
      }
    }
    return undefined;
  }

  for (let index = Math.max(start + 1, 1); index <= end; index += 1) {
    const left = points[index - 1];
    const right = points[index];
    if (left.y >= targetOhm && right.y <= targetOhm) {
      return interpolateLogFrequency(left, right, targetOhm);
    }
  }
  return undefined;
}

function interpolateLogFrequency(left: Point, right: Point, targetY: number): number {
  const deltaY = right.y - left.y;
  const ratio = clamp(Math.abs(deltaY) < 0.000001 ? 0 : (targetY - left.y) / deltaY, 0, 1);
  const leftLog = Math.log10(Math.max(0.001, left.x));
  const rightLog = Math.log10(Math.max(0.001, right.x));
  return Math.pow(10, leftLog + (rightLog - leftLog) * ratio);
}

export interface SealedAlignmentInfo {
  f3Hz: number;
  peakDb?: number;
  peakHz?: number;
}

export interface SealedEfficiencyEstimate {
  eta0: number;
  sensitivityDb: number;
}

// Small eq. 23: the same reference efficiency from driver T/S parameters alone
export function estimateDriverReferenceEfficiency(driver: SpeakerDriver): SealedEfficiencyEstimate | null {
  const qes = driver.qes;
  if (
    !Number.isFinite(driver.fsHz) || driver.fsHz <= 0 ||
    !Number.isFinite(driver.vasL) || driver.vasL <= 0 ||
    qes === undefined || !Number.isFinite(qes) || qes <= 0
  ) {
    return null;
  }

  const eta0 = (4 * Math.PI * Math.PI * Math.pow(driver.fsHz, 3) * (driver.vasL / 1000)) /
    (Math.pow(SPEED_OF_SOUND, 3) * qes);
  if (!Number.isFinite(eta0) || eta0 <= 0) {
    return null;
  }

  return {
    eta0,
    sensitivityDb: HALF_SPACE_SPL_1W_DB + 10 * Math.log10(eta0),
  };
}

// Small eq. 36: the efficiency-bandwidth-volume physical ceiling
export function maxReferenceEfficiency(f3Hz: number | undefined, boxVolumeLiters: number): number | null {
  if (
    f3Hz === undefined ||
    !Number.isFinite(f3Hz) || f3Hz <= 0 ||
    !Number.isFinite(boxVolumeLiters) || boxVolumeLiters <= 0
  ) {
    return null;
  }
  const eta0Max = 2.0e-6 * Math.pow(f3Hz, 3) * (boxVolumeLiters / 1000);
  return Number.isFinite(eta0Max) && eta0Max > 0 ? eta0Max : null;
}

// Small, "Closed-Box Loudspeaker Systems", eqs. 24, 25, 49:
// eta0 = (4*pi^2/c^3) * fc^3 * V_AT / Q_EC, V_AT = alpha/(alpha+1) * V_B
export function estimateSealedReferenceEfficiency(
  fcHz: number,
  qec: number,
  alpha: number,
  boxVolumeLiters: number,
): SealedEfficiencyEstimate | null {
  if (
    !Number.isFinite(fcHz) || fcHz <= 0 ||
    !Number.isFinite(qec) || qec <= 0 ||
    !Number.isFinite(alpha) || alpha <= 0 ||
    !Number.isFinite(boxVolumeLiters) || boxVolumeLiters <= 0
  ) {
    return null;
  }

  const vatM3 = (alpha / (alpha + 1)) * (boxVolumeLiters / 1000);
  const eta0 = (4 * Math.PI * Math.PI * Math.pow(fcHz, 3) * vatM3) /
    (Math.pow(SPEED_OF_SOUND, 3) * qec);
  if (!Number.isFinite(eta0) || eta0 <= 0) {
    return null;
  }

  return {
    eta0,
    sensitivityDb: HALF_SPACE_SPL_1W_DB + 10 * Math.log10(eta0),
  };
}

// Small, "Closed-Box Loudspeaker Systems", eqs. 75-78
export function sealedAlignmentFromFcQtc(fcHz: number, qtc: number): SealedAlignmentInfo | null {
  if (!Number.isFinite(fcHz) || fcHz <= 0 || !Number.isFinite(qtc) || qtc <= 0) {
    return null;
  }

  const inv = 1 / (qtc * qtc);
  const f3Hz = fcHz * Math.sqrt(((inv - 2) + Math.sqrt(Math.pow(inv - 2, 2) + 4)) / 2);
  if (qtc <= Math.SQRT1_2) {
    return { f3Hz };
  }

  return {
    f3Hz,
    peakDb: db((qtc * qtc) / Math.sqrt(qtc * qtc - 0.25)),
    peakHz: fcHz / Math.sqrt(1 - inv / 2),
  };
}

export function sealedResponseFromFcQtc(fcHz: number, qtc: number, sourcePoints: Point[]): Point[] {
  const minFrequency = clamp(Math.min(...sourcePoints.map((point) => point.x), 10), 5, 40);
  const maxFrequency = clamp(Math.max(500, fcHz * 8), 120, DEFAULT_FREQUENCY_MAX_HZ);
  return logspace(minFrequency, maxFrequency, 160).map((frequency) => {
    const x = frequency / Math.max(0.001, fcHz);
    const magnitude = (x * x) / Math.hypot(1 - x * x, x / Math.max(0.05, qtc));
    return {
      x: frequency,
      y: db(magnitude),
    };
  });
}

function responseAtFrequency(
  driver: DerivedDriver,
  design: BoxDesign,
  frequency: number,
): ResponseAtFrequency {
  const omega = TWO_PI * frequency;
  const s = c(0, omega);
  const ze = cadd(c(driver.reOhm, 0), cmul(s, c(driver.leH, 0)));
  const zms = cadd(
    cadd(c(driver.rms, 0), cmul(s, c(driver.mms, 0))),
    cdiv(c(1, 0), cmul(s, c(driver.cms, 0))),
  );
  const load = enclosureLoad(driver, design, frequency);
  const zMechanical = cadd(zms, load.zload);
  const reflected = cdiv(c(driver.bl * driver.bl, 0), ze);
  const denominator = cadd(zMechanical, reflected);
  const coneVelocity = cdiv(cdiv(c(driver.bl, 0), ze), denominator);
  const inputImpedance = cadd(ze, cdiv(c(driver.bl * driver.bl, 0), zMechanical));
  const frontVolumeVelocity = cmul(c(driver.sdM2, 0), coneVelocity);

  if (design.kind === "bandpass") {
    // 4th-order (single-reflex) bandpass: the cone fires into the ported front
    // chamber and does not radiate directly; only the port radiates outward.
    const chamberPressure = cmul(frontVolumeVelocity, load.zAcoustic);
    const portVolumeVelocity = load.zPort ? cdiv(chamberPressure, load.zPort) : c(0, 0);
    return {
      acoustic: pressureProxy(portVolumeVelocity, frequency),
      coneVelocity,
      portVolumeVelocity,
      inputImpedance,
    };
  }

  if (design.kind === "vented" || design.kind === "passive") {
    const boxInflow = cmul(c(-1, 0), frontVolumeVelocity);
    const pressure = cmul(boxInflow, load.zAcoustic);
    const portVolumeVelocity = load.zPort ? cdiv(pressure, load.zPort) : c(0, 0);
    const totalVolumeVelocity = cadd(frontVolumeVelocity, portVolumeVelocity);
    return {
      acoustic: pressureProxy(totalVolumeVelocity, frequency),
      coneVelocity,
      portVolumeVelocity,
      inputImpedance,
    };
  }

  return {
    acoustic: pressureProxy(frontVolumeVelocity, frequency),
    coneVelocity,
    portVolumeVelocity: c(0, 0),
    inputImpedance,
  };
}

function enclosureLoad(
  driver: DerivedDriver,
  design: BoxDesign,
  frequency: number,
): { zload: Complex; zAcoustic: Complex; zPort?: Complex } {
  if (design.kind === "infinite") {
    return { zload: c(0, 0), zAcoustic: c(0, 0) };
  }

  const omega = TWO_PI * frequency;
  const s = c(0, omega);
  const vbM3 = Math.max(0.001, design.vbLiters / 1000);
  const cab = vbM3 / (RHO * SPEED_OF_SOUND * SPEED_OF_SOUND);

  if (design.kind === "bandpass") {
    // Single-reflex (4th-order) bandpass: sealed rear chamber loads the cone
    // rear, ported front chamber loads and radiates from the cone front.
    const rearM3 = Math.max(0.001, bandpassRearLiters(design) / 1000);
    const frontM3 = Math.max(0.001, bandpassFrontLiters(design) / 1000);
    const cabRear = rearM3 / (RHO * SPEED_OF_SOUND * SPEED_OF_SOUND);
    const cabFront = frontM3 / (RHO * SPEED_OF_SOUND * SPEED_OF_SOUND);
    const fb = Math.max(5, design.fbHz ?? driver.fsHz);
    const ql = clamp(bandpassQl(design), 2, 40);
    const map = 1 / (Math.pow(TWO_PI * fb, 2) * cabFront);
    const rap = (TWO_PI * fb * map) / ql;
    const zPort = cadd(c(rap, 0), cmul(s, c(map, 0)));
    const yFront = cadd(cmul(s, c(cabFront, 0)), cdiv(c(1, 0), zPort));
    const zFront = cdiv(c(1, 0), yFront);
    const zRear = cdiv(c(1, 0), cmul(s, c(cabRear, 0)));
    const zAcousticTotal = cadd(zRear, zFront);
    return {
      zload: cmul(c(driver.sdM2 * driver.sdM2, 0), zAcousticTotal),
      zAcoustic: zFront,
      zPort,
    };
  }

  if (design.kind === "vented") {
    const fb = Math.max(5, design.fbHz ?? driver.fsHz);
    const ql = clamp(design.ql ?? 7, 2, 30);
    const map = 1 / (Math.pow(TWO_PI * fb, 2) * cab);
    const rap = (TWO_PI * fb * map) / ql;
    const zPort = cadd(c(rap, 0), cmul(s, c(map, 0)));
    const yBox = cmul(s, c(cab, 0));
    const yPort = cdiv(c(1, 0), zPort);
    const zAcoustic = cdiv(c(1, 0), cadd(yBox, yPort));
    return {
      zload: cmul(c(driver.sdM2 * driver.sdM2, 0), zAcoustic),
      zAcoustic,
      zPort,
    };
  }

  if (design.kind === "passive") {
    const zPort = passiveRadiatorAcousticImpedance(driver, design, cab, s);
    const yBox = cmul(s, c(cab, 0));
    const yPort = cdiv(c(1, 0), zPort);
    const zAcoustic = cdiv(c(1, 0), cadd(yBox, yPort));
    return {
      zload: cmul(c(driver.sdM2 * driver.sdM2, 0), zAcoustic),
      zAcoustic,
      zPort,
    };
  }

  const yBox = cmul(s, c(cab, 0));
  const leakAdmittance = design.kind === "aperiodic"
    ? aperiodicLeakAdmittance(driver, design, cab)
    : c(0, 0);
  const zAcoustic = cdiv(c(1, 0), cadd(yBox, leakAdmittance));
  return {
    zload: cmul(c(driver.sdM2 * driver.sdM2, 0), zAcoustic),
    zAcoustic,
  };
}

function deriveDriver(driver: SpeakerDriver): DerivedDriver {
  const warnings: string[] = [];
  const fsHz = Math.max(1, driver.fsHz);
  const qts = clamp(driver.qts, 0.05, 2);
  let qes = driver.qes && driver.qes > qts ? driver.qes : undefined;
  let qms = driver.qms && driver.qms > qts ? driver.qms : undefined;

  if (!qes && qms) {
    qes = 1 / (1 / qts - 1 / qms);
  }
  if (!qms && qes) {
    qms = 1 / (1 / qts - 1 / qes);
  }
  if (!qes || !Number.isFinite(qes)) {
    qes = qts * 1.15;
    warnings.push("Qes estimated from Qts");
  }
  if (!qms || !Number.isFinite(qms)) {
    qms = Math.max(2.5, 1 / (1 / qts - 1 / qes));
    warnings.push("Qms estimated from Qts/Qes");
  }

  const vasM3 = Math.max(0.001, driver.vasL / 1000);
  const sdM2 = Math.max(0.001, driver.sdCm2 / 10000);
  const reOhm = Math.max(0.2, driver.reOhm);
  const leH = Math.max(0, (driver.leMh ?? 0) / 1000);
  const omegaS = TWO_PI * fsHz;
  const cmsFromVas = vasM3 / (RHO * SPEED_OF_SOUND * SPEED_OF_SOUND * sdM2 * sdM2);
  const cms = driver.cmsMmN && driver.cmsMmN > 0 ? driver.cmsMmN / 1000 : cmsFromVas;
  const mms = driver.mmsG ? driver.mmsG / 1000 : 1 / (omegaS * omegaS * cms);
  const rms = (omegaS * mms) / qms;
  const bl = driver.blTm && driver.blTm > 0
    ? driver.blTm
    : Math.sqrt(Math.max(0.0001, (omegaS * mms * reOhm) / qes));

  return {
    fsHz,
    qts,
    qes,
    qms,
    vasM3,
    sdM2,
    reOhm,
    leH,
    xmaxM: driver.xmaxMm ? driver.xmaxMm / 1000 : undefined,
    peW: driver.peW,
    cms,
    mms,
    rms,
    bl,
    warnings,
  };
}

function createTransientResponse(
  driver: DerivedDriver,
  design: BoxDesign,
  refMagnitude: number,
): { impulse: Point[]; step: Point[] } {
  const sampleRate = 2048;
  const n = 1024;
  const maxSamples = Math.floor(sampleRate * 0.25);
  const spectrum: Complex[] = Array.from({ length: n }, () => c(0, 0));

  for (let k = 1; k <= n / 2; k += 1) {
    const frequency = (k * sampleRate) / n;
    const response = responseAtFrequency(driver, design, Math.max(0.1, frequency)).acoustic;
    const normalized = cdiv(response, c(refMagnitude, 0));
    const taper = 1 / (1 + Math.pow(frequency / 650, 6));
    spectrum[k] = cmul(normalized, c(taper, 0));
    if (k < n / 2) {
      spectrum[n - k] = c(spectrum[k].re, -spectrum[k].im);
    }
  }

  const impulseValues: number[] = [];
  for (let sample = 0; sample < maxSamples; sample += 1) {
    let value = spectrum[0].re;
    for (let k = 1; k < n / 2; k += 1) {
      const angle = (TWO_PI * k * sample) / n;
      value += 2 * (spectrum[k].re * Math.cos(angle) - spectrum[k].im * Math.sin(angle));
    }
    value += spectrum[n / 2].re * Math.cos(Math.PI * sample);
    impulseValues.push(value / n);
  }

  let running = 0;
  const impulse = impulseValues.map((value, index) => ({ x: (index / sampleRate) * 1000, y: value }));
  const step = impulseValues.map((value, index) => {
    running += value;
    return { x: (index / sampleRate) * 1000, y: running };
  });
  const maxImpulseAbs = Math.max(0.000001, ...impulse.map((point) => Math.abs(point.y)));
  const maxStepAbs = Math.max(0.000001, ...step.map((point) => Math.abs(point.y)));
  return {
    impulse: impulse.map((point) => ({ x: point.x, y: point.y / maxImpulseAbs })),
    step: step.map((point) => ({ x: point.x, y: point.y / maxStepAbs })),
  };
}

function getReferenceMagnitude(
  points: { frequency: number; magnitude: number }[],
  kind?: BoxKind,
): number {
  if (kind === "bandpass") {
    // A bandpass has no flat mid-band region; its passband sits lower and is
    // already rolling off by ~150 Hz. Reference to the actual passband peak so
    // the relative-response chart reads 0 dB at the top of the band.
    const peak = Math.max(1e-12, ...points.map((point) => point.magnitude));
    return peak;
  }
  const passband = points
    .filter((point) => point.frequency >= 120 && point.frequency <= 260)
    .map((point) => point.magnitude)
    .filter((value) => value > 0);
  if (passband.length > 0) {
    passband.sort((a, b) => a - b);
    return Math.max(1e-12, passband[Math.floor(passband.length / 2)]);
  }
  return Math.max(1e-12, ...points.map((point) => point.magnitude));
}

function findCutoff(points: Point[], targetDb: number): number | undefined {
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous.y <= targetDb && current.y >= targetDb) {
      const ratio = (targetDb - previous.y) / (current.y - previous.y || 1);
      return previous.x + ratio * (current.x - previous.x);
    }
  }
  return undefined;
}

function groupDelayAt(index: number, frequencies: number[], phases: number[]): number {
  const previous = Math.max(0, index - 1);
  const next = Math.min(frequencies.length - 1, index + 1);
  if (previous === next) {
    return 0;
  }
  const phaseDelta = phases[next] - phases[previous];
  const omegaDelta = TWO_PI * (frequencies[next] - frequencies[previous]);
  return Math.max(0, (-phaseDelta / omegaDelta) * 1000);
}

function valueAt(points: Point[], x: number): number | undefined {
  if (x < points[0].x || x > points[points.length - 1].x) {
    return undefined;
  }
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (x >= previous.x && x <= current.x) {
      const ratio = (x - previous.x) / (current.x - previous.x || 1);
      return previous.y + ratio * (current.y - previous.y);
    }
  }
  return undefined;
}

function calculateSplLimits({
  design,
  driver,
  excursionMm,
  f3Hz,
  passiveRadiatorExcursionMm,
  portMach,
  powerW,
  splDb,
}: {
  design: BoxDesign;
  driver: SpeakerDriver;
  excursionMm: Point[];
  f3Hz?: number;
  passiveRadiatorExcursionMm: Point[];
  portMach: Point[];
  powerW: number;
  splDb: Point[];
}): SplLimitSummary {
  const lowHz = clamp(f3Hz ?? 30, 20, 80);
  const bandIndexes = splDb
    .map((point, index) => ({ index, frequency: point.x }))
    .filter((point) => point.frequency >= lowHz && point.frequency <= 200)
    .map((point) => point.index);
  const indexes = bandIndexes.length > 0
    ? bandIndexes
    : splDb
        .map((point, index) => ({ index, frequency: point.x }))
        .filter((point) => point.frequency >= 30 && point.frequency <= 200)
        .map((point) => point.index);

  const excursion = driver.xmaxMm
    ? minimumSplLimit(indexes, splDb, powerW, "xmax", (index) => {
        const excursion = excursionMm[index]?.y ?? 0;
        return excursion > 0.0001 ? powerW * Math.pow(driver.xmaxMm! / excursion, 2) : undefined;
      })
    : undefined;
  const port = design.kind === "vented" || design.kind === "bandpass"
    ? minimumSplLimit(indexes, splDb, powerW, "port", (index) => {
        const mach = portMach[index]?.y ?? 0;
        return mach > 0.00001 ? powerW * Math.pow(PORT_LIMIT_MACH / mach, 2) : undefined;
      })
    : undefined;
  const passive = design.kind === "passive" && design.passiveRadiatorXmaxMm
    ? minimumSplLimit(indexes, splDb, powerW, "passive", (index) => {
        const excursion = passiveRadiatorExcursionMm[index]?.y ?? 0;
        return excursion > 0.0001
          ? powerW * Math.pow(design.passiveRadiatorXmaxMm! / excursion, 2)
          : undefined;
      })
    : undefined;
  const power = driver.peW
    ? minimumSplLimit(indexes, splDb, powerW, "power", () => driver.peW)
    : undefined;
  const usable = [excursion, passive, port, power]
    .filter((limit): limit is SplLimitPoint => Boolean(limit))
    .reduce<SplLimitPoint | undefined>(
      (best, limit) => (!best || limit.db < best.db ? limit : best),
      undefined,
    );

  return { excursion, passive, port, power, usable };
}

function minimumSplLimit(
  indexes: number[],
  splDb: Point[],
  powerW: number,
  reason: SplLimitReason,
  allowedPowerAt: (index: number) => number | undefined,
): SplLimitPoint | undefined {
  let best: SplLimitPoint | undefined;
  for (const index of indexes) {
    const allowedPowerW = allowedPowerAt(index);
    const spl = splDb[index];
    if (!spl || allowedPowerW === undefined || !Number.isFinite(allowedPowerW) || allowedPowerW <= 0) {
      continue;
    }
    const limitedSplDb = spl.y + powerRatioDb(allowedPowerW / powerW);
    if (!best || limitedSplDb < best.db) {
      best = {
        db: limitedSplDb,
        frequency: spl.x,
        reason,
      };
    }
  }

  return best;
}

function sealedForQtc(driver: SpeakerDriver, qtc: number): number {
  const ratio = Math.pow(qtc / Math.max(0.05, driver.qts), 2) - 1;
  if (ratio <= 0) {
    return driver.vasL * 4;
  }
  return driver.vasL / ratio;
}

function sealedQtc(driver: SpeakerDriver, vbLiters: number): number {
  return driver.qts * Math.sqrt(1 + driver.vasL / Math.max(0.1, vbLiters));
}

function ventedBaseVolumeFactor(qts: number): number {
  return clamp(12 * Math.pow(clamp(qts, 0.18, 0.65), 2.4), 0.25, 1.7);
}

function defaultPassiveRadiatorSdCm2(driver: SpeakerDriver): number {
  return roundTo(Math.max(driver.sdCm2 * 1.5, driver.sdCm2 + 20), 1);
}

function defaultPassiveRadiatorXmaxMm(driver: SpeakerDriver): number | undefined {
  return driver.xmaxMm ? roundTo(driver.xmaxMm * 1.8, 1) : undefined;
}

function passiveRadiatorMassForTarget(
  driver: SpeakerDriver,
  vbLiters: number,
  fbHz: number,
  sdCm2 = defaultPassiveRadiatorSdCm2(driver),
  count = 1,
): number {
  const cab = boxAcousticCompliance(vbLiters);
  const sdM2 = Math.max(0.001, sdCm2 / 10000);
  const acousticMass = 1 / (Math.pow(TWO_PI * Math.max(5, fbHz), 2) * cab);
  return roundTo(Math.max(1, acousticMass * Math.max(1, count) * sdM2 * sdM2 * 1000), 1);
}

function boxAcousticCompliance(vbLiters: number): number {
  const vbM3 = Math.max(0.001, vbLiters / 1000);
  return vbM3 / (RHO * SPEED_OF_SOUND * SPEED_OF_SOUND);
}

function passiveRadiatorAcousticImpedance(
  driver: DerivedDriver,
  design: BoxDesign,
  cab: number,
  s: Complex,
): Complex {
  const acousticMass = passiveRadiatorAcousticMass(driver, design, cab);
  const tuningHz = 1 / (TWO_PI * Math.sqrt(Math.max(1e-12, acousticMass * cab)));
  const qms = clamp(design.passiveRadiatorQms ?? design.ql ?? 7, 0.5, 50);
  const resistance = (TWO_PI * tuningHz * acousticMass) / qms;
  return cadd(c(resistance, 0), cmul(s, c(acousticMass, 0)));
}

function passiveRadiatorAcousticMass(driver: DerivedDriver, design: BoxDesign, cab: number): number {
  const sdM2 = passiveRadiatorSdM2(driver, design);
  const count = passiveRadiatorCount(design);
  const mmsKg = passiveRadiatorMmsKg(driver, design, cab);
  return mmsKg / (count * sdM2 * sdM2);
}

function passiveRadiatorMmsKg(driver: DerivedDriver, design: BoxDesign, cab: number): number {
  if (design.passiveRadiatorMmsG !== undefined && design.passiveRadiatorMmsG > 0) {
    return design.passiveRadiatorMmsG / 1000;
  }

  const targetFb = Math.max(5, design.fbHz ?? driver.fsHz * 0.78);
  const acousticMass = 1 / (Math.pow(TWO_PI * targetFb, 2) * cab);
  const sdM2 = passiveRadiatorSdM2(driver, design);
  return acousticMass * passiveRadiatorCount(design) * sdM2 * sdM2;
}

function passiveRadiatorSdM2(driver: DerivedDriver, design: BoxDesign): number {
  return Math.max(0.001, (design.passiveRadiatorSdCm2 ?? driver.sdM2 * 10000 * 1.5) / 10000);
}

function passiveRadiatorCount(design: BoxDesign): number {
  return Math.max(1, Math.round(design.passiveRadiatorCount ?? design.portCount ?? 1));
}

function passiveRadiatorTuning(driver: DerivedDriver, design: BoxDesign): number {
  const cab = boxAcousticCompliance(design.vbLiters);
  const acousticMass = passiveRadiatorAcousticMass(driver, design, cab);
  return roundTo(1 / (TWO_PI * Math.sqrt(Math.max(1e-12, acousticMass * cab))), 1);
}

function aperiodicLeakAdmittance(driver: DerivedDriver, design: BoxDesign, cab: number): Complex {
  if ((design.aperiodicMode ?? "ql") === "flow") {
    const resistance = aperiodicAcousticResistance(driver, design);
    return resistance > 0 ? c(1 / resistance, 0) : c(0, 0);
  }

  const ql = clamp(design.ql ?? 1.7, 0.5, 5);
  const leakAreaFactor = clamp(aperiodicVentAreaRatio(driver, design) / 0.1, 0.05, 4);
  return c(((TWO_PI * driver.fsHz * cab) / ql) * leakAreaFactor, 0);
}

function aperiodicAcousticResistance(driver: DerivedDriver, design: BoxDesign): number {
  const areaM2 = Math.max(0.00001, aperiodicVentAreaM2(driver, design));
  const thicknessM = clamp((design.aperiodicThicknessMm ?? 8) / 1000, 0.0005, 0.2);
  const material = design.aperiodicMaterial ?? "felt";
  const flowResistivity = clamp(
    design.flowResistivityPaSecM2 ?? APERIODIC_MATERIALS[material].flowResistivityPaSecM2,
    100,
    200000,
  );
  return (flowResistivity * thicknessM) / areaM2;
}

function aperiodicImpedanceSummary(
  driver: DerivedDriver,
  design: BoxDesign,
  frequencies: number[],
): { effectiveQ?: number; peakOhm?: number; peakReductionDb?: number } {
  const band = frequencies.filter((frequency) => frequency >= 10 && frequency <= 220);
  if (band.length < 8) {
    return {};
  }

  const current = impedancePeakFromFrequencies(driver, design, band);
  const sealed = impedancePeakFromFrequencies(driver, { ...design, kind: "sealed" }, band);
  if (!current || !sealed) {
    return {};
  }

  return {
    effectiveQ: current.effectiveQ,
    peakOhm: current.peakOhm,
    peakReductionDb: Math.max(0, db(sealed.peakOhm / current.peakOhm)),
  };
}

function impedancePeakFromFrequencies(
  driver: DerivedDriver,
  design: BoxDesign,
  frequencies: number[],
): { effectiveQ?: number; peakFrequency: number; peakOhm: number } | undefined {
  const points = frequencies.map((frequency) => ({
    x: frequency,
    y: cabs(responseAtFrequency(driver, design, frequency).inputImpedance),
  }));
  if (points.length < 3) {
    return undefined;
  }

  const peakIndex = points.reduce((bestIndex, point, index) =>
    point.y > points[bestIndex].y ? index : bestIndex,
  0);
  const zMin = Math.max(0.001, Math.min(...points.map((point) => point.y)));
  const peak = points[peakIndex];
  const target = Math.sqrt(zMin * peak.y);
  const low = crossingFrequency(points, peakIndex, target, -1);
  const high = crossingFrequency(points, peakIndex, target, 1);
  const effectiveQ = low !== undefined && high !== undefined && high > low
    ? peak.x / (high - low)
    : undefined;

  return {
    effectiveQ,
    peakFrequency: peak.x,
    peakOhm: peak.y,
  };
}

function crossingFrequency(points: Point[], startIndex: number, target: number, direction: -1 | 1): number | undefined {
  for (let index = startIndex; index + direction >= 0 && index + direction < points.length; index += direction) {
    const a = points[index];
    const b = points[index + direction];
    if ((a.y >= target && b.y <= target) || (a.y <= target && b.y >= target)) {
      const ratio = (target - a.y) / (b.y - a.y || 1);
      return a.x + ratio * (b.x - a.x);
    }
  }
  return undefined;
}

function aperiodicVentDiameterCm(driver: SpeakerDriver): number {
  const targetAreaCm2 = Math.max(0.5, driver.sdCm2 * 0.1);
  return roundTo(Math.sqrt((targetAreaCm2 * 4) / Math.PI), 1);
}

function aperiodicVentAreaRatio(driver: DerivedDriver, design: BoxDesign): number {
  return clamp(aperiodicVentAreaM2(driver, design) / Math.max(0.0001, driver.sdM2), 0.005, 0.6);
}

function aperiodicVentAreaM2(driver: DerivedDriver, design: BoxDesign): number {
  const geometry = getPortGeometry(design);
  if (!geometry) {
    return driver.sdM2 * 0.1;
  }
  const count = Math.max(1, design.portCount ?? 1);
  return geometry.singleAreaM2 * count;
}

function portLength(design: BoxDesign): number | undefined {
  const fb = design.fbHz;
  const geometry = getPortGeometry(design);
  const count = Math.max(1, design.portCount ?? 1);
  const tunedLiters = design.kind === "bandpass" ? bandpassFrontLiters(design) : design.vbLiters;
  if (!fb || !geometry || tunedLiters <= 0) {
    return undefined;
  }
  const totalArea = geometry.singleAreaM2 * count;
  const vbM3 = tunedLiters / 1000;
  const effectiveLength = totalArea / (vbM3 * Math.pow((TWO_PI * fb) / SPEED_OF_SOUND, 2));
  const physicalLength = effectiveLength - 1.46 * geometry.equivalentRadiusM;
  return roundTo(Math.max(0, physicalLength * 100), 1);
}

function getPortAreaM2(design: BoxDesign): number {
  if (design.kind !== "vented" && design.kind !== "bandpass") {
    return 0;
  }
  const geometry = getPortGeometry(design);
  const count = Math.max(1, design.portCount ?? 1);
  return geometry ? geometry.singleAreaM2 * count : 0;
}

function bandpassRearLiters(design: BoxDesign): number {
  const value = design.bandpassRearLiters ?? design.vbLiters;
  return value > 0 ? value : Math.max(0.1, design.vbLiters);
}

function bandpassFrontLiters(design: BoxDesign): number {
  const value = design.bandpassFrontLiters ?? design.vbLiters * 0.6;
  return value > 0 ? value : Math.max(0.1, design.vbLiters * 0.6);
}

function bandpassQl(design: BoxDesign): number {
  const ql = design.ql ?? 7;
  // Legacy projects stored the old low-pass Q here (~0.74). Treat any
  // sub-physical value as the modern leakage-loss default.
  return ql >= 2 ? ql : 7;
}

function getPortGeometry(design: BoxDesign): { equivalentRadiusM: number; singleAreaM2: number } | null {
  if (design.portShape === "slot") {
    const widthM = (design.portWidthCm ?? 0) / 100;
    const heightM = (design.portHeightCm ?? 0) / 100;
    if (widthM <= 0 || heightM <= 0) {
      return null;
    }
    const singleAreaM2 = widthM * heightM;
    return {
      equivalentRadiusM: Math.sqrt(singleAreaM2 / Math.PI),
      singleAreaM2,
    };
  }

  const diameterM = (design.portDiameterCm ?? 0) / 100;
  if (diameterM <= 0) {
    return null;
  }
  const radiusM = diameterM / 2;
  return {
    equivalentRadiusM: radiusM,
    singleAreaM2: Math.PI * radiusM * radiusM,
  };
}

function normalizeDriver(input: unknown): SpeakerDriver | null {
  if (!isRecord(input)) {
    return null;
  }
  const get = (...keys: string[]) => {
    for (const key of keys) {
      const found = Object.entries(input).find(([candidate]) =>
        candidate.toLowerCase().replace(/[^a-z0-9]/g, "") === key,
      );
      if (found) {
        return found[1];
      }
    }
    return undefined;
  };
  const fsHz = toNumber(get("fs", "fshz"));
  const qts = toNumber(get("qts"));
  const vasL = toNumber(get("vas", "vasl"));
  const sdCm2 = toNumber(get("sd", "sdcm2"));
  const reOhm = toNumber(get("re", "reohm", "revc"));

  if (!fsHz || !qts || !vasL || !sdCm2 || !reOhm) {
    return null;
  }

  const sensitivityDb = toNumber(get("sensitivity", "sensitivitydb", "spl", "spldb", "dbwm"));
  const sensitivity283Db = toNumber(get("sensitivity283v", "sensitivity2v83", "db283v"));

  return {
    id: newId("driver"),
    name: String(get("name", "model", "driver") ?? "Imported driver"),
    fsHz,
    qts,
    qes: toNumber(get("qes")),
    qms: toNumber(get("qms")),
    vasL,
    sdCm2,
    reOhm,
    leMh: toNumber(get("le", "lemh")),
    xmaxMm: toNumber(get("xmax", "xmaxmm")),
    peW: toNumber(get("pe", "power", "powerw")),
    sensitivityDb: sensitivityDb ?? (
      sensitivity283Db !== undefined ? sensitivity283Db + powerRatioDb(reOhm / (2.83 * 2.83)) : undefined
    ),
    mmsG: toNumber(get("mms", "mmsg")),
    cmsMmN: toNumber(get("cms", "cmsmmn", "cmsmmpern", "cmsmmn")),
    blTm: toNumber(get("bl", "bltm")),
  };
}

function parseCsv(content: string): Record<string, string>[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return [];
  }
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values.map((value) => value.replace(/^"|"$/g, ""));
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.replace(",", ".").replace(/[^\d.+-]/g, "");
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function logspace(start: number, end: number, count: number): number[] {
  const min = Math.log10(start);
  const max = Math.log10(end);
  return Array.from({ length: count }, (_, index) => {
    const ratio = index / (count - 1);
    return Math.pow(10, min + ratio * (max - min));
  });
}

function simulationFrequencies(maxHz?: number): number[] {
  const normalizedMax = clamp(
    Number.isFinite(maxHz) ? maxHz ?? DEFAULT_FREQUENCY_MAX_HZ : DEFAULT_FREQUENCY_MAX_HZ,
    MIN_FREQUENCY_MAX_HZ,
    MAX_FREQUENCY_MAX_HZ,
  );
  if (normalizedMax === DEFAULT_FREQUENCY_MAX_HZ) {
    return FREQUENCIES;
  }

  const octaveRatio = Math.max(1, normalizedMax / DEFAULT_FREQUENCY_MAX_HZ);
  const count = Math.round(clamp(220 + Math.log2(octaveRatio) * 42, 220, 420));
  return logspace(10, normalizedMax, count);
}

function unwrapPhase(phases: number[]): number[] {
  if (phases.length === 0) {
    return [];
  }
  const unwrapped = [phases[0]];
  let offset = 0;
  for (let index = 1; index < phases.length; index += 1) {
    const delta = phases[index] - phases[index - 1];
    if (delta > Math.PI) {
      offset -= TWO_PI;
    } else if (delta < -Math.PI) {
      offset += TWO_PI;
    }
    unwrapped.push(phases[index] + offset);
  }
  return unwrapped;
}

function maxPoint(points: Point[], selector: (point: Point) => number): Point {
  return points.reduce((best, point) => (selector(point) > selector(best) ? point : best), points[0]);
}

function minPoint(points: Point[], selector: (point: Point) => number): Point {
  return points.reduce((best, point) => (selector(point) < selector(best) ? point : best), points[0]);
}

function db(value: number): number {
  return 20 * Math.log10(Math.max(1e-9, value));
}

function powerRatioDb(value: number): number {
  return 10 * Math.log10(Math.max(1e-9, value));
}

function splAtOneMeter(acousticProxy: Complex, voltageRms: number): number {
  // 2*pi half-space radiation, the convention of Small's papers: the passband
  // level then equals 112 dB + 10*log10(eta0 * Pe) with eta0 from eq. 23
  const pressurePa =
    (cabs(acousticProxy) * voltageRms * RHO) / (2 * Math.PI * SPL_DISTANCE_M);
  return db(pressurePa / REFERENCE_PRESSURE_PA);
}

function c(re: number, im: number): Complex {
  return { re, im };
}

function cadd(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

function cmul(a: Complex, b: Complex): Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

function cdiv(a: Complex, b: Complex): Complex {
  const denominator = b.re * b.re + b.im * b.im || 1e-18;
  return {
    re: (a.re * b.re + a.im * b.im) / denominator,
    im: (a.im * b.re - a.re * b.im) / denominator,
  };
}

function cabs(a: Complex): number {
  return Math.hypot(a.re, a.im);
}

function pressureProxy(volumeVelocity: Complex, frequency: number): Complex {
  return cmul(c(0, TWO_PI * frequency), volumeVelocity);
}

function carg(a: Complex): number {
  return Math.atan2(a.im, a.re);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
