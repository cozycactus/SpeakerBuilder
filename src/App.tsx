import {
  Activity,
  Copy,
  Download,
  Gauge,
  Languages,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Speaker,
  Target,
  Trash2,
  Upload,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  ChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  Ref,
} from "react";
import {
  BoxDesign,
  BoxKind,
  DESIGN_COLORS,
  Point,
  PRESET_DRIVERS,
  OptimizerCandidate,
  OptimizerGoal,
  SimulationResult,
  SimulationOutput,
  SpeakerDriver,
  createDefaultDesigns,
  createDesignFromTemplate,
  getDesignTemplates,
  optimizeDesigns,
  parseDriversFromFile,
  simulateDesign,
} from "./lib/acoustics";

type ChartTab = "response" | "excursion" | "groupDelay" | "step" | "phase" | "impedance" | "port";
type Language = "ru" | "en";
type ScaleMode = "linear" | "log";
type ResizeTarget = "left" | "right";
type AnalysisSnapshot = {
  driver: SpeakerDriver;
  designs: BoxDesign[];
  powerW: number;
};
type SimulationWorkerResponse =
  | {
      id: number;
      type: "chart";
      results: SimulationResult[];
    }
  | {
      id: number;
      type: "analysis";
      candidates: OptimizerCandidate[];
      results: SimulationResult[];
    }
  | {
      id: number;
      type: "error";
      message: string;
    };

interface Series {
  name: string;
  color: string;
  points: Point[];
  focused?: boolean;
  muted?: boolean;
}

interface FrozenReference {
  capturedAt: string;
  label: string;
  tab: ChartTab;
  series: Series[];
}

type ReferenceByTab = Partial<Record<ChartTab, FrozenReference>>;

interface ProjectState {
  activeTab: ChartTab;
  designs: BoxDesign[];
  drivers: SpeakerDriver[];
  focusedDesignId: string;
  language: Language;
  optimizerGoal: OptimizerGoal;
  powerW: number;
  referenceByTab: ReferenceByTab;
  selectedDriverId: string;
}

type ProjectFile = Omit<ProjectState, "referenceByTab"> & {
  referenceByTab?: ReferenceByTab;
  version: 1;
};

type DriverIssue =
  | "invalidRequired"
  | "qtsLow"
  | "qtsHigh"
  | "qesNotAboveQts"
  | "qmsNotAboveQts"
  | "xmaxInvalid"
  | "powerInvalid";

type DriverRecommendation = "sealed" | "vented" | "mixed" | "review";

interface DriverProfile {
  ebp?: number;
  issues: DriverIssue[];
  recommendation: DriverRecommendation;
}

interface ResizeState {
  target: ResizeTarget;
  startX: number;
  startWidth: number;
}

const DRIVER_STORAGE_KEY = "speaker-builder-drivers-v1";
const LANGUAGE_STORAGE_KEY = "speaker-builder-language-v1";
const PROJECT_STORAGE_KEY = "speaker-builder-project-v1";
const LEFT_PANEL_STORAGE_KEY = "speaker-builder-left-panel-width-v1";
const RIGHT_PANEL_STORAGE_KEY = "speaker-builder-right-panel-width-v1";
const LEFT_PANEL_LIMITS = { min: 240, max: 540, defaultValue: 320 };
const RIGHT_PANEL_LIMITS = { min: 260, max: 560, defaultValue: 340 };
const RESIZE_KEY_STEP = 16;

const driverFields: Array<{
  key: keyof SpeakerDriver;
  label: string;
  unit: string;
  step: string;
}> = [
  { key: "fsHz", label: "Fs", unit: "Hz", step: "0.1" },
  { key: "qts", label: "Qts", unit: "", step: "0.01" },
  { key: "qes", label: "Qes", unit: "", step: "0.01" },
  { key: "qms", label: "Qms", unit: "", step: "0.1" },
  { key: "vasL", label: "Vas", unit: "L", step: "0.1" },
  { key: "sdCm2", label: "Sd", unit: "cm²", step: "0.1" },
  { key: "reOhm", label: "Re", unit: "Ω", step: "0.01" },
  { key: "leMh", label: "Le", unit: "mH", step: "0.01" },
  { key: "xmaxMm", label: "Xmax", unit: "mm", step: "0.1" },
  { key: "peW", label: "Pe", unit: "W", step: "1" },
  { key: "mmsG", label: "Mms", unit: "g", step: "0.1" },
  { key: "blTm", label: "BL", unit: "Tm", step: "0.1" },
];

const chartTabs: ChartTab[] = ["response", "excursion", "groupDelay", "step", "phase", "impedance", "port"];
const optimizerGoals: OptimizerGoal[] = ["balanced", "flat", "deep", "compact", "transient", "output"];

const UI_TEXT = {
  ru: {
    add: "Добавить",
    activeCount: (active: number, total?: number) =>
      total === undefined ? `${active} активно` : `${active} активно / ${total}`,
    appTitle: "Конструктор АС",
    appSubtitle: "расчет корпусов по T/S",
    boxLabels: {
      sealed: "Закрытый",
      vented: "Фазоинвертор",
      passive: "Пассивный радиатор",
      aperiodic: "Апериодический",
      infinite: "Бесконечный экран",
      bandpass: "Бандпасс",
    } satisfies Record<BoxKind, string>,
    chartAria: "Графики",
    chartTabs: {
      response: "АЧХ",
      excursion: "Ход",
      groupDelay: "Групповая задержка",
      step: "Переходная",
      phase: "Фаза",
      impedance: "Импеданс",
      port: "Порт",
    } satisfies Record<ChartTab, string>,
    chartTitles: {
      response: "АЧХ",
      excursion: "Ход диффузора",
      groupDelay: "Групповая задержка",
      step: "Переходная характеристика",
      phase: "Фаза",
      impedance: "Импеданс",
      port: "Скорость в порту",
    } satisfies Record<ChartTab, string>,
    axisLabels: {
      frequency: "Частота, Hz",
      time: "Время, ms",
    },
    configs: "Конфигурации",
    copySuffix: "копия",
    delete: "Удалить",
    design: "Конфигурация",
    designNames: {
      "Closed Bessel Qtc 0.58": "Закрытый Бессель Qtc 0.58",
      "Closed Butterworth Qtc 0.71": "Закрытый Баттерворт Qtc 0.71",
      "Vented QB3": "ФИ QB3",
      "Vented EBS": "ФИ EBS",
      "Closed compact Qtc 0.90": "Закрытый компактный Qtc 0.90",
      "Vented BB4": "ФИ BB4",
      "Vented SBB4": "ФИ SBB4",
      "Passive radiator": "Пассивный радиатор",
      "Aperiodic damped": "Апериодический демпфированный",
      "Bandpass 4th order": "Бандпасс 4-го порядка",
    } satisfies Record<string, string>,
    driverNames: {
      "6.5 inch midwoofer": "6.5\" мидвуфер",
      "10 inch woofer": "10\" вуфер",
      "12 inch subwoofer": "12\" сабвуфер",
      "Imported driver": "Импортированный динамик",
    } satisfies Record<string, string>,
    drivers: "Динамики",
    driverAnalysis: {
      ebp: "EBP",
      issues: {
        invalidRequired: "Проверьте Fs, Qts, Vas, Sd и Re: обязательные параметры должны быть больше нуля",
        powerInvalid: "Pe должен быть больше нуля или пустым",
        qesNotAboveQts: "Qes должен быть больше Qts",
        qmsNotAboveQts: "Qms должен быть больше Qts",
        qtsHigh: "Qts высокий: ФИ может давать большой пик или длинный порт",
        qtsLow: "Qts очень низкий: проверьте данные или рассчитывайте на крупный ФИ",
        xmaxInvalid: "Xmax должен быть больше нуля или пустым",
      } satisfies Record<DriverIssue, string>,
      noIssues: "Параметры выглядят согласованно",
      recommendation: "Рекомендация",
      recommendations: {
        mixed: "Можно сравнить закрытый и ФИ",
        review: "Нужна ручная проверка",
        sealed: "Лучше закрытый / апериодический",
        vented: "Хороший кандидат для ФИ",
      } satisfies Record<DriverRecommendation, string>,
      title: "Проверка T/S",
    },
    duplicate: "Дублировать",
    excursion: "Ход",
    exportJson: "Экспорт проекта JSON",
    exportPng: "Экспорт PNG",
    exportSvg: "Экспорт SVG",
    freezeReference: "Запомнить эталон",
    importError: "Ошибка импорта",
    imported: (count: number) => `Импортировано: ${count}`,
    importJsonCsv: "Импорт JSON/CSV",
    inactivePrefix: "Неактивно - ",
    language: "Язык",
    metrics: "Метрики",
    analysisCurrent: "Метрики актуальны",
    analysisCalculating: "Расчет...",
    analysisStale: "Метрики и оптимизатор ждут пересчета",
    model: "Модель",
    noActiveDesigns: "Нет активных конфигураций.",
    portDiameter: "Порт Ø",
    ports: "Порты",
    power: "Мощность",
    projectImported: "Проект загружен",
    requiredFieldsMissing: "Файл не содержит обязательные поля Fs, Qts, Vas, Sd, Re.",
    recalculate: "Пересчитать",
    reference: "Эталон",
    clearReference: "Очистить эталон",
    reset: "Сбросить",
    resizeConfigPanel: "Изменить ширину панели конфигураций",
    resizeDriverPanel: "Изменить ширину панели динамиков",
    optimizer: {
      apply: "Применить",
      best: "Лучший",
      f3: "F3",
      flatness: "Неровн.",
      gd: "ГЗ",
      goal: "Цель",
      goals: {
        balanced: "Баланс",
        flat: "Ровная АЧХ",
        deep: "Глубокий бас",
        compact: "Компактно",
        transient: "Быстрый отклик",
        output: "Запас по мощности",
      } satisfies Record<OptimizerGoal, string>,
      noCandidates: "Нет вариантов",
      peak: "Пик",
      port: "Порт",
      score: "Оценка",
      title: "Оптимизатор",
      tune: "Настройка",
      volume: "Vb",
      appliedName: (goal: string, kind: string) => `Оптимум: ${goal} / ${kind}`,
    },
    notes: {
      highQts: "Динамику с высоким Qts может лучше подойти закрытый или апериодический корпус",
      highVentAirSpeed: (mach: string) => `Высокая скорость воздуха в порту: Mach ${mach}`,
      invalidBoxVolume: "Некорректный объем корпуса",
      multiplePortsLong: "Несколько портов сильно увеличивают требуемую длину",
      portDiameterSmall: "Диаметр порта мал для площади диффузора",
      portMayNotFit: "Порт может не поместиться в корпус",
      portNearNoise: (mach: string) => `Скорость воздуха близка к шумовому пределу: Mach ${mach}`,
      portVeryLong: "Порт очень длинный для этого корпуса",
      qesEstimated: "Qes оценен по Qts",
      qmsEstimated: "Qms оценен по Qts/Qes",
      ventTooShort: "Порт слишком короткий для этого диаметра/настройки",
      xmaxExceeded: (frequency: string) => `Превышен Xmax на ${frequency} Hz`,
    },
    table: {
      design: "Конфигурация",
      excursion: "Ход",
      gd: "ГЗ 30 / 40",
      peak: "Пик",
      port: "Порт",
      tune: "Настройка",
      vb: "Vb",
      zmin: "Zmin",
    },
    type: "Тип",
  },
  en: {
    add: "Add",
    activeCount: (active: number, total?: number) =>
      total === undefined ? `${active} active` : `${active} active / ${total}`,
    appTitle: "Speaker Builder",
    appSubtitle: "T/S enclosure workbench",
    boxLabels: {
      sealed: "Closed",
      vented: "Vented",
      passive: "Passive radiator",
      aperiodic: "Aperiodic",
      infinite: "Infinite baffle",
      bandpass: "Bandpass",
    } satisfies Record<BoxKind, string>,
    chartAria: "Charts",
    chartTabs: {
      response: "Response",
      excursion: "Excursion",
      groupDelay: "Group delay",
      step: "Step",
      phase: "Phase",
      impedance: "Impedance",
      port: "Port",
    } satisfies Record<ChartTab, string>,
    chartTitles: {
      response: "Frequency response",
      excursion: "Cone excursion",
      groupDelay: "Group delay",
      step: "Step response",
      phase: "Phase",
      impedance: "Impedance",
      port: "Port velocity",
    } satisfies Record<ChartTab, string>,
    axisLabels: {
      frequency: "Frequency, Hz",
      time: "Time, ms",
    },
    configs: "Configurations",
    copySuffix: "copy",
    delete: "Delete",
    design: "Design",
    designNames: {} satisfies Record<string, string>,
    driverNames: {} satisfies Record<string, string>,
    drivers: "Drivers",
    driverAnalysis: {
      ebp: "EBP",
      issues: {
        invalidRequired: "Check Fs, Qts, Vas, Sd, and Re: required parameters must be above zero",
        powerInvalid: "Pe must be above zero or empty",
        qesNotAboveQts: "Qes must be greater than Qts",
        qmsNotAboveQts: "Qms must be greater than Qts",
        qtsHigh: "High Qts: vented boxes may peak or need a long port",
        qtsLow: "Very low Qts: verify the data or expect a large vented box",
        xmaxInvalid: "Xmax must be above zero or empty",
      } satisfies Record<DriverIssue, string>,
      noIssues: "Parameters look consistent",
      recommendation: "Recommendation",
      recommendations: {
        mixed: "Compare sealed and vented",
        review: "Needs manual review",
        sealed: "Prefer sealed / aperiodic",
        vented: "Good vented candidate",
      } satisfies Record<DriverRecommendation, string>,
      title: "T/S check",
    },
    duplicate: "Duplicate",
    excursion: "Excursion",
    exportJson: "Export project JSON",
    exportPng: "Export PNG",
    exportSvg: "Export SVG",
    freezeReference: "Freeze reference",
    importError: "Import error",
    imported: (count: number) => `Imported: ${count}`,
    importJsonCsv: "Import JSON/CSV",
    inactivePrefix: "Inactive - ",
    language: "Language",
    metrics: "Metrics",
    analysisCurrent: "Metrics are current",
    analysisCalculating: "Calculating...",
    analysisStale: "Metrics and optimizer need recalculation",
    model: "Model",
    noActiveDesigns: "No active configurations.",
    portDiameter: "Port Ø",
    ports: "Ports",
    power: "Power",
    projectImported: "Project loaded",
    requiredFieldsMissing: "File must contain Fs, Qts, Vas, Sd, and Re.",
    recalculate: "Recalculate",
    reference: "Reference",
    clearReference: "Clear reference",
    reset: "Reset",
    resizeConfigPanel: "Resize configuration panel",
    resizeDriverPanel: "Resize driver panel",
    optimizer: {
      apply: "Apply",
      best: "Best",
      f3: "F3",
      flatness: "Flatness",
      gd: "GD",
      goal: "Goal",
      goals: {
        balanced: "Balanced",
        flat: "Flat response",
        deep: "Deep bass",
        compact: "Compact",
        transient: "Fast transient",
        output: "Output headroom",
      } satisfies Record<OptimizerGoal, string>,
      noCandidates: "No candidates",
      peak: "Peak",
      port: "Port",
      score: "Score",
      title: "Optimizer",
      tune: "Tune",
      volume: "Vb",
      appliedName: (goal: string, kind: string) => `Optimized: ${goal} / ${kind}`,
    },
    notes: {
      highQts: "High Qts driver may prefer sealed or aperiodic loading",
      highVentAirSpeed: (mach: string) => `High vent air speed: Mach ${mach}`,
      invalidBoxVolume: "Invalid box volume",
      multiplePortsLong: "Multiple ports make the tuning tube long",
      portDiameterSmall: "Port diameter is small for cone area",
      portMayNotFit: "Port may not fit inside the box",
      portNearNoise: (mach: string) => `Port air speed near noise limit: Mach ${mach}`,
      portVeryLong: "Port is very long for this box",
      qesEstimated: "Qes estimated from Qts",
      qmsEstimated: "Qms estimated from Qts/Qes",
      ventTooShort: "Vent is too short for this diameter/tuning",
      xmaxExceeded: (frequency: string) => `Xmax exceeded at ${frequency} Hz`,
    },
    table: {
      design: "Design",
      excursion: "Excursion",
      gd: "GD 30 / 40",
      peak: "Peak",
      port: "Port",
      tune: "Tune",
      vb: "Vb",
      zmin: "Zmin",
    },
    type: "Type",
  },
} as const;

type UiText = (typeof UI_TEXT)[Language];

function App() {
  const initialProjectRef = useRef<ProjectState | null>(null);
  if (!initialProjectRef.current) {
    initialProjectRef.current = loadProjectState();
  }
  const initialProject = initialProjectRef.current;
  const [language, setLanguage] = useState<Language>(() => initialProject.language);
  const [drivers, setDrivers] = useState<SpeakerDriver[]>(() => initialProject.drivers);
  const [selectedDriverId, setSelectedDriverId] = useState(() => initialProject.selectedDriverId);
  const selectedDriver = drivers.find((driver) => driver.id === selectedDriverId) ?? drivers[0];
  const deferredSelectedDriver = useDeferredValue(selectedDriver);
  const [designs, setDesigns] = useState<BoxDesign[]>(() => initialProject.designs);
  const deferredDesigns = useDeferredValue(designs);
  const [analysisSnapshot, setAnalysisSnapshot] = useState<AnalysisSnapshot>(() =>
    createAnalysisSnapshot(selectedDriver, initialProject.designs, initialProject.powerW),
  );
  const [analysisResults, setAnalysisResults] = useState<SimulationResult[]>([]);
  const [chartResults, setChartResults] = useState<SimulationResult[]>([]);
  const [optimizerCandidates, setOptimizerCandidates] = useState<OptimizerCandidate[]>([]);
  const [analysisPending, setAnalysisPending] = useState(true);
  const [chartPending, setChartPending] = useState(true);
  const [focusedDesignId, setFocusedDesignId] = useState(initialProject.focusedDesignId);
  const [activeTab, setActiveTab] = useState<ChartTab>(initialProject.activeTab);
  const [optimizerGoal, setOptimizerGoal] = useState<OptimizerGoal>(initialProject.optimizerGoal);
  const [powerW, setPowerW] = useState(initialProject.powerW);
  const [referenceByTab, setReferenceByTab] = useState<ReferenceByTab>(() => initialProject.referenceByTab);
  const deferredPowerW = useDeferredValue(powerW);
  const [status, setStatus] = useState("");
  const [leftPanelWidth, setLeftPanelWidth] = useState(() =>
    loadPanelWidth(LEFT_PANEL_STORAGE_KEY, LEFT_PANEL_LIMITS),
  );
  const [rightPanelWidth, setRightPanelWidth] = useState(() =>
    loadPanelWidth(RIGHT_PANEL_STORAGE_KEY, RIGHT_PANEL_LIMITS),
  );
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chartSvgRef = useRef<SVGSVGElement>(null);
  const simulationWorkerRef = useRef<Worker | null>(null);
  const simulationRequestIdRef = useRef({ analysis: 0, chart: 0 });
  const text = UI_TEXT[language];

  useEffect(() => {
    const worker = new Worker(new URL("./lib/simulation.worker.ts", import.meta.url), {
      type: "module",
    });
    simulationWorkerRef.current = worker;

    worker.onmessage = (event: MessageEvent<SimulationWorkerResponse>) => {
      const response = event.data;
      if (response.type === "chart") {
        if (response.id !== simulationRequestIdRef.current.chart) {
          return;
        }
        setChartResults(response.results);
        setChartPending(false);
        return;
      }
      if (response.type === "analysis") {
        if (response.id !== simulationRequestIdRef.current.analysis) {
          return;
        }
        setAnalysisResults(response.results);
        setOptimizerCandidates(response.candidates);
        setAnalysisPending(false);
        return;
      }

      setStatus(response.message);
      setAnalysisPending(false);
      setChartPending(false);
    };

    worker.onerror = () => {
      setStatus("Simulation worker failed");
      setAnalysisPending(false);
      setChartPending(false);
    };

    return () => {
      worker.terminate();
      simulationWorkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language;
    document.title = text.appTitle;
  }, [language, text.appTitle]);

  useEffect(() => {
    localStorage.setItem(DRIVER_STORAGE_KEY, JSON.stringify(drivers));
  }, [drivers]);

  useEffect(() => {
    localStorage.setItem(
      PROJECT_STORAGE_KEY,
      JSON.stringify(
        createProjectFile({
          activeTab,
          designs,
          drivers,
          focusedDesignId,
          language,
          optimizerGoal,
          powerW,
          referenceByTab,
          selectedDriverId,
        }),
      ),
    );
  }, [
    activeTab,
    designs,
    drivers,
    focusedDesignId,
    language,
    optimizerGoal,
    powerW,
    referenceByTab,
    selectedDriverId,
  ]);

  useEffect(() => {
    localStorage.setItem(LEFT_PANEL_STORAGE_KEY, String(leftPanelWidth));
  }, [leftPanelWidth]);

  useEffect(() => {
    localStorage.setItem(RIGHT_PANEL_STORAGE_KEY, String(rightPanelWidth));
  }, [rightPanelWidth]);

  useEffect(() => {
    if (!resizeState) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const deltaX = event.clientX - resizeState.startX;
      if (resizeState.target === "left") {
        setLeftPanelWidth(
          clampNumber(
            resizeState.startWidth + deltaX,
            LEFT_PANEL_LIMITS.min,
            LEFT_PANEL_LIMITS.max,
          ),
        );
        return;
      }

      setRightPanelWidth(
        clampNumber(
          resizeState.startWidth - deltaX,
          RIGHT_PANEL_LIMITS.min,
          RIGHT_PANEL_LIMITS.max,
        ),
      );
    };

    const stopResize = () => setResizeState(null);
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize, { once: true });

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
    };
  }, [resizeState]);

  useEffect(() => {
    if (focusedDesignId && designs.some((design) => design.id === focusedDesignId)) {
      return;
    }
    setFocusedDesignId(designs.find((design) => design.enabled)?.id ?? designs[0]?.id ?? "");
  }, [designs, focusedDesignId]);

  const templates = useMemo(() => getDesignTemplates(selectedDriver), [selectedDriver]);
  const driverProfile = useMemo(() => analyzeDriver(selectedDriver), [selectedDriver]);
  const activeDesignCount = designs.filter((design) => design.enabled).length;
  const liveChartDesigns = useMemo(() => {
    return deferredDesigns.filter((design) => design.enabled);
  }, [deferredDesigns]);
  const analysisStale =
    analysisSnapshot.driver !== selectedDriver ||
    analysisSnapshot.designs !== designs ||
    analysisSnapshot.powerW !== powerW;
  const allWarnings = analysisResults.flatMap((result) =>
    result.metrics.notes.map((note) =>
      `${displayDesignName(result.design.name, text)}: ${translateNote(note, text)}`,
    ),
  );

  useEffect(() => {
    const requestId = simulationRequestIdRef.current.chart + 1;
    const outputs = outputsForChartTab(activeTab);
    simulationRequestIdRef.current.chart = requestId;
    setChartPending(true);

    const worker = simulationWorkerRef.current;
    if (!worker) {
      setChartResults(
        liveChartDesigns.map((design) =>
          simulateDesign(deferredSelectedDriver, design, {
            powerW: deferredPowerW,
            outputs,
          }),
        ),
      );
      setChartPending(false);
      return;
    }

    worker.postMessage({
      id: requestId,
      type: "chart",
      driver: deferredSelectedDriver,
      designs: liveChartDesigns,
      powerW: deferredPowerW,
      outputs,
    });
  }, [activeTab, deferredPowerW, deferredSelectedDriver, liveChartDesigns]);

  useEffect(() => {
    const requestId = simulationRequestIdRef.current.analysis + 1;
    simulationRequestIdRef.current.analysis = requestId;
    setAnalysisPending(true);

    const worker = simulationWorkerRef.current;
    if (!worker) {
      setAnalysisResults(
        analysisSnapshot.designs
          .filter((design) => design.enabled)
          .map((design) => simulateDesign(analysisSnapshot.driver, design, { powerW: analysisSnapshot.powerW })),
      );
      setOptimizerCandidates(optimizeDesigns(analysisSnapshot.driver, analysisSnapshot.powerW, optimizerGoal));
      setAnalysisPending(false);
      return;
    }

    worker.postMessage({
      id: requestId,
      type: "analysis",
      driver: analysisSnapshot.driver,
      designs: analysisSnapshot.designs,
      powerW: analysisSnapshot.powerW,
      goal: optimizerGoal,
    });
  }, [analysisSnapshot, optimizerGoal]);

  function updateDriverField(key: keyof SpeakerDriver, value: string) {
    setDrivers((current) =>
      current.map((driver) => {
        if (driver.id !== selectedDriver.id) {
          return driver;
        }
        if (key === "name") {
          return { ...driver, name: value };
        }
        const parsed = Number.parseFloat(value);
        return { ...driver, [key]: Number.isFinite(parsed) ? parsed : undefined };
      }),
    );
  }

  function selectDriverWithDefaults(driver: SpeakerDriver) {
    const nextDesigns = createDefaultDesigns(driver);
    setSelectedDriverId(driver.id);
    setDesigns(nextDesigns);
    setFocusedDesignId(nextDesigns.find((design) => design.enabled)?.id ?? nextDesigns[0]?.id ?? "");
    setAnalysisSnapshot(createAnalysisSnapshot(driver, nextDesigns, powerW));
  }

  function changeSelectedDriver(id: string) {
    const nextDriver = drivers.find((driver) => driver.id === id);
    if (nextDriver) {
      selectDriverWithDefaults(nextDriver);
    }
  }

  function addDriver() {
    const next: SpeakerDriver = {
      ...selectedDriver,
      id: newId("driver"),
      name: `${displayDriverName(selectedDriver, text)} ${text.copySuffix}`,
    };
    setDrivers((current) => [...current, next]);
    selectDriverWithDefaults(next);
  }

  function deleteDriver() {
    if (drivers.length <= 1) {
      return;
    }
    const nextDrivers = drivers.filter((driver) => driver.id !== selectedDriver.id);
    setDrivers(nextDrivers);
    selectDriverWithDefaults(nextDrivers[0]);
  }

  async function importDrivers(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      const content = await file.text();
      const project = parseProjectFile(content);
      if (project) {
        applyProject(project);
        setStatus(text.projectImported);
        return;
      }
      const imported = parseDriversFromFile(file.name, content);
      if (imported.length === 0) {
        setStatus(text.requiredFieldsMissing);
        return;
      }
      setDrivers((current) => [...current, ...imported]);
      selectDriverWithDefaults(imported[0]);
      setStatus(text.imported(imported.length));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : text.importError);
    }
  }

  function applyProject(project: ProjectState) {
    setLanguage(project.language);
    setDrivers(project.drivers);
    setSelectedDriverId(project.selectedDriverId);
    setDesigns(project.designs);
    setFocusedDesignId(project.focusedDesignId);
    setActiveTab(project.activeTab);
    setOptimizerGoal(project.optimizerGoal);
    setPowerW(project.powerW);
    setReferenceByTab(project.referenceByTab);
    setAnalysisSnapshot(createAnalysisSnapshot(
      project.drivers.find((driver) => driver.id === project.selectedDriverId) ?? project.drivers[0],
      project.designs,
      project.powerW,
    ));
  }

  function exportProject() {
    const blob = new Blob([
      JSON.stringify(
        createProjectFile({
          activeTab,
          designs,
          drivers,
          focusedDesignId,
          language,
          optimizerGoal,
          powerW,
          referenceByTab,
          selectedDriverId,
        }),
        null,
        2,
      ),
    ], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "speaker-builder-project.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportChartSvg() {
    const svg = chartSvgRef.current;
    if (!svg) {
      return;
    }
    const blob = new Blob([serializeSvg(svg)], {
      type: "image/svg+xml;charset=utf-8",
    });
    downloadBlob(blob, `${chartFileBaseName(chartProps.title)}.svg`);
  }

  async function exportChartPng() {
    const svg = chartSvgRef.current;
    if (!svg) {
      return;
    }
    const svgText = serializeSvg(svg);
    const svgUrl = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }));
    const image = new Image();
    image.decoding = "async";
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("PNG export failed"));
    });
    image.src = svgUrl;
    try {
      await loaded;
      const canvas = document.createElement("canvas");
      const scale = 2;
      canvas.width = image.width * scale;
      canvas.height = image.height * scale;
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) {
          downloadBlob(blob, `${chartFileBaseName(chartProps.title)}.png`);
        }
      }, "image/png");
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }

  function freezeReference() {
    setReferenceByTab((current) => ({
      ...current,
      [activeTab]: {
        capturedAt: new Date().toISOString(),
        label: chartProps.title,
        tab: activeTab,
        series: chartProps.series.map((item) => ({
          ...item,
          focused: false,
          muted: false,
          points: item.points.map((point) => ({ ...point })),
        })),
      },
    }));
  }

  function clearReference() {
    setReferenceByTab((current) => {
      const next = { ...current };
      delete next[activeTab];
      return next;
    });
  }

  function recalculateAnalysis() {
    setAnalysisSnapshot(createAnalysisSnapshot(selectedDriver, designs, powerW));
  }

  function updateDesign(id: string, patch: Partial<BoxDesign>) {
    setDesigns((current) => {
      if (patch.enabled === false && focusedDesignId === id) {
        setFocusedDesignId(
          current.find((design) => design.id !== id && design.enabled)?.id ??
            current.find((design) => design.id !== id)?.id ??
            "",
        );
      } else if (patch.enabled !== false) {
        setFocusedDesignId(id);
      }

      return current.map((design) =>
        design.id === id ? normalizeDesign({ ...design, ...patch }) : design,
      );
    });
  }

  function addDesign() {
    const key = keyForTemplate(templates[designs.length % templates.length] ?? templates[0]);
    const next = createDesignFromTemplate(key, selectedDriver, designs.length);
    setDesigns((current) => [...current, next]);
    setFocusedDesignId(next.id);
  }

  function duplicateDesign(design: BoxDesign) {
    const next = {
      ...design,
      id: newId("design"),
      name: `${displayDesignName(design.name, text)} ${text.copySuffix}`,
      enabled: true,
    };
    setDesigns((current) => [
      ...current,
      {
        ...next,
        color: DESIGN_COLORS[current.length % DESIGN_COLORS.length],
      },
    ]);
    setFocusedDesignId(next.id);
  }

  function deleteDesign(id: string) {
    setDesigns((current) => current.filter((design) => design.id !== id));
  }

  function resetDesigns() {
    const nextDesigns = createDefaultDesigns(selectedDriver);
    setDesigns(nextDesigns);
    setFocusedDesignId(nextDesigns.find((design) => design.enabled)?.id ?? nextDesigns[0]?.id ?? "");
  }

  function applyOptimizerCandidate(candidate: OptimizerCandidate) {
    const next: BoxDesign = {
      ...candidate.design,
      id: newId("optimized"),
      name: text.optimizer.appliedName(
        text.optimizer.goals[optimizerGoal],
        text.boxLabels[candidate.design.kind],
      ),
      color: DESIGN_COLORS[designs.length % DESIGN_COLORS.length],
      enabled: true,
    };

    setDesigns((current) => [...current, next]);
    setFocusedDesignId(next.id);
    setActiveTab("response");
  }

  function focusDesign(id: string) {
    setFocusedDesignId(id);
    setDesigns((current) =>
      current.map((design) => (design.id === id ? { ...design, enabled: true } : design)),
    );
  }

  const chartProps = getChartProps(activeTab, chartResults, deferredSelectedDriver, focusedDesignId, text);
  const currentReference = referenceByTab[activeTab];
  const layoutStyle = {
    "--left-panel-width": `${leftPanelWidth}px`,
    "--right-panel-width": `${rightPanelWidth}px`,
  } as CSSProperties;

  function startResize(target: ResizeTarget, event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    setResizeState({
      target,
      startX: event.clientX,
      startWidth: target === "left" ? leftPanelWidth : rightPanelWidth,
    });
  }

  function resizeWithKeyboard(target: ResizeTarget, event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    event.preventDefault();

    if (target === "left") {
      if (event.key === "Home") {
        setLeftPanelWidth(LEFT_PANEL_LIMITS.min);
      } else if (event.key === "End") {
        setLeftPanelWidth(LEFT_PANEL_LIMITS.max);
      } else {
        setLeftPanelWidth((width) =>
          clampNumber(
            width + (event.key === "ArrowRight" ? RESIZE_KEY_STEP : -RESIZE_KEY_STEP),
            LEFT_PANEL_LIMITS.min,
            LEFT_PANEL_LIMITS.max,
          ),
        );
      }
      return;
    }

    if (event.key === "Home") {
      setRightPanelWidth(RIGHT_PANEL_LIMITS.min);
    } else if (event.key === "End") {
      setRightPanelWidth(RIGHT_PANEL_LIMITS.max);
    } else {
      setRightPanelWidth((width) =>
        clampNumber(
          width + (event.key === "ArrowLeft" ? RESIZE_KEY_STEP : -RESIZE_KEY_STEP),
          RIGHT_PANEL_LIMITS.min,
          RIGHT_PANEL_LIMITS.max,
        ),
      );
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Speaker size={22} />
          </div>
          <div>
            <h1>{text.appTitle}</h1>
            <p>{text.appSubtitle}</p>
          </div>
        </div>
        <div className="topbar-actions">
          <label className="language-control">
            <Languages size={18} />
            <span>{text.language}</span>
            <select
              aria-label={text.language}
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
            >
              <option value="ru">RU</option>
              <option value="en">EN</option>
            </select>
          </label>
          <label className="power-control">
            <Gauge size={18} />
            <span>{text.power}</span>
            <input
              type="number"
              min="0.1"
              step="1"
              value={powerW}
              onChange={(event) => setPowerW(Number.parseFloat(event.target.value) || 1)}
            />
            <span>W</span>
          </label>
          <button type="button" className="icon-button" onClick={exportProject} title={text.exportJson}>
            <Download size={18} />
          </button>
        </div>
      </header>

      <main className="workspace" style={layoutStyle}>
        <aside className="sidebar panel">
          <section className="section">
            <div className="section-title">
              <div>
                <h2>{text.drivers}</h2>
                <span>{drivers.length}</span>
              </div>
              <div className="inline-actions">
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => fileInputRef.current?.click()}
                  title={text.importJsonCsv}
                >
                  <Upload size={17} />
                </button>
                <button type="button" className="icon-button" onClick={addDriver} title={text.duplicate}>
                  <Plus size={17} />
                </button>
                <button type="button" className="icon-button" onClick={deleteDriver} title={text.delete}>
                  <Trash2 size={17} />
                </button>
              </div>
            </div>
            <input
              ref={fileInputRef}
              className="hidden-input"
              type="file"
              accept=".json,.csv,text/csv,application/json"
              onChange={importDrivers}
            />
            <select
              className="driver-select"
              value={selectedDriver.id}
              onChange={(event) => changeSelectedDriver(event.target.value)}
            >
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {displayDriverName(driver, text)}
                </option>
              ))}
            </select>
            {status ? <div className="status-line">{status}</div> : null}
          </section>

          <section className="section">
            <label className="field span-2">
              <span>{text.model}</span>
              <input
                type="text"
                value={displayDriverName(selectedDriver, text)}
                onChange={(event) => updateDriverField("name", event.target.value)}
              />
            </label>
            <div className="driver-grid">
              {driverFields.map((field) => (
                <label className="field" key={field.key}>
                  <span>
                    {field.label}
                    {field.unit ? <em>{field.unit}</em> : null}
                  </span>
                  <input
                    type="number"
                    step={field.step}
                    value={String(selectedDriver[field.key] ?? "")}
                    onChange={(event) => updateDriverField(field.key, event.target.value)}
                  />
                </label>
              ))}
            </div>
            <DriverAnalysisPanel profile={driverProfile} text={text} />
          </section>
        </aside>

        <ResizeHandle
          className="workspace-resizer"
          label={text.resizeDriverPanel}
          max={LEFT_PANEL_LIMITS.max}
          min={LEFT_PANEL_LIMITS.min}
          value={leftPanelWidth}
          onKeyDown={(event) => resizeWithKeyboard("left", event)}
          onPointerDown={(event) => startResize("left", event)}
        />

        <section className="main-column">
          <div className="panel chart-panel">
            <div className="chart-header">
              <div>
                <h2>{chartProps.title}</h2>
                <span>
                  {displayDriverName(selectedDriver, text)}
                  {chartPending ? ` · ${text.analysisCalculating}` : ""}
                </span>
              </div>
              <div className="chart-tools">
                <div className="tabs" role="tablist" aria-label={text.chartAria}>
                  {chartTabs.map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      className={activeTab === tab ? "active" : ""}
                      onClick={() => setActiveTab(tab)}
                    >
                      {text.chartTabs[tab]}
                    </button>
                  ))}
                </div>
                <div className="chart-actions">
                  <button type="button" className="text-button" onClick={freezeReference} title={text.freezeReference}>
                    <Target size={16} />
                    {text.reference}
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={!currentReference}
                    onClick={clearReference}
                    title={text.clearReference}
                  >
                    <RefreshCw size={16} />
                    {text.clearReference}
                  </button>
                  <button type="button" className="text-button" onClick={exportChartSvg} title={text.exportSvg}>
                    <Download size={16} />
                    SVG
                  </button>
                  <button type="button" className="text-button" onClick={exportChartPng} title={text.exportPng}>
                    <Download size={16} />
                    PNG
                  </button>
                </div>
              </div>
            </div>

            <div className="chart-workbench">
              <div className="chart-stage">
                <LineChart
                  {...chartProps}
                  referenceLabel={text.reference}
                  referenceSeries={currentReference?.series ?? []}
                  svgRef={chartSvgRef}
                />
              </div>

              <ResizeHandle
                className="chart-resizer"
                label={text.resizeConfigPanel}
                max={RIGHT_PANEL_LIMITS.max}
                min={RIGHT_PANEL_LIMITS.min}
                value={rightPanelWidth}
                onKeyDown={(event) => resizeWithKeyboard("right", event)}
                onPointerDown={(event) => startResize("right", event)}
              />

              <aside className="config-rail" aria-label={text.configs}>
                <div className="config-rail-header">
                  <div>
                    <h2>{text.configs}</h2>
                    <span>{text.activeCount(activeDesignCount, designs.length)}</span>
                  </div>
                  <SlidersHorizontal size={18} />
                </div>

                <div className="design-toolbar config-toolbar">
                  <select value={focusedDesignId} onChange={(event) => focusDesign(event.target.value)}>
                    {designs.map((design) => (
                      <option key={design.id} value={design.id}>
                        {design.enabled ? "" : text.inactivePrefix}
                        {displayDesignName(design.name, text)}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="text-button" onClick={addDesign}>
                    <Plus size={16} />
                    {text.add}
                  </button>
                  <button type="button" className="icon-button" onClick={resetDesigns} title={text.reset}>
                    <RefreshCw size={16} />
                  </button>
                </div>

                <div className="design-list rail-design-list">
                  {designs.map((design) => (
                    <DesignEditor
                      key={design.id}
                      boxLabels={text.boxLabels}
                      design={design}
                      focused={design.id === focusedDesignId}
                      text={text}
                      onChange={(patch) => updateDesign(design.id, patch)}
                      onDuplicate={() => duplicateDesign(design)}
                      onDelete={() => deleteDesign(design.id)}
                    />
                  ))}
                </div>
              </aside>
            </div>
          </div>

          <div className="panel metrics-panel">
            <div className="section-title">
              <div>
                <h2>{text.metrics}</h2>
                <span>{text.activeCount(analysisResults.length)}</span>
              </div>
              <Activity size={18} />
            </div>
            <div className={`analysis-status ${analysisStale ? "stale" : ""}`}>
              <span>
                {analysisPending
                  ? text.analysisCalculating
                  : analysisStale
                    ? text.analysisStale
                    : text.analysisCurrent}
              </span>
              <button type="button" className="text-button" onClick={recalculateAnalysis}>
                <RefreshCw size={16} />
                {text.recalculate}
              </button>
            </div>
            <OptimizerPanel
              disabled={analysisStale}
              candidates={optimizerCandidates}
              goal={optimizerGoal}
              text={text}
              onApply={applyOptimizerCandidate}
              onGoalChange={setOptimizerGoal}
            />
            <MetricsTable
              boxLabels={text.boxLabels}
              focusedDesignId={focusedDesignId}
              results={analysisResults}
              text={text}
            />
            {allWarnings.length > 0 ? (
              <div className="warning-strip">
                {allWarnings.slice(0, 5).map((warning) => (
                  <span key={warning}>{warning}</span>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}

function ResizeHandle({
  className,
  label,
  max,
  min,
  value,
  onKeyDown,
  onPointerDown,
}: {
  className: string;
  label: string;
  max: number;
  min: number;
  value: number;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={Math.round(value)}
      className={`resize-handle ${className}`}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      role="separator"
      tabIndex={0}
      title={label}
    >
      <span />
    </div>
  );
}

function DesignEditor({
  boxLabels,
  design,
  focused,
  text,
  onChange,
  onDuplicate,
  onDelete,
}: {
  boxLabels: Record<BoxKind, string>;
  design: BoxDesign;
  focused: boolean;
  text: UiText;
  onChange: (patch: Partial<BoxDesign>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const hasTuning = design.kind === "vented" || design.kind === "passive" || design.kind === "bandpass";
  const hasPort = design.kind === "vented" || design.kind === "bandpass";

  return (
    <article className={`design-card ${design.enabled ? "" : "muted"} ${focused ? "focused" : ""}`}>
      <div className="design-head">
        <label className="check">
          <input
            type="checkbox"
            checked={design.enabled}
            onChange={(event) => onChange({ enabled: event.target.checked })}
          />
          <span style={{ background: design.color }} />
        </label>
        <input
          className="design-name"
          type="text"
          value={displayDesignName(design.name, text)}
          onChange={(event) => onChange({ name: event.target.value })}
        />
        <button type="button" className="icon-button" onClick={onDuplicate} title={text.duplicate}>
          <Copy size={16} />
        </button>
        <button type="button" className="icon-button" onClick={onDelete} title={text.delete}>
          <Trash2 size={16} />
        </button>
      </div>
      <div className="design-grid">
        <label className="field">
          <span>{text.type}</span>
          <select
            value={design.kind}
            onChange={(event) => onChange({ kind: event.target.value as BoxKind })}
          >
            {Object.entries(boxLabels).map(([kind, label]) => (
              <option key={kind} value={kind}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <NumberField label={text.table.vb} unit="L" value={design.vbLiters} step="0.1" onChange={(vbLiters) => onChange({ vbLiters })} />
        {hasTuning ? (
          <NumberField label="Fb" unit="Hz" value={design.fbHz ?? 30} step="0.1" onChange={(fbHz) => onChange({ fbHz })} />
        ) : null}
        {design.kind !== "sealed" && design.kind !== "infinite" ? (
          <NumberField label="Ql" unit="" value={design.ql ?? (design.kind === "aperiodic" ? 1.7 : 7)} step="0.1" onChange={(ql) => onChange({ ql })} />
        ) : null}
        {hasPort ? (
          <>
            <NumberField
              label={text.portDiameter}
              unit="cm"
              value={design.portDiameterCm ?? 7}
              step="0.1"
              onChange={(portDiameterCm) => onChange({ portDiameterCm })}
            />
            <NumberField
              label={text.ports}
              unit=""
              value={design.portCount ?? 1}
              step="1"
              onChange={(portCount) => onChange({ portCount: Math.max(1, Math.round(portCount)) })}
            />
          </>
        ) : null}
      </div>
    </article>
  );
}

function NumberField({
  label,
  unit,
  value,
  step,
  disabled,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  step: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {unit ? <em>{unit}</em> : null}
      </span>
      <input
        type="number"
        step={step}
        disabled={disabled}
        value={Number.isFinite(value) ? value : ""}
        onChange={(event) => onChange(Number.parseFloat(event.target.value) || 0)}
      />
    </label>
  );
}

function DriverAnalysisPanel({
  profile,
  text,
}: {
  profile: DriverProfile;
  text: UiText;
}) {
  return (
    <div className="driver-analysis">
      <div className="driver-analysis-head">
        <h3>{text.driverAnalysis.title}</h3>
        <span>{`${text.driverAnalysis.ebp}: ${profile.ebp ? fmt(profile.ebp, 0) : "—"}`}</span>
      </div>
      <div className="driver-analysis-chips">
        <span>{`${text.driverAnalysis.recommendation}: ${text.driverAnalysis.recommendations[profile.recommendation]}`}</span>
      </div>
      {profile.issues.length > 0 ? (
        <div className="validation-list">
          {profile.issues.map((issue) => (
            <span key={issue}>{text.driverAnalysis.issues[issue]}</span>
          ))}
        </div>
      ) : (
        <div className="validation-list ok">
          <span>{text.driverAnalysis.noIssues}</span>
        </div>
      )}
    </div>
  );
}

function OptimizerPanel({
  disabled,
  candidates,
  goal,
  text,
  onApply,
  onGoalChange,
}: {
  disabled: boolean;
  candidates: OptimizerCandidate[];
  goal: OptimizerGoal;
  text: UiText;
  onApply: (candidate: OptimizerCandidate) => void;
  onGoalChange: (goal: OptimizerGoal) => void;
}) {
  const best = candidates[0];

  return (
    <section className="optimizer-section">
      <div className="optimizer-header">
        <div>
          <h2>{text.optimizer.title}</h2>
          <span>
            {best
              ? `${text.optimizer.best}: ${text.optimizer.score} ${fmt(best.score, 0)}`
              : text.optimizer.noCandidates}
          </span>
        </div>
        <label className="field optimizer-goal">
          <span>{text.optimizer.goal}</span>
          <select value={goal} onChange={(event) => onGoalChange(event.target.value as OptimizerGoal)}>
            {optimizerGoals.map((item) => (
              <option key={item} value={item}>
                {text.optimizer.goals[item]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="optimizer-list">
        {candidates.slice(0, 5).map((candidate, index) => (
          <article className={`optimizer-card ${index === 0 ? "best" : ""}`} key={candidate.id}>
            <div className="optimizer-card-head">
              <div>
                <h3>{text.boxLabels[candidate.design.kind]}</h3>
                <span>{`${text.optimizer.score} ${fmt(candidate.score, 0)}`}</span>
              </div>
              <button type="button" className="text-button" disabled={disabled} onClick={() => onApply(candidate)}>
                <Target size={16} />
                {text.optimizer.apply}
              </button>
            </div>
            <div className="optimizer-metrics">
              <span>{`${text.optimizer.volume} ${fmt(candidate.design.vbLiters, 1)} L`}</span>
              <span>{`${text.optimizer.tune} ${formatTune(candidate.result, text)}`}</span>
              <span>{`${text.optimizer.f3} ${formatHz(candidate.result.metrics.f3Hz)}`}</span>
              <span>{`${text.optimizer.peak} ${fmt(candidate.result.metrics.peakDb, 1)} dB`}</span>
              <span>{`${text.optimizer.gd} ${fmt(candidate.result.metrics.groupDelay40Ms, 1)} ms`}</span>
              <span>{`${text.optimizer.flatness} ${fmt(candidate.flatnessDb, 1)} dB`}</span>
              <span>{`${text.optimizer.port} ${formatPort(candidate.result)}`}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function MetricsTable({
  boxLabels,
  focusedDesignId,
  results,
  text,
}: {
  boxLabels: Record<BoxKind, string>;
  focusedDesignId: string;
  results: SimulationResult[];
  text: UiText;
}) {
  if (results.length === 0) {
    return <div className="empty-state">{text.noActiveDesigns}</div>;
  }

  return (
    <div className="table-wrap">
      <table className="metrics-table">
        <thead>
          <tr>
            <th>{text.table.design}</th>
            <th>{text.table.vb}</th>
            <th>{text.table.tune}</th>
            <th>F3 / F6</th>
            <th>{text.table.peak}</th>
            <th>{text.table.gd}</th>
            <th>{text.table.excursion}</th>
            <th>{text.table.port}</th>
            <th>{text.table.zmin}</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
            <tr className={result.design.id === focusedDesignId ? "focused-row" : ""} key={result.design.id}>
              <td>
                <span className="color-dot" style={{ background: result.design.color }} />
                {displayDesignName(result.design.name, text)}
              </td>
              <td>{fmt(result.design.vbLiters, 1)} L</td>
              <td>
                {result.design.fbHz
                  ? `${fmt(result.design.fbHz, 1)} Hz`
                  : result.metrics.qtc
                    ? `Qtc ${fmt(result.metrics.qtc, 2)}`
                    : boxLabels[result.design.kind]}
              </td>
              <td>
                {formatHz(result.metrics.f3Hz)} / {formatHz(result.metrics.f6Hz)}
              </td>
              <td>
                {fmt(result.metrics.peakDb, 1)} dB @ {formatHz(result.metrics.peakHz)}
              </td>
              <td>
                {fmt(result.metrics.groupDelay30Ms, 1)} / {fmt(result.metrics.groupDelay40Ms, 1)} ms
              </td>
              <td>
                {fmt(result.metrics.maxExcursionMm, 1)} mm @ {formatHz(result.metrics.maxExcursionHz)}
              </td>
              <td>
                {result.metrics.maxPortMach !== undefined
                  ? `M ${fmt(result.metrics.maxPortMach, 2)} / ${fmt(result.metrics.portLengthCm, 1)} cm`
                  : "—"}
              </td>
              <td>{fmt(result.metrics.minImpedanceOhm, 1)} Ω</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LineChart({
  title,
  series,
  referenceLabel = "Reference",
  referenceSeries = [],
  xDomain,
  yDomain,
  xScale = "log",
  xLabel,
  yLabel,
  referenceLines = [],
  svgRef,
}: {
  title: string;
  series: Series[];
  referenceLabel?: string;
  referenceSeries?: Series[];
  xDomain: [number, number];
  yDomain: [number, number];
  xScale?: ScaleMode;
  xLabel: string;
  yLabel: string;
  referenceLines?: Array<{ y: number; label: string }>;
  svgRef?: Ref<SVGSVGElement>;
}) {
  const width = 960;
  const height = 390;
  const margin = { top: 20, right: 24, bottom: 62, left: 58 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const [hover, setHover] = useState<{
    svgX: number;
    svgY: number;
    xValue: number;
    values: Array<{ color: string; name: string; y: number }>;
  } | null>(null);
  const xTicks = xScale === "log" ? logTicks(xDomain) : linearTicks(xDomain, 6);
  const yTicks = linearTicks(yDomain, 7);
  const scaleX = (x: number) => {
    if (xScale === "log") {
      const min = Math.log10(xDomain[0]);
      const max = Math.log10(xDomain[1]);
      return margin.left + ((Math.log10(x) - min) / (max - min)) * innerWidth;
    }
    return margin.left + ((x - xDomain[0]) / (xDomain[1] - xDomain[0])) * innerWidth;
  };
  const scaleY = (y: number) =>
    margin.top + (1 - (y - yDomain[0]) / (yDomain[1] - yDomain[0])) * innerHeight;
  const unscaleX = (svgX: number) => {
    const ratio = (svgX - margin.left) / innerWidth;
    if (xScale === "log") {
      const min = Math.log10(xDomain[0]);
      const max = Math.log10(xDomain[1]);
      return Math.pow(10, min + ratio * (max - min));
    }

    return xDomain[0] + ratio * (xDomain[1] - xDomain[0]);
  };

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const svgX = ((event.clientX - rect.left) / rect.width) * width;
    const svgY = ((event.clientY - rect.top) / rect.height) * height;
    if (
      svgX < margin.left ||
      svgX > width - margin.right ||
      svgY < margin.top ||
      svgY > height - margin.bottom
    ) {
      setHover(null);
      return;
    }

    const xValue = unscaleX(svgX);
    const values = [
      ...series.map((item) => ({ ...item, name: item.name })),
      ...referenceSeries.map((item) => ({ ...item, name: `${referenceLabel}: ${item.name}` })),
    ]
      .map((item) => {
        const point = nearestPoint(item.points, xValue, xScale);
        return point ? { color: item.color, name: item.name, y: point.y } : null;
      })
      .filter(Boolean) as Array<{ color: string; name: string; y: number }>;

    setHover({ svgX, svgY, xValue, values });
  }

  const tooltipValues = hover?.values.slice(0, 7) ?? [];
  const tooltipWidth = 236;
  const tooltipHeight = 36 + tooltipValues.length * 18;
  const tooltipX = hover ? Math.min(width - tooltipWidth - 10, hover.svgX + 14) : 0;
  const tooltipY = hover ? Math.max(8, Math.min(height - tooltipHeight - 8, hover.svgY - 18)) : 0;

  return (
    <div className="chart-box">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={title}
        onPointerLeave={() => setHover(null)}
        onPointerMove={handlePointerMove}
      >
        <rect className="plot-bg" x={margin.left} y={margin.top} width={innerWidth} height={innerHeight} />
        {xTicks.map((tick) => (
          <g key={`x-${tick}`}>
            <line className="grid-line" x1={scaleX(tick)} x2={scaleX(tick)} y1={margin.top} y2={height - margin.bottom} />
            <text className="axis-text" x={scaleX(tick)} y={height - 34} textAnchor="middle">
              {tick >= 1000 ? `${tick / 1000}k` : tick}
            </text>
          </g>
        ))}
        {yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line className="grid-line" x1={margin.left} x2={width - margin.right} y1={scaleY(tick)} y2={scaleY(tick)} />
            <text className="axis-text" x={margin.left - 10} y={scaleY(tick) + 4} textAnchor="end">
              {fmt(tick, Math.abs(tick) < 10 ? 1 : 0)}
            </text>
          </g>
        ))}
        {referenceLines.map((line) => (
          <g key={line.label}>
            <line
              className="reference-line"
              x1={margin.left}
              x2={width - margin.right}
              y1={scaleY(line.y)}
              y2={scaleY(line.y)}
            />
            <text className="reference-text" x={width - margin.right - 8} y={scaleY(line.y) - 6} textAnchor="end">
              {line.label}
            </text>
          </g>
        ))}
        <line className="axis-line" x1={margin.left} x2={width - margin.right} y1={height - margin.bottom} y2={height - margin.bottom} />
        <line className="axis-line" x1={margin.left} x2={margin.left} y1={margin.top} y2={height - margin.bottom} />
        <text className="axis-label" transform={`translate(18 ${margin.top + innerHeight / 2}) rotate(-90)`} textAnchor="middle">
          {yLabel}
        </text>
        <text className="axis-label x-axis-label" x={margin.left + innerWidth / 2} y={height - 10} textAnchor="middle">
          {xLabel}
        </text>
        {referenceSeries.map((item, index) => (
          <path
            key={`reference-${item.name}-${index}`}
            className="series-line reference-series-line"
            d={pathForSeries(item.points, scaleX, scaleY, xDomain, yDomain)}
            stroke={item.color}
          />
        ))}
        {series.map((item) => (
          <path
            key={item.name}
            className={`series-line ${item.focused ? "focused" : ""} ${item.muted ? "muted" : ""}`}
            d={pathForSeries(item.points, scaleX, scaleY, xDomain, yDomain)}
            stroke={item.color}
          />
        ))}
        <rect
          className="plot-hitbox"
          x={margin.left}
          y={margin.top}
          width={innerWidth}
          height={innerHeight}
        />
        {hover ? (
          <g className="chart-cursor">
            <line x1={hover.svgX} x2={hover.svgX} y1={margin.top} y2={height - margin.bottom} />
            <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx="8" />
            <text x={tooltipX + 10} y={tooltipY + 18}>
              {formatAxisReadout(hover.xValue, xLabel)}
            </text>
            {tooltipValues.map((item, index) => (
              <g key={`${item.name}-${index}`}>
                <circle cx={tooltipX + 12} cy={tooltipY + 38 + index * 18} r="4" fill={item.color} />
                <text x={tooltipX + 22} y={tooltipY + 42 + index * 18}>
                  {`${item.name}: ${formatAxisReadout(item.y, yLabel)}`}
                </text>
              </g>
            ))}
          </g>
        ) : null}
      </svg>
      <div className="legend">
        {referenceSeries.length > 0 ? (
          <span className="reference-legend">
            <i />
            {referenceLabel}
          </span>
        ) : null}
        {series.map((item) => (
          <span className={`${item.focused ? "focused" : ""} ${item.muted ? "muted" : ""}`} key={item.name}>
            <i style={{ background: item.color }} />
            {item.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function outputsForChartTab(tab: ChartTab): SimulationOutput[] {
  if (tab === "response") {
    return ["response"];
  }
  if (tab === "excursion") {
    return ["excursion"];
  }
  if (tab === "groupDelay") {
    return ["groupDelay"];
  }
  if (tab === "step") {
    return ["step"];
  }
  if (tab === "phase") {
    return ["phase"];
  }
  if (tab === "impedance") {
    return ["impedance"];
  }

  return ["port"];
}

function createAnalysisSnapshot(
  driver: SpeakerDriver,
  designs: BoxDesign[],
  powerW: number,
): AnalysisSnapshot {
  return { driver, designs, powerW };
}

function getChartProps(
  tab: ChartTab,
  results: SimulationResult[],
  driver: SpeakerDriver,
  focusedDesignId: string,
  text: UiText,
): Parameters<typeof LineChart>[0] {
  const base = {
    xDomain: [10, 500] as [number, number],
    xLabel: text.axisLabels.frequency,
    xScale: "log" as ScaleMode,
    series: [] as Series[],
    referenceLines: [] as Array<{ y: number; label: string }>,
  };

  if (tab === "response") {
    return {
      ...base,
      title: text.chartTitles.response,
      yLabel: "dB",
      yDomain: [-36, 9],
      referenceLines: [
        { y: 0, label: "0 dB" },
        { y: -3, label: "-3" },
        { y: -6, label: "-6" },
      ],
      series: toSeriesList(results, "responseDb", focusedDesignId, text),
    };
  }
  if (tab === "excursion") {
    const points = results.flatMap((result) => result.excursionMm);
    const max = Math.max(driver.xmaxMm ?? 0, ...points.map((point) => point.y), 1);
    return {
      ...base,
      title: text.chartTitles.excursion,
      yLabel: "mm",
      yDomain: [0, niceCeil(max * 1.18)],
      referenceLines: driver.xmaxMm ? [{ y: driver.xmaxMm, label: "Xmax" }] : [],
      series: toSeriesList(results, "excursionMm", focusedDesignId, text),
    };
  }
  if (tab === "groupDelay") {
    const points = results.flatMap((result) => result.groupDelayMs);
    const max = Math.max(...points.map((point) => point.y), 12);
    return {
      ...base,
      title: text.chartTitles.groupDelay,
      yLabel: "ms",
      yDomain: [0, niceCeil(max * 1.12)],
      series: toSeriesList(results, "groupDelayMs", focusedDesignId, text),
    };
  }
  if (tab === "step") {
    return {
      ...base,
      title: text.chartTitles.step,
      yLabel: "norm",
      xLabel: text.axisLabels.time,
      xScale: "linear",
      xDomain: [0, 250],
      yDomain: [-1.1, 1.1],
      referenceLines: [{ y: 0, label: "0" }],
      series: toSeriesList(results, "step", focusedDesignId, text),
    };
  }
  if (tab === "phase") {
    const points = results.flatMap((result) => result.phaseDeg);
    const domain = paddedDomain(points.map((point) => point.y), [-360, 90]);
    return {
      ...base,
      title: text.chartTitles.phase,
      yLabel: "deg",
      yDomain: domain,
      series: toSeriesList(results, "phaseDeg", focusedDesignId, text),
    };
  }
  if (tab === "impedance") {
    const points = results.flatMap((result) => result.impedanceOhm);
    const max = Math.max(...points.map((point) => point.y), driver.reOhm * 2);
    return {
      ...base,
      title: text.chartTitles.impedance,
      yLabel: "Ω",
      yDomain: [0, niceCeil(max * 1.1)],
      series: toSeriesList(results, "impedanceOhm", focusedDesignId, text),
    };
  }
  const points = results.flatMap((result) => result.portMach);
  const max = Math.max(...points.map((point) => point.y), 0.18);
  return {
    ...base,
    title: text.chartTitles.port,
    yLabel: "Mach",
    yDomain: [0, Math.max(0.2, niceCeil(max * 1.15))],
    referenceLines: [
      { y: 0.1, label: "0.10" },
      { y: 0.16, label: "0.16" },
    ],
    series: toSeriesList(results, "portMach", focusedDesignId, text),
  };
}

function toSeriesList(
  results: SimulationResult[],
  key: keyof SimulationResult,
  focusedDesignId: string,
  text: UiText,
): Series[] {
  const hasFocusedResult = results.some((result) => result.design.id === focusedDesignId);

  return results.map((result) => ({
    name: displayDesignName(result.design.name, text),
    color: result.design.color,
    points: result[key] as Point[],
    focused: result.design.id === focusedDesignId,
    muted: hasFocusedResult && result.design.id !== focusedDesignId,
  }));
}

function displayDriverName(driver: SpeakerDriver, text: UiText): string {
  return displayKnownName(driver.name, text.driverNames);
}

function displayDesignName(name: string, text: UiText): string {
  return displayKnownName(name, text.designNames);
}

function displayKnownName(name: string, names: Readonly<Record<string, string>>): string {
  return names[name] ?? name;
}

function translateNote(note: string, text: UiText): string {
  const xmax = note.match(/^Xmax exceeded at ([\d.]+) Hz$/);
  if (xmax) {
    return text.notes.xmaxExceeded(xmax[1]);
  }

  const ventSpeed = note.match(/^High vent air speed: Mach ([\d.]+)$/);
  if (ventSpeed) {
    return text.notes.highVentAirSpeed(ventSpeed[1]);
  }

  const ventNearNoise = note.match(/^Port air speed near noise limit: Mach ([\d.]+)$/);
  if (ventNearNoise) {
    return text.notes.portNearNoise(ventNearNoise[1]);
  }

  if (note === "Qes estimated from Qts") {
    return text.notes.qesEstimated;
  }
  if (note === "Qms estimated from Qts/Qes") {
    return text.notes.qmsEstimated;
  }
  if (note === "Vent is too short for this diameter/tuning") {
    return text.notes.ventTooShort;
  }
  if (note === "High Qts driver may prefer sealed or aperiodic loading") {
    return text.notes.highQts;
  }
  if (note === "Invalid box volume") {
    return text.notes.invalidBoxVolume;
  }
  if (note === "Port diameter is small for cone area") {
    return text.notes.portDiameterSmall;
  }
  if (note === "Port is very long for this box") {
    return text.notes.portVeryLong;
  }
  if (note === "Port may not fit inside the box") {
    return text.notes.portMayNotFit;
  }
  if (note === "Multiple ports make the tuning tube long") {
    return text.notes.multiplePortsLong;
  }

  return note;
}

function formatTune(result: SimulationResult, text: UiText): string {
  if (result.design.fbHz) {
    return `Fb ${fmt(result.design.fbHz, 1)} Hz`;
  }
  if (result.metrics.qtc) {
    return `Qtc ${fmt(result.metrics.qtc, 2)}`;
  }

  return text.boxLabels[result.design.kind];
}

function formatPort(result: SimulationResult): string {
  if (result.metrics.maxPortMach === undefined) {
    return "—";
  }

  return `M ${fmt(result.metrics.maxPortMach, 2)} / ${fmt(result.metrics.portLengthCm, 1)} cm`;
}

function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", "960");
  clone.setAttribute("height", "390");
  return new XMLSerializer().serializeToString(clone);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function chartFileBaseName(title: string): string {
  return `speaker-builder-${title.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-|-$/g, "") || "chart"}`;
}

function nearestPoint(points: Point[], x: number, scale: ScaleMode): Point | null {
  if (points.length === 0) {
    return null;
  }
  const distance = (point: Point) =>
    scale === "log"
      ? Math.abs(Math.log10(Math.max(0.001, point.x)) - Math.log10(Math.max(0.001, x)))
      : Math.abs(point.x - x);

  return points.reduce((best, point) => (distance(point) < distance(best) ? point : best), points[0]);
}

function formatAxisReadout(value: number, label: string): string {
  if (label.includes("Hz")) {
    return `${fmt(value, value < 100 ? 1 : 0)} Hz`;
  }
  if (label.includes("ms")) {
    return `${fmt(value, 1)} ms`;
  }
  if (label === "dB") {
    return `${fmt(value, 1)} dB`;
  }
  if (label === "mm") {
    return `${fmt(value, 2)} mm`;
  }
  if (label === "Ω") {
    return `${fmt(value, 2)} Ω`;
  }
  if (label === "Mach") {
    return `M ${fmt(value, 3)}`;
  }
  if (label === "deg") {
    return `${fmt(value, 1)} deg`;
  }

  return fmt(value, 3);
}

function pathForSeries(
  points: Point[],
  scaleX: (x: number) => number,
  scaleY: (y: number) => number,
  xDomain: [number, number],
  yDomain: [number, number],
): string {
  let path = "";
  for (const point of points) {
    if (
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      point.x < xDomain[0] ||
      point.x > xDomain[1]
    ) {
      continue;
    }
    const x = scaleX(point.x);
    const y = scaleY(Math.max(yDomain[0], Math.min(yDomain[1], point.y)));
    path += path ? ` L ${x.toFixed(2)} ${y.toFixed(2)}` : `M ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return path;
}

function createProjectFile(state: ProjectState): ProjectFile {
  return {
    ...state,
    version: 1,
  };
}

function analyzeDriver(driver: SpeakerDriver): DriverProfile {
  const issues: DriverIssue[] = [];
  const hasInvalidRequired =
    driver.fsHz <= 0 ||
    driver.qts <= 0 ||
    driver.vasL <= 0 ||
    driver.sdCm2 <= 0 ||
    driver.reOhm <= 0;
  if (hasInvalidRequired) {
    issues.push("invalidRequired");
  }
  if (driver.qts < 0.18) {
    issues.push("qtsLow");
  }
  if (driver.qts > 0.7) {
    issues.push("qtsHigh");
  }
  if (driver.qes !== undefined && driver.qes <= driver.qts) {
    issues.push("qesNotAboveQts");
  }
  if (driver.qms !== undefined && driver.qms <= driver.qts) {
    issues.push("qmsNotAboveQts");
  }
  if (driver.xmaxMm !== undefined && driver.xmaxMm <= 0) {
    issues.push("xmaxInvalid");
  }
  if (driver.peW !== undefined && driver.peW <= 0) {
    issues.push("powerInvalid");
  }

  const ebp = driver.qes && driver.qes > 0 ? driver.fsHz / driver.qes : undefined;
  let recommendation: DriverRecommendation = "review";
  if (driver.qts >= 0.55 || (ebp !== undefined && ebp < 50)) {
    recommendation = "sealed";
  } else if (ebp !== undefined && ebp > 90 && driver.qts < 0.45) {
    recommendation = "vented";
  } else if (ebp !== undefined && ebp >= 50 && ebp <= 90) {
    recommendation = "mixed";
  }

  return {
    ebp,
    issues: Array.from(new Set(issues)),
    recommendation,
  };
}

function loadProjectState(): ProjectState {
  try {
    const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
    if (raw) {
      const project = parseProjectFile(raw);
      if (project) {
        return project;
      }
    }
  } catch {
    // Fall through to the legacy driver-only store.
  }

  const drivers = loadDrivers();
  const selectedDriver = drivers[0];
  const designs = createDefaultDesigns(selectedDriver);
  const focusedDesignId = designs.find((design) => design.enabled)?.id ?? designs[0]?.id ?? "";

  return {
    activeTab: "response",
    designs,
    drivers,
    focusedDesignId,
    language: loadLanguage(),
    optimizerGoal: "balanced",
    powerW: 25,
    referenceByTab: {},
    selectedDriverId: selectedDriver.id,
  };
}

function parseProjectFile(content: string): ProjectState | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!isPlainRecord(parsed) || parsed.version !== 1) {
      return null;
    }
    if (!Array.isArray(parsed.drivers) || !Array.isArray(parsed.designs)) {
      return null;
    }

    const drivers = parsed.drivers.filter(isSpeakerDriver);
    if (drivers.length === 0) {
      return null;
    }

    const selectedDriverId = typeof parsed.selectedDriverId === "string" &&
      drivers.some((driver) => driver.id === parsed.selectedDriverId)
      ? parsed.selectedDriverId
      : drivers[0].id;
    const selectedDriver = drivers.find((driver) => driver.id === selectedDriverId) ?? drivers[0];
    const designs = parsed.designs.filter(isBoxDesign).map(normalizeDesign);
    const normalizedDesigns = designs.length > 0 ? designs : createDefaultDesigns(selectedDriver);
    const focusedDesignId = typeof parsed.focusedDesignId === "string" &&
      normalizedDesigns.some((design) => design.id === parsed.focusedDesignId)
      ? parsed.focusedDesignId
      : normalizedDesigns.find((design) => design.enabled)?.id ?? normalizedDesigns[0]?.id ?? "";

    return {
      activeTab: isChartTab(parsed.activeTab) ? parsed.activeTab : "response",
      designs: normalizedDesigns,
      drivers,
      focusedDesignId,
      language: parsed.language === "en" ? "en" : "ru",
      optimizerGoal: isOptimizerGoal(parsed.optimizerGoal) ? parsed.optimizerGoal : "balanced",
      powerW: typeof parsed.powerW === "number" && Number.isFinite(parsed.powerW)
        ? Math.max(0.1, parsed.powerW)
        : 25,
      referenceByTab: isPlainRecord(parsed.referenceByTab)
        ? normalizeReferenceByTab(parsed.referenceByTab)
        : {},
      selectedDriverId,
    };
  } catch {
    return null;
  }
}

function loadDrivers(): SpeakerDriver[] {
  try {
    const raw = localStorage.getItem(DRIVER_STORAGE_KEY);
    if (!raw) {
      return PRESET_DRIVERS;
    }
    const parsed = JSON.parse(raw) as SpeakerDriver[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : PRESET_DRIVERS;
  } catch {
    return PRESET_DRIVERS;
  }
}

function loadLanguage(): Language {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY) === "en" ? "en" : "ru";
  } catch {
    return "ru";
  }
}

function loadPanelWidth(
  key: string,
  limits: { defaultValue: number; max: number; min: number },
): number {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value)
      ? clampNumber(value, limits.min, limits.max)
      : limits.defaultValue;
  } catch {
    return limits.defaultValue;
  }
}

function normalizeDesign(design: BoxDesign): BoxDesign {
  return {
    ...design,
    vbLiters: Math.max(0.1, design.vbLiters || 0.1),
    fbHz: design.fbHz !== undefined ? Math.max(1, design.fbHz) : undefined,
    ql: design.ql !== undefined ? Math.max(0.1, design.ql) : undefined,
    portDiameterCm: design.portDiameterCm !== undefined ? Math.max(0.1, design.portDiameterCm) : undefined,
    portCount: design.portCount !== undefined ? Math.max(1, Math.round(design.portCount)) : undefined,
  };
}

function normalizeReferenceByTab(value: Record<string, unknown>): ReferenceByTab {
  const referenceByTab: ReferenceByTab = {};
  for (const tab of chartTabs) {
    const reference = value[tab];
    if (!isPlainRecord(reference) || !Array.isArray(reference.series)) {
      continue;
    }
    referenceByTab[tab] = {
      capturedAt: typeof reference.capturedAt === "string" ? reference.capturedAt : new Date().toISOString(),
      label: typeof reference.label === "string" ? reference.label : "Reference",
      tab,
      series: reference.series.filter(isSeries),
    };
  }
  return referenceByTab;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSpeakerDriver(value: unknown): value is SpeakerDriver {
  return isPlainRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.fsHz === "number" &&
    typeof value.qts === "number" &&
    typeof value.vasL === "number" &&
    typeof value.sdCm2 === "number" &&
    typeof value.reOhm === "number";
}

function isBoxDesign(value: unknown): value is BoxDesign {
  return isPlainRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.kind === "string" &&
    ["sealed", "vented", "passive", "aperiodic", "infinite", "bandpass"].includes(value.kind) &&
    typeof value.enabled === "boolean" &&
    typeof value.vbLiters === "number" &&
    typeof value.color === "string";
}

function isSeries(value: unknown): value is Series {
  return isPlainRecord(value) &&
    typeof value.name === "string" &&
    typeof value.color === "string" &&
    Array.isArray(value.points) &&
    value.points.every((point) =>
      isPlainRecord(point) &&
      typeof point.x === "number" &&
      typeof point.y === "number",
    );
}

function isChartTab(value: unknown): value is ChartTab {
  return typeof value === "string" && chartTabs.includes(value as ChartTab);
}

function isOptimizerGoal(value: unknown): value is OptimizerGoal {
  return typeof value === "string" && optimizerGoals.includes(value as OptimizerGoal);
}

function keyForTemplate(design: BoxDesign): string {
  return design.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function logTicks(domain: [number, number]): number[] {
  return [10, 20, 30, 40, 50, 80, 100, 200, 300, 500].filter(
    (tick) => tick >= domain[0] && tick <= domain[1],
  );
}

function linearTicks(domain: [number, number], count: number): number[] {
  const [min, max] = domain;
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, index) => roundTo(min + step * index, 3));
}

function paddedDomain(values: number[], fallback: [number, number]): [number, number] {
  const valid = values.filter(Number.isFinite);
  if (valid.length === 0) {
    return fallback;
  }
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const padding = Math.max(10, (max - min) * 0.08);
  return [Math.floor((min - padding) / 30) * 30, Math.ceil((max + padding) / 30) * 30];
}

function niceCeil(value: number): number {
  if (value <= 0.25) {
    return Math.ceil(value * 100) / 100;
  }
  if (value <= 5) {
    return Math.ceil(value * 2) / 2;
  }
  if (value <= 50) {
    return Math.ceil(value / 5) * 5;
  }
  return Math.ceil(value / 10) * 10;
}

function formatHz(value?: number): string {
  return value ? `${fmt(value, value < 100 ? 1 : 0)} Hz` : "—";
}

function fmt(value?: number, decimals = 1): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return value.toFixed(decimals);
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export default App;
