import { describe, expect, it } from "vitest";
import {
  FREQUENCIES,
  alignSplOffsetDb,
  createDefaultDesigns,
  estimateAddedMassTsFromZma,
  estimateDriverReferenceEfficiency,
  estimateFreeAirTsFromZma,
  estimateSealedBoxFromZma,
  estimateSealedBoxTsFromZma,
  estimateSealedReferenceEfficiency,
  maxReferenceEfficiency,
  sealedAlignmentFromFcQtc,
  sealedResponseFromFcQtc,
  PRESET_DRIVERS,
  parseMeasurementTraceFile,
  resolveDriveInput,
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

function nearestY(points: Array<{ x: number; y: number }>, x: number): number {
  const point = points.reduce((best, candidate) =>
    Math.abs(candidate.x - x) < Math.abs(best.x - x) ? candidate : best,
  );
  return point.y;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function sealedHighPassMagnitude(frequency: number, fcHz: number, qtc: number): number {
  const x = frequency / fcHz;
  return (x * x) / Math.hypot(1 - x * x, x / qtc);
}

function db(value: number): number {
  return 20 * Math.log10(Math.max(1e-12, value));
}

function valueAt(points: Array<{ x: number; y: number }>, x: number): number {
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (x >= previous.x && x <= current.x) {
      const ratio = (x - previous.x) / (current.x - previous.x || 1);
      return previous.y + ratio * (current.y - previous.y);
    }
  }
  return points[points.length - 1]?.y ?? 0;
}

function acousticPortTuningHz(vbLiters: number, portDiameterCm: number, lengthCm: number): number {
  const c = 343;
  const areaM2 = Math.PI * Math.pow(portDiameterCm / 200, 2);
  const radiusM = portDiameterCm / 200;
  const vbM3 = vbLiters / 1000;
  const effectiveLengthM = lengthCm / 100 + 1.46 * radiusM;
  return (c / (2 * Math.PI)) * Math.sqrt(areaM2 / (vbM3 * effectiveLengthM));
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

  it("parses FRD measurement traces as sorted response points", () => {
    const trace = parseMeasurementTraceFile("woofer.frd", [
      "# frequency magnitude phase",
      "200 86 -12",
      "100, 82, -20",
      "100 81 -21",
      "300;88;-8",
    ].join("\n"));

    expect(trace).toMatchObject({
      kind: "frd",
      name: "woofer.frd",
      points: [
        { x: 100, y: 82 },
        { x: 200, y: 86 },
        { x: 300, y: 88 },
      ],
    });
  });

  it("parses ZMA measurement traces as impedance points", () => {
    const trace = parseMeasurementTraceFile("woofer.zma", [
      "* Hz Ohm Phase",
      "20 7.1 22",
      "35 42 -2",
      "100 8.2 -12",
    ].join("\n"));

    expect(trace?.kind).toBe("zma");
    expect(trace?.points).toEqual([
      { x: 20, y: 7.1 },
      { x: 35, y: 42 },
      { x: 100, y: 8.2 },
    ]);
  });

  it("estimates sealed-box Fc and Q factors per Small eqs. 45-47", () => {
    const targetOhm = Math.sqrt(30 * 6);
    const estimate = estimateSealedBoxFromZma([
      { x: 20, y: 6 },
      { x: 32, y: 7 },
      { x: 40, y: targetOhm },
      { x: 60, y: 30 },
      { x: 90, y: targetOhm },
      { x: 140, y: 8 },
      { x: 260, y: 6.5 },
      { x: 500, y: 6.4 },
    ], 6);

    // rc = 5, dF = 50: Qmc = 60*sqrt(5)/50, Qec = Qmc/4, Qtc = Qmc/5
    expect(estimate).not.toBeNull();
    expectNear(estimate?.fcHz, 60, 0.1);
    expectNear(estimate?.reOhm, 6, 0.001);
    expectNear(estimate?.qmc, 2.683, 0.01);
    expectNear(estimate?.qec, 0.671, 0.005);
    expectNear(estimate?.qtc, 0.537, 0.005);
    expect(estimate?.responseDb.length).toBeGreaterThan(40);
    expect(valueAt(estimate?.responseDb ?? [], 400)).toBeGreaterThan(-0.5);
  });

  it("derives Vas and Qts from a sealed-box ZMA estimate and known box volume", () => {
    // mass-preserved box: fc/fs = 2, so Qmc = 2*Qms, Qec = 2*Qes, dF = fc*sqrt(rc)/Qmc = 25
    const targetOhm = Math.sqrt(30 * 6);
    const estimate = estimateSealedBoxFromZma([
      { x: 20, y: 6 },
      { x: 32, y: 7 },
      { x: 48.79, y: targetOhm },
      { x: 60, y: 30 },
      { x: 73.79, y: targetOhm },
      { x: 140, y: 8 },
      { x: 260, y: 6.5 },
      { x: 500, y: 6.4 },
    ], 6);
    const driver = {
      ...presetById("usher-8945p"),
      fsHz: 30,
      qes: 0.67082,
      qms: 2.68328,
      qts: 0.53666,
      vasL: 30,
    };
    const derived = estimateSealedBoxTsFromZma(driver, estimate, 10);

    // eq. 48: alpha = fc*Qec/(fs*Qes) - 1 = 3, agreeing with (fc/fs)^2 - 1 here
    expect(derived).not.toBeNull();
    expectNear(derived?.alpha, 3, 0.02);
    expectNear(derived?.vasL, 30, 0.2);
    expectNear(derived?.qts, 0.537, 0.005);
    expectNear(derived?.fcFromTsHz, 60, 0.1);
    expectNear(derived?.qtcFromTs, 1.073, 0.01);
  });

  it("falls back to the frequency-ratio alpha when the box Qec is unknown", () => {
    const driver = {
      ...presetById("usher-8945p"),
      fsHz: 30,
      vasL: 30,
    };
    const legacyEstimate = {
      baselineOhm: 6,
      confidence: "poor" as const,
      fcHz: 60,
      reOhm: 6,
      responseDb: [],
      zMaxOhm: 7,
    };
    const derived = estimateSealedBoxTsFromZma(driver, legacyEstimate, 10);

    expectNear(derived?.alpha, 3, 0.001);
    expectNear(derived?.vasL, 30, 0.01);
  });

  it("derives Mms, Cms, and Vas from an added-mass ZMA estimate", () => {
    const fmHz = 30 / Math.SQRT2;
    const estimate = estimateSealedBoxFromZma([
      { x: 8, y: 6.2 },
      { x: 12, y: 7 },
      { x: 16, y: 10 },
      { x: fmHz, y: 28 },
      { x: 30, y: 9 },
      { x: 48, y: 6.6 },
      { x: 120, y: 6.3 },
      { x: 400, y: 6.5 },
    ]);
    const driver = {
      ...presetById("usher-8945p"),
      fsHz: 30,
      sdCm2: 136,
    };
    const derived = estimateAddedMassTsFromZma(driver, estimate, 10);

    expect(derived).not.toBeNull();
    expectNear(derived?.fmHz, fmHz, 0.001);
    expectNear(derived?.massRatio, 1, 0.001);
    expectNear(derived?.mmsG, 10, 0.01);
    expectNear(derived?.cmsMmN, 2.814, 0.01);
    expectNear(derived?.vasL, 73.7, 0.1);
  });

  it("rejects added-mass estimates when the loaded resonance is not below Fs", () => {
    const estimate = estimateSealedBoxFromZma([
      { x: 20, y: 6 },
      { x: 32, y: 7 },
      { x: 60, y: 30 },
      { x: 140, y: 8 },
      { x: 260, y: 6.5 },
    ]);
    const driver = {
      ...presetById("usher-8945p"),
      fsHz: 30,
    };

    expect(estimateAddedMassTsFromZma(driver, estimate, 10)).toBeNull();
    expect(estimateAddedMassTsFromZma({ ...driver, fsHz: 90 }, estimate, 0)).toBeNull();
    expect(estimateAddedMassTsFromZma(driver, null, 10)).toBeNull();
  });

  it("derives Fs, Re, and Q factors from a free-air ZMA", () => {
    const targetOhm = Math.sqrt(30 * 6);
    const points = [
      { x: 10, y: 6 },
      { x: 16, y: 7 },
      { x: 20, y: targetOhm },
      { x: 30, y: 30 },
      { x: 45, y: targetOhm },
      { x: 70, y: 8 },
      { x: 140, y: 6.5 },
      { x: 400, y: 6.4 },
    ];
    const derived = estimateFreeAirTsFromZma(points);

    // r0 = 5, dF = 25: Qms = 30*sqrt(5)/25, Qes = Qms/4, Qts = Qms/5
    expect(derived).not.toBeNull();
    expectNear(derived?.fsHz, 30, 0.001);
    expectNear(derived?.baselineReOhm, 6, 0.001);
    expectNear(derived?.reOhm, 6, 0.001);
    expectNear(derived?.peakRatio, 5, 0.001);
    expectNear(derived?.qms, 2.683, 0.01);
    expectNear(derived?.qes, 0.671, 0.005);
    expectNear(derived?.qts, 0.537, 0.005);

    const withExplicitRe = estimateFreeAirTsFromZma(points, 6);
    expectNear(withExplicitRe?.qts, derived?.qts ?? 0, 0.0001);
  });

  it("uses the entered DC resistance instead of the curve baseline", () => {
    const points = [
      { x: 10, y: 6 },
      { x: 16, y: 7 },
      { x: 20, y: Math.sqrt(30 * 6) },
      { x: 30, y: 30 },
      { x: 45, y: Math.sqrt(30 * 6) },
      { x: 70, y: 8 },
      { x: 140, y: 6.5 },
      { x: 400, y: 6.4 },
    ];
    const derived = estimateFreeAirTsFromZma(points, 5);

    expect(derived).not.toBeNull();
    expectNear(derived?.reOhm, 5, 0.001);
    expectNear(derived?.baselineReOhm, 6, 0.001);
    expectNear(derived?.peakRatio, 6, 0.001);
    // a lower true Re widens the half-power band and lowers every Q
    expect(derived?.qts ?? 1).toBeLessThan(0.537);
    expect(derived?.qms ?? 1).toBeLessThan(2.683);
  });

  it("rejects free-air estimates without a usable impedance peak", () => {
    const flat = [
      { x: 10, y: 6 },
      { x: 20, y: 6.1 },
      { x: 40, y: 6.2 },
      { x: 80, y: 6.1 },
      { x: 160, y: 6 },
    ];

    expect(estimateFreeAirTsFromZma(flat)).toBeNull();
    expect(estimateFreeAirTsFromZma([])).toBeNull();
    expect(estimateFreeAirTsFromZma([
      { x: 10, y: 6 },
      { x: 20, y: 7 },
      { x: 30, y: 30 },
      { x: 45, y: 7 },
      { x: 70, y: 6 },
    ], 28)).toBeNull();
  });

  it("derives driver reference efficiency and the eq. 36 ceiling", () => {
    // Part II example driver: fs = 19 Hz, Qes = 0.35, Vas = 540 dm3 -> eta0 ~ 1.02 %
    // (paper uses c = 345 m/s; with our 343 m/s the value lands at 1.035 %)
    const driver = { ...presetById("usher-8945p"), fsHz: 19, qes: 0.35, vasL: 540 };
    const efficiency = estimateDriverReferenceEfficiency(driver);

    expect(efficiency).not.toBeNull();
    expectNear((efficiency?.eta0 ?? 0) * 100, 1.035, 0.01);

    // eq. 36: f3 = 40 Hz, Vb = 56.6 dm3 -> eta0max = 2e-6 * 40^3 * 0.0566 = 0.72 %
    expectNear((maxReferenceEfficiency(40, 56.6) ?? 0) * 100, 0.724, 0.005);

    expect(estimateDriverReferenceEfficiency({ ...driver, qes: undefined })).toBeNull();
    expect(maxReferenceEfficiency(undefined, 56.6)).toBeNull();
    expect(maxReferenceEfficiency(40, 0)).toBeNull();
  });

  it("estimates reference efficiency per the Small Part II worked example", () => {
    // fc = 40 Hz, Qec = 0.824, alpha = 5, Vb = 56.6 dm3 -> eta0 ~ 0.35 %
    const efficiency = estimateSealedReferenceEfficiency(40, 0.824, 5, 56.6);

    expect(efficiency).not.toBeNull();
    expectNear((efficiency?.eta0 ?? 0) * 100, 0.358, 0.01);
    expectNear(efficiency?.sensitivityDb, 87.6, 0.15);

    expect(estimateSealedReferenceEfficiency(0, 0.824, 5, 56.6)).toBeNull();
    expect(estimateSealedReferenceEfficiency(40, 0.824, 0, 56.6)).toBeNull();
  });

  it("derives alignment metrics per Small eqs. 75-78", () => {
    // appendix values: B2 f3/fc = 1; C2 (Qtc = 1) f3/fc = 0.786, peak 1.25 dB;
    // critically damped f3/fc = 1.554
    const b2 = sealedAlignmentFromFcQtc(60, Math.SQRT1_2);
    expectNear(b2?.f3Hz, 60, 0.01);
    expect(b2?.peakDb).toBeUndefined();

    const c2 = sealedAlignmentFromFcQtc(60, 1);
    expectNear(c2?.f3Hz, 47.16, 0.05);
    expectNear(c2?.peakDb, 1.25, 0.01);
    expectNear(c2?.peakHz, 84.85, 0.05);

    const critical = sealedAlignmentFromFcQtc(60, 0.5);
    expectNear(critical?.f3Hz, 93.24, 0.05);

    expect(sealedAlignmentFromFcQtc(0, 1)).toBeNull();
  });

  it("builds a second-order sealed response from Fc and Qtc", () => {
    const points = sealedResponseFromFcQtc(60, Math.SQRT1_2, [{ x: 10, y: 6 }, { x: 400, y: 6 }]);

    // -3 dB at Fc for Qtc = 0.707, flat far above Fc
    expectNear(valueAt(points, 60), -3.01, 0.05);
    expectNear(valueAt(points, 480), 0, 0.1);
    expect(valueAt(points, 15)).toBeLessThan(-20);
  });

  it("aligns measured SPL to the model with a median offset", () => {
    const model = [20, 50, 100, 200, 300, 400, 500, 800, 1000].map((x) => ({ x, y: 96 }));
    const measured = [100, 150, 200, 250, 300, 350, 400, 600, 800].map((x) => ({ x, y: 70 }));

    expectNear(alignSplOffsetDb(measured, model) ?? undefined, 26, 0.001);

    const noisy = measured.map((point) => (point.x === 300 ? { ...point, y: 10 } : point));
    expectNear(alignSplOffsetDb(noisy, model) ?? undefined, 26, 0.001);
  });

  it("rejects SPL alignment without frequency overlap", () => {
    const model = [20, 100, 500, 1000].map((x) => ({ x, y: 96 }));

    expect(alignSplOffsetDb([{ x: 2000, y: 80 }, { x: 3000, y: 81 }], model)).toBeNull();
    expect(alignSplOffsetDb([], model)).toBeNull();
    expect(alignSplOffsetDb([{ x: 200, y: 80 }], [])).toBeNull();
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

  it("anchors passband SPL to the Small eq. 23 sensitivity at 1 W", () => {
    for (const id of ["usher-8945p", "dayton-rs180-8", "sb17nrxc35-8", "scan-speak-18w-8545-01"]) {
      const driver = presetById(id);
      const calculated = estimateDriverReferenceEfficiency(driver);
      expect(calculated).not.toBeNull();
      const design = createDefaultDesigns(driver).find((item) => item.name === "Vented QB3");
      expect(design).toBeDefined();

      const result = simulateDesign(driver, design!, { powerW: 1 });
      const referenceBand = result.splDb
        .filter((point) => point.x >= 300 && point.x <= 600)
        .map((point) => point.y)
        .sort((left, right) => left - right);

      // the model level must follow the driver physics, not the datasheet claim;
      // the tolerance absorbs internal inconsistency of datasheet parameter sets
      expect(referenceBand.length).toBeGreaterThan(0);
      expectNear(referenceBand[Math.floor(referenceBand.length / 2)], calculated!.sensitivityDb, 1);
      expect(result.metrics.spl50HzDb).toBeLessThan(calculated!.sensitivityDb + 1);
    }
  });

  it("keeps SPL calibration independent of the chart frequency range", () => {
    const driver = presetById("dayton-rs180-8");
    const designs = createDefaultDesigns(driver);
    const sealed = designs.find((item) => item.kind === "sealed");
    const bandpass = designs.find((item) => item.kind === "bandpass");
    expect(sealed).toBeDefined();
    expect(bandpass).toBeDefined();

    for (const design of [sealed!, bandpass!]) {
      const narrow = simulateDesign(driver, design, { powerW: 25, frequencyMaxHz: 200, outputs: ["spl"] });
      const wide = simulateDesign(driver, design, { powerW: 25, outputs: ["spl"] });
      expectNear(valueAt(narrow.splDb, 60), valueAt(wide.splDb, 60), 0.2);
    }
  });

  it("references bandpass SPL to the driver instead of its own stopband", () => {
    const driver = presetById("dayton-rs180-8");
    const bandpass = createDefaultDesigns(driver).find((item) => item.kind === "bandpass");
    expect(bandpass).toBeDefined();

    const result = simulateDesign(driver, bandpass!, { powerW: 1 });
    const passbandPeakDb = Math.max(...result.splDb.map((point) => point.y));

    // At 1 W the passband peak must sit near the driver's sensitivity
    // (resonance gain minus chamber losses), never tens of dB above it.
    expect(passbandPeakDb).toBeLessThan(driver.sensitivityDb! + 6);
    expect(passbandPeakDb).toBeGreaterThan(driver.sensitivityDb! - 12);
  });

  it("matches the closed-box second-order high-pass reference shape", () => {
    const driver = {
      id: "reference-sealed-driver",
      name: "Reference sealed driver",
      fsHz: 40,
      qts: 0.4,
      qes: 0.45,
      qms: 3.6,
      vasL: 30,
      sdCm2: 130,
      reOhm: 6,
      leMh: 0,
    };
    const targetQtc = 0.707;
    const vbLiters = driver.vasL / (Math.pow(targetQtc / driver.qts, 2) - 1);
    const fcHz = driver.fsHz * Math.sqrt(1 + driver.vasL / vbLiters);
    const result = simulateDesign(driver, {
      id: "sealed-reference",
      name: "Sealed reference",
      kind: "sealed",
      enabled: true,
      vbLiters,
      color: "#000000",
    }, { powerW: 1, frequencyMaxHz: 1000, outputs: ["response", "metrics"] });
    const analyticRaw = result.responseDb.map((point) => ({
      x: point.x,
      y: db(sealedHighPassMagnitude(point.x, fcHz, targetQtc)),
    }));
    const analyticReference = median(analyticRaw
      .filter((point) => point.x >= 120 && point.x <= 260)
      .map((point) => point.y));
    const analytic = analyticRaw.map((point) => ({ ...point, y: point.y - analyticReference }));

    for (const frequency of [20, 30, 40, 50, 80, 120]) {
      expectNear(nearestY(result.responseDb, frequency), valueAt(analytic, frequency), 0.35);
    }
    expectNear(result.metrics.qtc, targetQtc, 0.002);
    expectNear(result.metrics.fcHz, fcHz, 0.2);
    expectNear(result.metrics.f3Hz, fcHz, 1.5);
  });

  it("matches the Usher 8945P free-air impedance peak from the datasheet curve", () => {
    const driver = presetById("usher-8945p");
    const result = simulateDesign(driver, {
      id: "usher-free-air",
      name: "Usher free air",
      kind: "infinite",
      enabled: true,
      vbLiters: 1,
      color: "#000000",
    }, { powerW: 1, frequencyMaxHz: 200, outputs: ["impedance", "metrics"] });
    const peak = result.impedanceOhm.reduce((best, point) => point.y > best.y ? point : best, result.impedanceOhm[0]);

    expectNear(peak.x, 34, 2);
    expectNear(peak.y, 43, 4);
    expectNear(result.metrics.minImpedanceOhm, 5.8, 0.7);
  });

  it("keeps vent length inverse-consistent with Helmholtz tuning", () => {
    const { design, driver } = designByName(3, "Vented QB3");
    const result = simulateDesign(driver, design, { powerW: 1 });
    expect(result.metrics.portLengthCm).toBeDefined();
    expect(design.fbHz).toBeDefined();

    const invertedFb = acousticPortTuningHz(design.vbLiters, design.portDiameterCm ?? 7, result.metrics.portLengthCm!);
    expectNear(invertedFb, design.fbHz!, 0.2);
  });

  it("models passive radiator mass, excursion, and output limit separately from vented ports", () => {
    const driver = presetById("usher-8945p");
    const passive = createDefaultDesigns(driver).find((item) => item.name === "Passive radiator");
    expect(passive).toBeDefined();
    expect(passive?.passiveRadiatorSdCm2).toBeGreaterThan(driver.sdCm2);
    expect(passive?.passiveRadiatorMmsG).toBeGreaterThan(0);

    const result = simulateDesign(driver, passive!, { powerW: 25 });
    const heavier = simulateDesign(driver, {
      ...passive!,
      passiveRadiatorMmsG: (passive!.passiveRadiatorMmsG ?? 1) * 1.8,
    }, { powerW: 25 });
    const lowXmax = simulateDesign(driver, {
      ...passive!,
      passiveRadiatorXmaxMm: 1,
    }, { powerW: 25 });

    expect(result.portMach.every((point) => point.y === 0)).toBe(true);
    expect(result.passiveRadiatorExcursionMm.length).toBe(FREQUENCIES.length);
    expect(result.metrics.maxPassiveRadiatorExcursionMm).toBeGreaterThan(0);
    expect(result.metrics.passiveRadiatorTuningHz).toBeGreaterThan(10);
    expect(heavier.metrics.passiveRadiatorTuningHz).toBeLessThan(result.metrics.passiveRadiatorTuningHz ?? 0);
    expect(lowXmax.metrics.maxUsableSplReason).toBe("passive");
  });

  it("models a 4th-order bandpass with a real ported front chamber", () => {
    const driver = presetById("usher-8945p");
    const bandpass = createDefaultDesigns(driver).find((item) => item.name === "Bandpass 4th order");
    expect(bandpass).toBeDefined();
    expect(bandpass!.bandpassRearLiters).toBeGreaterThan(0);
    expect(bandpass!.bandpassFrontLiters).toBeGreaterThan(0);
    expectNear(
      bandpass!.vbLiters,
      (bandpass!.bandpassRearLiters ?? 0) + (bandpass!.bandpassFrontLiters ?? 0),
      0.001,
    );

    const result = simulateDesign(driver, bandpass!, { powerW: 10 });

    // Band-limited note reflects the new (accurate but low-band) model.
    expect(result.metrics.notes).toContain("Bandpass models low-frequency band only");

    // The port actually radiates, so port air-speed is tracked like a vented box.
    expect(result.portMach.length).toBe(FREQUENCIES.length);
    expect(result.portMach.some((point) => point.y > 0)).toBe(true);
    expect(result.metrics.maxPortMach).toBeGreaterThan(0);
    expect(result.metrics.portLengthCm).toBeGreaterThan(0);

    // Bandpass rolls off on BOTH sides of the passband (unlike a high-pass box):
    // response near the low and high edges of the band is well below the peak.
    const peakDb = result.metrics.peakDb;
    const lowEdgeDb = nearestY(result.responseDb, 20);
    const highEdgeDb = nearestY(result.responseDb, result.metrics.peakHz * 2.2);
    expect(peakDb - lowEdgeDb).toBeGreaterThan(3);
    expect(peakDb - highEdgeDb).toBeGreaterThan(3);
    expect(result.metrics.peakHz).toBeGreaterThan(20);
  });

  it("keeps the 6.5 inch sealed Butterworth alignment stable", () => {
    const { design, driver } = designByName(0, "Closed Butterworth Qtc 0.71");
    const result = simulateDesign(driver, design, { powerW: 25 });

    expectNear(result.metrics.qtc, 0.708, 0.01);
    expectNear(result.metrics.f3Hz, 77.6, 1);
    expectNear(result.metrics.f6Hz, 59.8, 1);
    expectNear(result.metrics.spl50HzDb, 93.9, 1);
    expectNear(result.metrics.spl80HzDb, 99.8, 1);
    expectNear(result.metrics.maxUsableSplDb, 103.6, 1);
    expect(result.metrics.maxUsableSplReason).toBe("xmax");
  });

  it("keeps the 6.5 inch vented QB3 port and headroom stable", () => {
    const { design, driver } = designByName(0, "Vented QB3");
    const result = simulateDesign(driver, design, { powerW: 25 });

    expectNear(result.metrics.f3Hz, 44.7, 1);
    expectNear(result.metrics.f6Hz, 39.2, 1);
    expectNear(result.metrics.portLengthCm, 25, 1);
    expectNear(result.metrics.maxPortMach, 0.026, 0.006);
    expectNear(result.metrics.maxUsableSplDb, 104.7, 1);
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
    expectNear(result.metrics.maxUsableSplDb, 108.9, 1);
    expect(result.metrics.maxUsableSplReason).toBe("power");
  });

  it("keeps the 12 inch vented QB3 output limit tied to port speed", () => {
    const { design, driver } = designByName(2, "Vented QB3");
    const result = simulateDesign(driver, design, { powerW: 25 });

    expectNear(result.metrics.f3Hz, 21.6, 1);
    expectNear(result.metrics.peakDb, 1.13, 0.2);
    expectNear(result.metrics.portLengthCm, 10.8, 1);
    expectNear(result.metrics.maxPortMach, 0.051, 0.01);
    expectNear(result.metrics.maxUsableSplDb, 108.4, 1);
    expect(result.metrics.maxUsableSplReason).toBe("port");
  });

  it("changes aperiodic damping when vent area changes", () => {
    const { design, driver } = designByName(0, "Aperiodic damped");
    const smallVent = simulateDesign(driver, { ...design, portDiameterCm: 1, portCount: 1 }, { powerW: 25 });
    const largeVent = simulateDesign(driver, { ...design, portDiameterCm: 8, portCount: 1 }, { powerW: 25 });

    expect(Math.abs(nearestY(smallVent.responseDb, driver.fsHz) - nearestY(largeVent.responseDb, driver.fsHz))).toBeGreaterThan(0.15);
  });

  it("changes aperiodic damping when damping Ql changes", () => {
    const { design, driver } = designByName(0, "Aperiodic damped");
    const lightDamping = simulateDesign(driver, { ...design, aperiodicMode: "ql", ql: 4.5 }, { powerW: 25 });
    const heavyDamping = simulateDesign(driver, { ...design, aperiodicMode: "ql", ql: 0.8 }, { powerW: 25 });

    expect(Math.abs(nearestY(lightDamping.responseDb, driver.fsHz) - nearestY(heavyDamping.responseDb, driver.fsHz))).toBeGreaterThan(0.15);
  });

  it("models aperiodic flow resistance and reports effective damping metrics", () => {
    const { design, driver } = designByName(0, "Aperiodic damped");
    const lightMaterial = simulateDesign(driver, {
      ...design,
      aperiodicMode: "flow",
      aperiodicThicknessMm: 4,
      flowResistivityPaSecM2: 3000,
    }, { powerW: 25 });
    const denseMaterial = simulateDesign(driver, {
      ...design,
      aperiodicMode: "flow",
      aperiodicThicknessMm: 20,
      flowResistivityPaSecM2: 18000,
    }, { powerW: 25 });

    expect(lightMaterial.metrics.qtc).toBeUndefined();
    expect(lightMaterial.metrics.effectiveQ).toBeGreaterThan(0);
    expect(lightMaterial.metrics.impedancePeakReductionDb).toBeGreaterThan(0);
    expect(lightMaterial.metrics.impedancePeakReductionDb).toBeGreaterThan(denseMaterial.metrics.impedancePeakReductionDb ?? 0);
    expect(Math.abs(nearestY(lightMaterial.responseDb, driver.fsHz) - nearestY(denseMaterial.responseDb, driver.fsHz))).toBeGreaterThan(0.15);
  });

  it("switches SPL drive input between 1 W, 2.83 V, nominal power, and Re power", () => {
    const driver = presetById("usher-8945p");
    const oneWatt = resolveDriveInput(driver, { powerW: 25, splInputMode: "oneWatt" });
    const twoPointEightThreeVolt = resolveDriveInput(driver, { powerW: 25, splInputMode: "twoPointEightThreeVolt" });
    const nominalPower = resolveDriveInput(driver, { powerW: 1, splInputMode: "nominalPower" });
    const rePower = resolveDriveInput(driver, { powerW: 1, splInputMode: "rePower" });

    expectNear(oneWatt.electricalPowerW, 1, 0.001);
    expectNear(twoPointEightThreeVolt.voltageRms, 2.83, 0.001);
    expect(nominalPower.voltageRms).toBeGreaterThan(rePower.voltageRms);
    expect(nominalPower.electricalPowerW).toBeGreaterThan(rePower.electricalPowerW);
  });

  it("can calculate only the SPL graph without filling unrelated series", () => {
    const { design, driver } = designByName(0, "Vented QB3");
    const result = simulateDesign(driver, design, { powerW: 25, outputs: ["spl"] });

    expect(result.splDb).toHaveLength(FREQUENCIES.length);
    expect(result.responseDb).toHaveLength(0);
    expect(result.excursionMm).toHaveLength(0);
    expect(result.passiveRadiatorExcursionMm).toHaveLength(0);
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
