import {
  Activity,
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  FileCheck2,
  Filter,
  Gauge,
  GripVertical,
  Languages,
  Maximize2,
  Minimize2,
  Plus,
  RefreshCw,
  Search,
  Share2,
  SlidersHorizontal,
  Speaker,
  Target,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  ChangeEvent,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  Ref,
} from "react";
import {
  APERIODIC_MATERIALS,
  AperiodicMaterial,
  AperiodicMode,
  BoxDesign,
  BoxKind,
  DESIGN_COLORS,
  DEFAULT_FREQUENCY_MAX_HZ,
  DriverSourceNote,
  MAX_FREQUENCY_MAX_HZ,
  MIN_FREQUENCY_MAX_HZ,
  AddedMassTsEstimate,
  FreeAirTsEstimate,
  MeasurementTraceKind,
  Point,
  PRESET_DRIVERS,
  OptimizerCandidate,
  OptimizerGoal,
  SealedBoxTsEstimate,
  SealedZmaEstimate,
  SimulationResult,
  SimulationOutput,
  SplInputMode,
  SpeakerDriver,
  SplLimitReason,
  alignSplOffsetDb,
  createDefaultDesigns,
  createDesignFromTemplate,
  estimateAddedMassTsFromZma,
  estimateFreeAirTsFromZma,
  estimateSealedBoxFromZma,
  estimateSealedBoxTsFromZma,
  getDesignTemplates,
  optimizeDesigns,
  parseDriversFromFile,
  parseMeasurementTraceFile,
  resolveDriveInput,
  sealedAlignmentFromFcQtc,
  sealedResponseFromFcQtc,
  simulateDesign,
} from "./lib/acoustics";
import {
  DRIVER_FORMULA_FIELDS,
  MECHANICAL_DERIVED_FIELDS,
  MOTOR_DERIVED_FIELDS,
  QUALITY_DERIVED_FIELDS,
  changedDriverFormulaFields,
  defaultDerivedFieldValue,
  defaultFormulaForField,
  deriveDriverFormulaValue,
  deriveMechanicalField,
  deriveMotorField,
  deriveQualityField,
  driverActiveFormulaForField,
  driverFormulaPromptSourceForChangedFields,
  driverFormulaValueDiffers,
  isDriverFormulaField,
  isMechanicalDerivedField,
  isMotorDerivedField,
  isQualityDerivedField,
  positiveNumber,
  reconcileDriverDerivedFields,
  reconcileMechanicalDerivedField,
  reconcileMotorDerivedField,
  reconcileQualityDerivedField,
} from "./lib/driverDerivations";
import type {
  DriverFormulaField,
  DriverFormulaKind,
  MechanicalDerivedField,
  MotorDerivedField,
  QualityDerivedField,
} from "./lib/driverDerivations";

type ChartTab = "response" | "spl" | "excursion" | "groupDelay" | "impulse" | "step" | "phase" | "impedance" | "port";
type Language = "ru" | "en";
type ScaleMode = "linear" | "log";
type ResizeTarget = "left" | "right";
type SidebarPanelId = "drivers" | "model";
type ChartToolPanelId = "inputs" | "corrections" | "measurements" | "compare";
type PanelArea = "sidebar" | "chartTools";
type FixedDriverFieldsByDriver = Record<string, DriverFormulaField[]>;
type AnalysisSnapshot = {
  driver: SpeakerDriver;
  designs: BoxDesign[];
  powerW: number;
  splInputMode: SplInputMode;
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
  measurement?: boolean;
  muted?: boolean;
}

interface ChartMarker {
  color: string;
  label: string;
  x: number;
  y: number;
}

interface FrozenReference {
  capturedAt: string;
  label: string;
  tab: ChartTab;
  series: Series[];
}

type ReferenceByTab = Partial<Record<ChartTab, FrozenReference>>;

type DriverFilterStatus = "all" | "verified" | "modified" | "user";

interface LibraryFilters {
  maxFsHz?: number;
  maxQts?: number;
  maxVasL?: number;
  minSdCm2?: number;
  minXmaxMm?: number;
  query: string;
  status: DriverFilterStatus;
}

interface MeasurementTrace {
  color: string;
  driverId: string;
  hidden: boolean;
  id: string;
  kind: MeasurementTraceKind;
  name: string;
  offsetDb: number;
  points: Point[];
  tab: ChartTab;
}

interface AcousticOptions {
  baffleStepDb: number;
  baffleStepHz: number;
  roomGainDb: number;
  roomGainStartHz: number;
}

interface ChartYScaleState {
  auto: boolean;
  max: number;
  min: number;
}

interface SealedZmaState {
  boxVolumeLiters: number;
  reOhm?: number;
  selectedMeasurementId?: string;
  targetQtc: number;
}

interface AddedMassZmaState {
  addedMassGrams: number;
  selectedMeasurementId?: string;
}

interface FreeAirZmaState {
  reOhm?: number;
  selectedMeasurementId?: string;
}

interface ProjectState {
  acousticOptions: AcousticOptions;
  activeTab: ChartTab;
  addedMassZma: AddedMassZmaState;
  freeAirZma: FreeAirZmaState;
  chartFrequencyMinHz: number;
  chartFrequencyMaxHz: number;
  chartStepTimeMinMs: number;
  chartStepTimeMaxMs: number;
  chartYScales: Record<ChartTab, ChartYScaleState>;
  compareDriverIds: string[];
  compareEnabled: boolean;
  designs: BoxDesign[];
  drivers: SpeakerDriver[];
  focusedDesignId: string;
  fixedDriverFields: FixedDriverFieldsByDriver;
  language: Language;
  libraryFilters: LibraryFilters;
  mechanicalDerivedField?: MechanicalDerivedField;
  motorDerivedField?: MotorDerivedField;
  qualityDerivedField?: QualityDerivedField;
  measurements: MeasurementTrace[];
  optimizerGoal: OptimizerGoal;
  powerW: number;
  referenceByTab: ReferenceByTab;
  selectedDriverId: string;
  sealedZma: SealedZmaState;
  splInputMode: SplInputMode;
}

type ProjectFile = Omit<ProjectState, "referenceByTab"> & {
  referenceByTab?: ReferenceByTab;
  version: 1;
};

type ProjectLoadSource = "default" | "share" | "storage";

interface ProjectLoadState {
  project: ProjectState;
  source: ProjectLoadSource;
}

type DriverIssue =
  | "invalidRequired"
  | "fieldOutOfRange"
  | "qtsLow"
  | "qtsHigh"
  | "qesNotAboveQts"
  | "qmsNotAboveQts"
  | "qtsFormulaMismatch"
  | "fsMmsVasMismatch"
  | "xmaxInvalid"
  | "powerInvalid";

type DriverRecommendation = "sealed" | "vented" | "mixed" | "review";

interface DriverProfile {
  ebp?: number;
  fieldIssues: Partial<Record<keyof SpeakerDriver, DriverIssue[]>>;
  issues: DriverIssue[];
  recommendation: DriverRecommendation;
}

interface ChartInputItem {
  label: string;
  note?: string;
  tone?: "warning" | "muted";
  value: string;
}

interface ChartInputGroup {
  id: keyof UiText["chartInputs"]["groups"];
  items: ChartInputItem[];
  label: string;
}

interface ResizeState {
  target: ResizeTarget;
  startX: number;
  startWidth: number;
}

interface PanelDragState {
  area: PanelArea;
  id: string;
}

const DRIVER_STORAGE_KEY = "speaker-builder-drivers-v1";
const LANGUAGE_STORAGE_KEY = "speaker-builder-language-v1";
const PROJECT_STORAGE_KEY = "speaker-builder-project-v1";
const PROJECT_SHARE_HASH_PARAM = "project";
const PROJECT_COMPRESSED_SHARE_HASH_PARAM = "projectz";
const PROJECT_SHARE_URL_MAX_LENGTH = 120_000;
const LEFT_PANEL_STORAGE_KEY = "speaker-builder-left-panel-width-v1";
const RIGHT_PANEL_STORAGE_KEY = "speaker-builder-right-panel-width-v1";
const SIDEBAR_PANEL_ORDER_STORAGE_KEY = "speaker-builder-sidebar-panel-order-v1";
const CHART_PANEL_ORDER_STORAGE_KEY = "speaker-builder-chart-panel-order-v1";
const LEFT_PANEL_LIMITS = { min: 240, max: 540, defaultValue: 320 };
const RIGHT_PANEL_LIMITS = { min: 260, max: 560, defaultValue: 340 };
const RESIZE_KEY_STEP = 16;
const CHART_FREQUENCY_MIN_LIMIT_HZ = 10;
const CHART_FREQUENCY_MIN_MAX_HZ = MAX_FREQUENCY_MAX_HZ / 2;
const DEFAULT_CHART_FREQUENCY_MIN_HZ = 10;
const CHART_STEP_TIME_MIN_LIMIT_MS = 0;
const CHART_STEP_TIME_MAX_LIMIT_MS = 250;
const CHART_STEP_TIME_MIN_MAX_MS = CHART_STEP_TIME_MAX_LIMIT_MS - 1;
const DEFAULT_CHART_STEP_TIME_MIN_MS = 0;
const DEFAULT_CHART_STEP_TIME_MAX_MS = CHART_STEP_TIME_MAX_LIMIT_MS;
const DEFAULT_CHART_Y_MIN = -36;
const DEFAULT_CHART_Y_MAX = 9;
const CHART_Y_LIMIT = 240;
const CHART_RANGE_PRESETS = [
  { label: "20-200", minHz: 20, maxHz: 200 },
  { label: "20-500", minHz: 20, maxHz: 500 },
  { label: "20-3k", minHz: 20, maxHz: 3000 },
  { label: "20-20k", minHz: 20, maxHz: 20000 },
];
type ChartRangePreset = { label: string; min: number; max: number };
const CHART_STEP_TIME_PRESETS = [
  { label: "0-50 ms", min: 0, max: 50 },
  { label: "0-100 ms", min: 0, max: 100 },
  { label: "0-250 ms", min: 0, max: 250 },
] satisfies ChartRangePreset[];
const DEFAULT_SIDEBAR_PANEL_ORDER: SidebarPanelId[] = ["drivers", "model"];
const DEFAULT_CHART_PANEL_ORDER: ChartToolPanelId[] = ["inputs", "corrections", "measurements", "compare"];
const DEFAULT_LIBRARY_FILTERS: LibraryFilters = {
  query: "",
  status: "all",
};
const DEFAULT_ACOUSTIC_OPTIONS: AcousticOptions = {
  baffleStepDb: 0,
  baffleStepHz: 450,
  roomGainDb: 0,
  roomGainStartHz: 80,
};
const DEFAULT_SEALED_ZMA: SealedZmaState = {
  boxVolumeLiters: 10,
  targetQtc: 0.707,
};
const DEFAULT_ADDED_MASS_ZMA: AddedMassZmaState = {
  addedMassGrams: 10,
};
const DEFAULT_FREE_AIR_ZMA: FreeAirZmaState = {};
const SEALED_TARGET_COLOR = "#9333ea";

const driverFields: Array<{
  key: keyof SpeakerDriver;
  label: string;
  unit: string;
  step: string;
  min: number;
  max?: number;
}> = [
  { key: "fsHz", label: "Fs", unit: "Hz", step: "0.1", min: 1, max: 2000 },
  { key: "qts", label: "Qts", unit: "", step: "0.01", min: 0.01, max: 5 },
  { key: "qes", label: "Qes", unit: "", step: "0.01", min: 0.01, max: 10 },
  { key: "qms", label: "Qms", unit: "", step: "0.1", min: 0.1, max: 100 },
  { key: "vasL", label: "Vas", unit: "L", step: "0.1", min: 0.01, max: 10000 },
  { key: "sdCm2", label: "Sd", unit: "cm²", step: "0.1", min: 0.1, max: 10000 },
  { key: "reOhm", label: "Re", unit: "Ω", step: "0.01", min: 0.01, max: 100 },
  { key: "leMh", label: "Le", unit: "mH", step: "0.01", min: 0, max: 100 },
  { key: "xmaxMm", label: "Xmax", unit: "mm", step: "0.1", min: 0.01, max: 100 },
  { key: "peW", label: "Pe", unit: "W", step: "1", min: 0.1, max: 100000 },
  { key: "sensitivityDb", label: "Sens.", unit: "dB", step: "0.1", min: 40, max: 130 },
  { key: "mmsG", label: "Mms", unit: "g", step: "0.1", min: 0.01, max: 10000 },
  { key: "cmsMmN", label: "Cms", unit: "mm/N", step: "0.01", min: 0.0001, max: 1000 },
  { key: "blTm", label: "BL", unit: "Tm", step: "0.1", min: 0.01, max: 100 },
];
const driverFieldByKey = new Map(driverFields.map((field) => [field.key, field]));
const driverFieldLimits = new Map(driverFields.map((field) => [field.key, { min: field.min, max: field.max }]));
const requiredDriverNumberFields = new Set<keyof SpeakerDriver>(["fsHz", "qts", "vasL", "sdCm2", "reOhm"]);

const chartTabs: ChartTab[] = ["response", "spl", "excursion", "groupDelay", "impulse", "step", "phase", "impedance", "port"];
const DEFAULT_CHART_Y_RANGES = {
  response: [DEFAULT_CHART_Y_MIN, DEFAULT_CHART_Y_MAX],
  spl: [60, 110],
  excursion: [0, 10],
  groupDelay: [0, 15],
  impulse: [-1.1, 1.1],
  step: [-1.1, 1.1],
  phase: [-360, 90],
  impedance: [0, 40],
  port: [0, 0.2],
} satisfies Record<ChartTab, [number, number]>;
const optimizerGoals: OptimizerGoal[] = ["balanced", "flat", "deep", "compact", "transient", "output"];
const APERIODIC_DAMPING_PRESETS = [
  { key: "light", ql: 4.5 },
  { key: "medium", ql: 1.7 },
  { key: "heavy", ql: 0.8 },
] as const;
type AperiodicDampingPresetKey = (typeof APERIODIC_DAMPING_PRESETS)[number]["key"];
const SPL_INPUT_MODES: SplInputMode[] = ["oneWatt", "twoPointEightThreeVolt", "nominalPower", "rePower"];
const APERIODIC_MODES: AperiodicMode[] = ["flow", "ql"];
const APERIODIC_MATERIAL_KEYS: AperiodicMaterial[] = ["foam", "felt", "denseFelt", "custom"];

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
      spl: "SPL",
      excursion: "Ход",
      groupDelay: "Групповая задержка",
      impulse: "Импульс",
      step: "Переходная",
      phase: "Фаза",
      impedance: "Импеданс",
      port: "Порт",
    } satisfies Record<ChartTab, string>,
    chartTitles: {
      response: "АЧХ",
      spl: "SPL",
      excursion: "Ход диффузора",
      groupDelay: "Групповая задержка",
      impulse: "Импульсная характеристика",
      step: "Переходная характеристика",
      phase: "Фаза",
      impedance: "Импеданс",
      port: "Порт / пассивный радиатор",
    } satisfies Record<ChartTab, string>,
    chartRange: "До",
    chartScale: {
      autoY: "Y авто",
      from: "От",
      reset: "Сброс",
      to: "До",
      warning: "Выше 500 Гц T/S расчет не заменяет измеренную FRD: не учитываются резонансы диффузора, направленность и детали конструкции.",
      yMax: "Y макс",
      yMin: "Y мин",
    },
    chartView: {
      collapse: "Свернуть график",
      expand: "Развернуть график",
    },
    chartMarkers: {
      f3: "F3",
      f6: "F6",
      fb: "Fb",
      maxExcursion: "Макс. ход",
      maxPort: "Макс. порт",
      maxSpl: "Макс. SPL",
      minZ: "Zmin",
      peak: "Пик",
    },
    axisLabels: {
      frequency: "Частота, Гц",
      normalized: "норм.",
      phase: "°",
      time: "Время, мс",
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
        fieldOutOfRange: "Одно или несколько значений вне рабочего диапазона поля",
        invalidRequired: "Проверьте Fs, Qts, Vas, Sd и Re: обязательные параметры должны быть больше нуля",
        powerInvalid: "Pe должен быть больше нуля или пустым",
        qesNotAboveQts: "Qes должен быть больше Qts",
        qmsNotAboveQts: "Qms должен быть больше Qts",
        qtsFormulaMismatch: "Qts не согласуется с Qes и Qms",
        fsMmsVasMismatch: "Fs, Mms, Vas, Sd и Cms заметно расходятся между собой",
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
    driverDerivation: {
      derive: "рассчитать",
      derived: (value: string, unit: string) => `расчет: ${value}${unit ? ` ${unit}` : ""}`,
      fixed: "фикс",
      fixedTitle: (label: string) => `${label} зафиксирован как вход формулы и не будет мигать как кандидат на пересчет.`,
      promptChain: (chain: string) => `цепь: ${chain}`,
      manual: "ручной ввод",
      measured: "замер",
      measuredTitle: (label: string) => `${label} используется как введенный или измеренный вход формулы.`,
      title: (label: string) =>
        `${label} выбран расчетным параметром. Остальные параметры этой формулы считаются входами. Введите это поле вручную, чтобы снова зафиксировать его.`,
      unavailable: (label: string) => `Не хватает данных, чтобы рассчитать ${label}`,
    },
    driverRelations: {
      chain: "Цепочка",
      formulas: {
        mechanical: "Fs/Mms/Cms/Vas/Sd",
        motorBl: "BL = √(2π Fs Mms Re / Qes)",
        motorFs: "Fs = Qes BL² / (2π Mms Re)",
        motorQes: "Qes = 2π Fs Mms Re / BL²",
        motorRe: "Re = Qes BL² / (2π Fs Mms)",
        quality: "1/Qts = 1/Qes + 1/Qms",
      },
      graphs: "графики",
      mismatches: "Невязки",
      noChain: "Выберите параметр как расчетный, чтобы увидеть цепочку",
      ok: "формулы сходятся",
      title: "Связи T/S",
    },
    chartInputs: {
      title: "Входы графика",
      groups: {
        driver: "Динамик",
        box: "Корпус",
        global: "Режим",
        corrections: "Коррекция",
      },
      notes: {
        estimatedSensitivity: "Sens. пустой: SPL не привязан к даташитному 1 W/1 m",
        noFocusedDesign: "Выберите конфигурацию",
      },
    },
    driverImpact: {
      current: "текущий",
      rows: {
        damping: {
          charts: "АЧХ, SPL, фаза, задержка, ход, импеданс",
          params: "Fs, Vas, Cms, Qts/Qes/Qms, Mms, BL",
        },
        level: {
          charts: "SPL и уровень чувствительности",
          params: "Sens.",
        },
        limits: {
          charts: "ход, Max SPL, предупреждения",
          params: "Xmax, Pe",
        },
        motor: {
          charts: "импеданс и верхняя часть диапазона",
          params: "Re, Le",
        },
        piston: {
          charts: "ход, порт, SPL, импеданс",
          params: "Sd",
        },
      },
      title: "Влияние параметров",
    },
    driverSource: {
      title: "Паспорт данных",
      open: "Открыть",
      sourceUnknown: "Источник не указан",
      manual: "ручной ввод",
      modified: "изменено",
      verified: "проверено",
      reset: "Вернуть",
      notes: {
        modifiedFromDatasheet: "Параметры изменены относительно даташита",
        usherPeRms: "Pe внесен как 70 W RMS; в даташите также указан максимум 100 W",
        sbXmaxPeakToPeak: "Xmax внесен как 5.5 mm в одну сторону из 11 mm пик-пик",
      } satisfies Record<DriverSourceNote, string>,
    },
    library: {
      title: "Библиотека",
      search: "Поиск",
      status: "Статус",
      all: "Все",
      verified: "Проверенные",
      modified: "Измененные",
      user: "Пользовательские",
      maxFs: "Fs до",
      maxQts: "Qts до",
      maxVas: "Vas до",
      minSd: "Sd от",
      minXmax: "Xmax от",
      visible: (visible: number, total: number) => `${visible} / ${total}`,
    },
    compare: {
      title: "Сравнение динамиков",
      enable: "Сравнивать",
      hint: "Одна выбранная конфигурация для отмеченных динамиков",
      mode: "Динамики",
      focusedConfig: (name: string) => `на графике: ${name}`,
    },
    measurements: {
      title: "Измерения",
      import: "Импорт FRD/ZMA",
      imported: (count: number, total: number) => `Для драйвера: ${count} / всего ${total}`,
      visibleHint: "FRD: АЧХ/SPL, ZMA: импеданс",
      clear: "Очистить все",
      clearCurrent: "Очистить драйвер",
      remove: "Удалить измерение",
      rename: "Имя измерения",
      show: "Показать на графике",
      hide: "Скрыть с графика",
      fsFromFreeAir: (fs: string) => `Fs ${fs} - по свободному воздуху`,
      fsFromDriver: (fs: string) => `Fs ${fs} - из параметров динамика`,
      applyToDriver: "Применить к динамику",
      applied: "Измеренные параметры применены к динамику",
      sealedZma: {
        alignment: "Выравнивание",
        alignmentLabels: {
          bessel: "≈ Бессель BL2",
          butterworth: "≈ Баттерворт B2",
          chebyshev: "≈ Чебышев C2",
          critical: "критическое (Qtc≈0.5)",
          peaked: "сильный горб",
        },
        boxVolume: "Vb тест",
        conditions: "Условия: ZMA снят с динамиком в закрытом ящике объёма Vb тест",
        confidence: {
          fair: "среднее",
          good: "хорошее",
          poor: "слабое",
        },
        f3: "F3",
        peak: "Пик",
        currentAboveTarget: "Qtc выше цели - увеличь объем или добавь демпфирование",
        currentBelowTarget: "Qtc ниже цели - объем можно уменьшить",
        derivedSeries: "Оценка ЗЯ по ZMA",
        f12: "F1 / F2",
        fc: "Fc",
        noZma: "Загрузи ZMA закрытого ящика",
        qec: "Qec",
        qmc: "Qmc",
        qtc: "Qtc",
        qtsByZma: "Qts по ZMA",
        reDc: "Re (DC)",
        responseHint: "На АЧХ: пунктиром НЧ-оценка по ZMA и цель Qtc",
        targetQtc: "Цель Qtc",
        targetSeries: "Цель ЗЯ (Qtc)",
        title: "Закрытый ящик по ZMA",
        tsPredicted: "T/S Fc / Qtc",
        tsTargetVolume: "Vb по T/S для цели",
        vasByZma: "Vas по ZMA",
        zma: "ZMA",
        zMax: "Zmax",
      },
      addedMass: {
        cmsByZma: "Cms по ZMA",
        conditions: "Условия: ZMA снят в свободном воздухе с известным грузом на диффузоре",
        fm: "Fm",
        hint: "Sd берется из параметров динамика",
        invalid: "Пик выбранного ZMA должен быть ниже Fs динамика",
        mass: "Груз",
        mmsByZma: "Mms по ZMA",
        noZma: "Загрузи ZMA с грузом на диффузоре",
        title: "T/S по добавленной массе",
        vasByZma: "Vas по ZMA",
        zma: "ZMA с грузом",
      },
      freeAir: {
        conditions: "Условия: ZMA снят в свободном воздухе без ящика и груза",
        fs: "Fs",
        invalid: "Пик слишком слабый для оценки добротностей",
        noZma: "Загрузи ZMA свободного воздуха",
        qes: "Qes",
        qms: "Qms",
        qts: "Qts",
        reByZma: "Re по ZMA",
        reDc: "Re (DC)",
        reHint: "Re лучше измерить омметром - оценка по кривой завышена",
        title: "T/S по свободному воздуху",
        zma: "ZMA",
      },
      splAlign: {
        aligned: "SPL выровнен по модели",
        auto: "Авто по модели",
        conditions: "FRD может быть снят на любом уровне - сдвиг выравнивает его с моделью SPL",
        failed: "Не удалось выровнять - нет пересечения частот",
        frd: "FRD",
        hint: "Сдвиг применяется на вкладке SPL",
        noFrd: "Загрузи FRD измерение",
        offset: "Сдвиг",
        reset: "Сброс",
        title: "Выравнивание SPL",
      },
    },
    corrections: {
      title: "Поправки графика",
      roomGain: "Подъем комнаты",
      roomStart: "Ниже",
      baffleStep: "Потеря от щита",
      baffleHz: "Частота",
    },
    duplicate: "Дублировать",
    excursion: "Ход",
    exportJson: "Экспорт проекта JSON",
    exportReport: "Экспорт отчета HTML",
    exportPng: "Экспорт PNG",
    exportSvg: "Экспорт SVG",
    eguiPrototype: "egui",
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
    calculationPassport: {
      empty: "Нет рассчитанной активной конфигурации.",
      groups: {
        alignment: "Настройка",
        drive: "Вход",
        limits: "Ограничения",
        warnings: "Предупреждения",
      },
      labels: {
        electricalPower: "Эл. мощность",
        peakReduction: "Снижение пика",
        voltage: "Напряжение",
        zPeak: "Пик Z",
      },
      stale: "Паспорт показывает последний ручной пересчет.",
      title: "Паспорт расчета",
    },
    aperiodicDamping: "Демпф. Ql",
    aperiodicEffectiveQ: "Qeff",
    aperiodicFlowResistance: "σ потока",
    aperiodicImpedancePeak: "Пик Z",
    aperiodicMaterial: "Материал",
    aperiodicMaterials: {
      custom: "Свой",
      denseFelt: "Плотный войлок",
      felt: "Войлок",
      foam: "Поролон",
    } satisfies Record<AperiodicMaterial, string>,
    aperiodicMode: "Модель",
    aperiodicModes: {
      flow: "Ra / материал",
      ql: "Упрощ. Ql",
    } satisfies Record<AperiodicMode, string>,
    aperiodicPeakReduction: "ΔZ пик",
    aperiodicRa: "Ra",
    aperiodicThickness: "Толщина",
    aperiodicDampingPreset: "Демпф.",
    aperiodicDampingPresets: {
      light: "Легкий",
      medium: "Средний",
      heavy: "Сильный",
    } satisfies Record<AperiodicDampingPresetKey, string>,
    aperiodicVentDiameter: "Отверстие Ø",
    aperiodicVentShape: "Отверстие",
    aperiodicVentCount: "Отверстия",
    aperiodicVentRatio: "Avent/Sd",
    aperiodicVentWeak: "слабое влияние",
    aperiodicVentNormal: "рабочий диапазон",
    aperiodicVentLarge: "нужен плотный материал",
    splInputMode: "SPL вход",
    splInputModes: {
      nominalPower: "Вт в ном.",
      oneWatt: "1 W",
      rePower: "Вт по Re",
      twoPointEightThreeVolt: "2.83 V",
    } satisfies Record<SplInputMode, string>,
    shareProjectLink: "Скопировать ссылку на проект",
    model: "Модель",
    noActiveDesigns: "Нет активных конфигураций.",
    passiveRadiatorCount: "PR шт.",
    passiveRadiatorExcursion: "Ход PR",
    passiveRadiatorMms: "Mmp PR",
    passiveRadiatorQms: "Qms PR",
    passiveRadiatorSd: "Sd PR",
    passiveRadiatorTuning: "Fb PR",
    passiveRadiatorXmax: "Xmax PR",
    bandpassRear: "Задняя Vb",
    bandpassFront: "Передняя Vf",
    portDiameter: "Порт Ø",
    portHeight: "Высота",
    portShape: "Порт",
    portShapes: {
      round: "Круглый",
      slot: "Щелевой",
    },
    portWidth: "Ширина",
    ports: "Порты",
    panelLayout: {
      drag: "Перетащить панель",
      moveDown: "Ниже",
      moveUp: "Выше",
    },
    power: "Мощность",
    projectImported: "Проект загружен",
    projectLinkCopied: "Ссылка на проект скопирована",
    projectLinkCopyFailed: "Не удалось скопировать ссылку",
    projectLinkLoaded: "Проект загружен из ссылки",
    projectLinkTooLarge: "Ссылка слишком длинная: экспортируйте проект JSON",
    projectSynced: "Проект обновлен из другой вкладки",
    requiredFieldsMissing: "Файл не содержит обязательные поля Fs, Qts, Vas, Sd, Re.",
    recalculate: "Пересчитать",
    reference: "Эталон",
    clearReference: "Очистить эталон",
    reset: "Сбросить",
    resizeConfigPanel: "Изменить ширину панели конфигураций",
    resizeDriverPanel: "Изменить ширину панели динамиков",
    warnings: "Предупреждения",
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
      maxSpl: "Макс. SPL",
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
      maxSplLimitedByPe: (frequency: string) => `SPL ограничен Pe на ${frequency} Гц`,
      maxSplLimitedByPassive: (frequency: string) => `SPL ограничен ходом пассивного радиатора на ${frequency} Гц`,
      maxSplLimitedByPort: (frequency: string) => `SPL ограничен портом на ${frequency} Гц`,
      maxSplLimitedByXmax: (frequency: string) => `SPL ограничен Xmax на ${frequency} Гц`,
      bandpassApproximate: "Бандпасс: 4-й порядок (закрытая задняя + портированная передняя камера); достоверен только в полосе НЧ",
      multiplePortsLong: "Несколько портов сильно увеличивают требуемую длину",
      passiveXmaxExceeded: (frequency: string) => `Превышен Xmax пассивного радиатора на ${frequency} Гц`,
      powerExceeded: (power: string) => `Заданная мощность выше Pe: ${power} W`,
      portDiameterSmall: "Диаметр порта мал для площади диффузора",
      portMayNotFit: "Порт может не поместиться в корпус",
      portNearNoise: (mach: string) => `Скорость воздуха близка к шумовому пределу: Mach ${mach}`,
      portResonanceLow: (frequency: string) => `Низкая первая резонансная частота порта: ${frequency} Гц`,
      portVeryLong: "Порт очень длинный для этого корпуса",
      qesEstimated: "Qes оценен по Qts",
      qmsEstimated: "Qms оценен по Qts/Qes",
      ventTooShort: "Порт слишком короткий для этого диаметра/настройки",
      xmaxExceeded: (frequency: string) => `Превышен Xmax на ${frequency} Гц`,
    },
    table: {
      design: "Конфигурация",
      excursion: "Ход",
      gd: "ГЗ 30 / 40",
      maxSpl: "Макс. SPL",
      peak: "Пик",
      port: "Порт",
      spl: "SPL 50 / 80",
      tune: "Настройка",
      vb: "Vb",
      zmin: "Zmin",
    },
    limitReasons: {
      passive: "PR",
      power: "Pe",
      port: "порт",
      xmax: "Xmax",
    } satisfies Record<SplLimitReason, string>,
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
      spl: "SPL",
      excursion: "Excursion",
      groupDelay: "Group delay",
      impulse: "Impulse",
      step: "Step",
      phase: "Phase",
      impedance: "Impedance",
      port: "Port",
    } satisfies Record<ChartTab, string>,
    chartTitles: {
      response: "Frequency response",
      spl: "SPL",
      excursion: "Cone excursion",
      groupDelay: "Group delay",
      impulse: "Impulse response",
      step: "Step response",
      phase: "Phase",
      impedance: "Impedance",
      port: "Port / passive radiator",
    } satisfies Record<ChartTab, string>,
    chartRange: "To",
    chartScale: {
      autoY: "Auto Y",
      from: "From",
      reset: "Reset",
      to: "To",
      warning: "Above 500 Hz, T/S modeling does not replace measured FRD: breakup, directivity, and cone details are not modeled.",
      yMax: "Y max",
      yMin: "Y min",
    },
    chartView: {
      collapse: "Collapse chart",
      expand: "Expand chart",
    },
    chartMarkers: {
      f3: "F3",
      f6: "F6",
      fb: "Fb",
      maxExcursion: "Max excursion",
      maxPort: "Max port",
      maxSpl: "Max SPL",
      minZ: "Zmin",
      peak: "Peak",
    },
    axisLabels: {
      frequency: "Frequency, Hz",
      normalized: "norm",
      phase: "°",
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
        fieldOutOfRange: "One or more values are outside the field range",
        invalidRequired: "Check Fs, Qts, Vas, Sd, and Re: required parameters must be above zero",
        powerInvalid: "Pe must be above zero or empty",
        qesNotAboveQts: "Qes must be greater than Qts",
        qmsNotAboveQts: "Qms must be greater than Qts",
        qtsFormulaMismatch: "Qts does not match Qes and Qms",
        fsMmsVasMismatch: "Fs, Mms, Vas, Sd, and Cms are noticeably inconsistent",
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
    driverDerivation: {
      derive: "derive",
      derived: (value: string, unit: string) => `derived: ${value}${unit ? ` ${unit}` : ""}`,
      fixed: "fixed",
      fixedTitle: (label: string) => `${label} is pinned as a formula input and will not pulse as a recalculation candidate.`,
      promptChain: (chain: string) => `chain: ${chain}`,
      manual: "manual input",
      measured: "measured",
      measuredTitle: (label: string) => `${label} is used as an entered or measured formula input.`,
      title: (label: string) =>
        `${label} is the derived parameter. The other parameters in this formula are treated as inputs. Type into this field to pin it manually again.`,
      unavailable: (label: string) => `Not enough data to derive ${label}`,
    },
    driverRelations: {
      chain: "Chain",
      formulas: {
        mechanical: "Fs/Mms/Cms/Vas/Sd",
        motorBl: "BL = √(2π Fs Mms Re / Qes)",
        motorFs: "Fs = Qes BL² / (2π Mms Re)",
        motorQes: "Qes = 2π Fs Mms Re / BL²",
        motorRe: "Re = Qes BL² / (2π Fs Mms)",
        quality: "1/Qts = 1/Qes + 1/Qms",
      },
      graphs: "charts",
      mismatches: "Residuals",
      noChain: "Choose a parameter as derived to see the chain",
      ok: "formulas match",
      title: "T/S relations",
    },
    chartInputs: {
      title: "Chart inputs",
      groups: {
        driver: "Driver",
        box: "Box",
        global: "Mode",
        corrections: "Correction",
      },
      notes: {
        estimatedSensitivity: "Sens. is empty: SPL is not calibrated to datasheet 1 W/1 m",
        noFocusedDesign: "Select a configuration",
      },
    },
    driverImpact: {
      current: "current",
      rows: {
        damping: {
          charts: "response, SPL, phase, delay, excursion, impedance",
          params: "Fs, Vas, Cms, Qts/Qes/Qms, Mms, BL",
        },
        level: {
          charts: "SPL and sensitivity level",
          params: "Sens.",
        },
        limits: {
          charts: "excursion, Max SPL, warnings",
          params: "Xmax, Pe",
        },
        motor: {
          charts: "impedance and upper range",
          params: "Re, Le",
        },
        piston: {
          charts: "excursion, port, SPL, impedance",
          params: "Sd",
        },
      },
      title: "Parameter impact",
    },
    driverSource: {
      title: "Data passport",
      open: "Open",
      sourceUnknown: "Source not specified",
      manual: "manual entry",
      modified: "modified",
      verified: "verified",
      reset: "Reset",
      notes: {
        modifiedFromDatasheet: "Parameters are modified from the datasheet values",
        usherPeRms: "Pe is entered as 70 W RMS; the datasheet also lists 100 W maximum input",
        sbXmaxPeakToPeak: "Xmax is entered as 5.5 mm one-way from 11 mm peak-to-peak travel",
      } satisfies Record<DriverSourceNote, string>,
    },
    library: {
      title: "Library",
      search: "Search",
      status: "Status",
      all: "All",
      verified: "Verified",
      modified: "Modified",
      user: "User",
      maxFs: "Fs max",
      maxQts: "Qts max",
      maxVas: "Vas max",
      minSd: "Sd min",
      minXmax: "Xmax min",
      visible: (visible: number, total: number) => `${visible} / ${total}`,
    },
    compare: {
      title: "Driver comparison",
      enable: "Compare",
      hint: "One selected enclosure for checked drivers",
      mode: "Drivers",
      focusedConfig: (name: string) => `chart: ${name}`,
    },
    measurements: {
      title: "Measurements",
      import: "Import FRD/ZMA",
      imported: (count: number, total: number) => `Driver: ${count} / total ${total}`,
      visibleHint: "FRD: response/SPL, ZMA: impedance",
      clear: "Clear all",
      clearCurrent: "Clear driver",
      remove: "Remove measurement",
      rename: "Measurement name",
      show: "Show on chart",
      hide: "Hide from chart",
      fsFromFreeAir: (fs: string) => `Fs ${fs} - from the free-air measurement`,
      fsFromDriver: (fs: string) => `Fs ${fs} - from the driver parameters`,
      applyToDriver: "Apply to driver",
      applied: "Measured values applied to the driver",
      sealedZma: {
        alignment: "Alignment",
        alignmentLabels: {
          bessel: "≈ Bessel BL2",
          butterworth: "≈ Butterworth B2",
          chebyshev: "≈ Chebyshev C2",
          critical: "critically damped (Qtc≈0.5)",
          peaked: "strongly peaked",
        },
        boxVolume: "Test Vb",
        conditions: "Conditions: ZMA taken with the driver in a sealed box of the Test Vb volume",
        confidence: {
          fair: "fair",
          good: "good",
          poor: "poor",
        },
        f3: "F3",
        peak: "Peak",
        currentAboveTarget: "Qtc is above target - increase volume or add damping",
        currentBelowTarget: "Qtc is below target - volume can be smaller",
        derivedSeries: "ZMA closed estimate",
        f12: "F1 / F2",
        fc: "Fc",
        noZma: "Load a sealed-box ZMA",
        qec: "Qec",
        qmc: "Qmc",
        qtc: "Qtc",
        qtsByZma: "Qts by ZMA",
        reDc: "Re (DC)",
        responseHint: "Dashed ZMA estimate and target Qtc curves appear on Response",
        targetQtc: "Target Qtc",
        targetSeries: "Sealed target (Qtc)",
        title: "Sealed box from ZMA",
        tsPredicted: "T/S Fc / Qtc",
        tsTargetVolume: "T/S Vb for target",
        vasByZma: "Vas by ZMA",
        zma: "ZMA",
        zMax: "Zmax",
      },
      addedMass: {
        cmsByZma: "Cms by ZMA",
        conditions: "Conditions: ZMA taken in free air with a known mass on the cone",
        fm: "Fm",
        hint: "Sd comes from the driver parameters",
        invalid: "The selected ZMA peak must be below the driver Fs",
        mass: "Added mass",
        mmsByZma: "Mms by ZMA",
        noZma: "Load a free-air ZMA with mass on the cone",
        title: "Added-mass T/S",
        vasByZma: "Vas by ZMA",
        zma: "ZMA with mass",
      },
      freeAir: {
        conditions: "Conditions: ZMA taken in free air without a box or added mass",
        fs: "Fs",
        invalid: "The peak is too weak to estimate Q factors",
        noZma: "Load a free-air ZMA",
        qes: "Qes",
        qms: "Qms",
        qts: "Qts",
        reByZma: "Re by ZMA",
        reDc: "Re (DC)",
        reHint: "Measure Re with an ohmmeter - the curve estimate reads high",
        title: "Free-air T/S",
        zma: "ZMA",
      },
      splAlign: {
        aligned: "SPL aligned to the model",
        auto: "Auto to model",
        conditions: "The FRD can be taken at any level - the offset aligns it with the modeled SPL",
        failed: "Alignment failed - no frequency overlap",
        frd: "FRD",
        hint: "The offset applies on the SPL tab",
        noFrd: "Load an FRD measurement",
        offset: "Offset",
        reset: "Reset",
        title: "SPL alignment",
      },
    },
    corrections: {
      title: "Chart corrections",
      roomGain: "Room gain",
      roomStart: "Below",
      baffleStep: "Baffle step",
      baffleHz: "Frequency",
    },
    duplicate: "Duplicate",
    excursion: "Excursion",
    exportJson: "Export project JSON",
    exportReport: "Export HTML report",
    exportPng: "Export PNG",
    exportSvg: "Export SVG",
    eguiPrototype: "egui",
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
    calculationPassport: {
      empty: "No calculated active configuration.",
      groups: {
        alignment: "Alignment",
        drive: "Input",
        limits: "Limits",
        warnings: "Warnings",
      },
      labels: {
        electricalPower: "Electrical power",
        peakReduction: "Peak reduction",
        voltage: "Voltage",
        zPeak: "Z peak",
      },
      stale: "Passport shows the last manual recalculation.",
      title: "Calculation passport",
    },
    aperiodicDamping: "Damping Ql",
    aperiodicEffectiveQ: "Qeff",
    aperiodicFlowResistance: "Flow σ",
    aperiodicImpedancePeak: "Z peak",
    aperiodicMaterial: "Material",
    aperiodicMaterials: {
      custom: "Custom",
      denseFelt: "Dense felt",
      felt: "Felt",
      foam: "Foam",
    } satisfies Record<AperiodicMaterial, string>,
    aperiodicMode: "Model",
    aperiodicModes: {
      flow: "Ra / material",
      ql: "Simple Ql",
    } satisfies Record<AperiodicMode, string>,
    aperiodicPeakReduction: "Peak ΔZ",
    aperiodicRa: "Ra",
    aperiodicThickness: "Thickness",
    aperiodicDampingPreset: "Damping",
    aperiodicDampingPresets: {
      light: "Light",
      medium: "Medium",
      heavy: "Heavy",
    } satisfies Record<AperiodicDampingPresetKey, string>,
    aperiodicVentDiameter: "Vent Ø",
    aperiodicVentShape: "Vent",
    aperiodicVentCount: "Vents",
    aperiodicVentRatio: "Avent/Sd",
    aperiodicVentWeak: "weak effect",
    aperiodicVentNormal: "working range",
    aperiodicVentLarge: "needs dense material",
    splInputMode: "SPL input",
    splInputModes: {
      nominalPower: "W nominal",
      oneWatt: "1 W",
      rePower: "W by Re",
      twoPointEightThreeVolt: "2.83 V",
    } satisfies Record<SplInputMode, string>,
    shareProjectLink: "Copy project link",
    model: "Model",
    noActiveDesigns: "No active configurations.",
    passiveRadiatorCount: "PR count",
    passiveRadiatorExcursion: "PR excursion",
    passiveRadiatorMms: "PR Mmp",
    passiveRadiatorQms: "PR Qms",
    passiveRadiatorSd: "PR Sd",
    passiveRadiatorTuning: "PR Fb",
    passiveRadiatorXmax: "PR Xmax",
    bandpassRear: "Rear Vb",
    bandpassFront: "Front Vf",
    portDiameter: "Port Ø",
    portHeight: "Height",
    portShape: "Port",
    portShapes: {
      round: "Round",
      slot: "Slot",
    },
    portWidth: "Width",
    ports: "Ports",
    panelLayout: {
      drag: "Drag panel",
      moveDown: "Move down",
      moveUp: "Move up",
    },
    power: "Power",
    projectImported: "Project loaded",
    projectLinkCopied: "Project link copied",
    projectLinkCopyFailed: "Could not copy the link",
    projectLinkLoaded: "Project loaded from link",
    projectLinkTooLarge: "Link is too long: export project JSON instead",
    projectSynced: "Project updated from another tab",
    requiredFieldsMissing: "File must contain Fs, Qts, Vas, Sd, and Re.",
    recalculate: "Recalculate",
    reference: "Reference",
    clearReference: "Clear reference",
    reset: "Reset",
    resizeConfigPanel: "Resize configuration panel",
    resizeDriverPanel: "Resize driver panel",
    warnings: "Warnings",
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
      maxSpl: "Max SPL",
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
      maxSplLimitedByPe: (frequency: string) => `Max SPL limited by Pe at ${frequency} Hz`,
      maxSplLimitedByPassive: (frequency: string) => `Max SPL limited by passive radiator excursion at ${frequency} Hz`,
      maxSplLimitedByPort: (frequency: string) => `Max SPL limited by port at ${frequency} Hz`,
      maxSplLimitedByXmax: (frequency: string) => `Max SPL limited by Xmax at ${frequency} Hz`,
      bandpassApproximate: "Bandpass: 4th-order (sealed rear + ported front chamber); valid in the low-frequency band only",
      multiplePortsLong: "Multiple ports make the tuning tube long",
      passiveXmaxExceeded: (frequency: string) => `Passive radiator Xmax exceeded at ${frequency} Hz`,
      powerExceeded: (power: string) => `Power exceeds Pe: ${power} W`,
      portDiameterSmall: "Port diameter is small for cone area",
      portMayNotFit: "Port may not fit inside the box",
      portNearNoise: (mach: string) => `Port air speed near noise limit: Mach ${mach}`,
      portResonanceLow: (frequency: string) => `Low first port resonance: ${frequency} Hz`,
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
      maxSpl: "Max SPL",
      peak: "Peak",
      port: "Port",
      spl: "SPL 50 / 80",
      tune: "Tune",
      vb: "Vb",
      zmin: "Zmin",
    },
    limitReasons: {
      passive: "PR",
      power: "Pe",
      port: "port",
      xmax: "Xmax",
    } satisfies Record<SplLimitReason, string>,
    type: "Type",
  },
} as const;

type UiText = (typeof UI_TEXT)[Language];

function App() {
  const initialProjectRef = useRef<ProjectLoadState | null>(null);
  if (!initialProjectRef.current) {
    initialProjectRef.current = loadProjectState();
  }
  const initialProject = initialProjectRef.current.project;
  const [language, setLanguage] = useState<Language>(() => initialProject.language);
  const [drivers, setDrivers] = useState<SpeakerDriver[]>(() => initialProject.drivers);
  const [libraryFilters, setLibraryFilters] = useState<LibraryFilters>(() => initialProject.libraryFilters);
  const [selectedDriverId, setSelectedDriverId] = useState(() => initialProject.selectedDriverId);
  const selectedDriver = drivers.find((driver) => driver.id === selectedDriverId) ?? drivers[0];
  const [designs, setDesigns] = useState<BoxDesign[]>(() => initialProject.designs);
  const [analysisSnapshot, setAnalysisSnapshot] = useState<AnalysisSnapshot>(() =>
    createAnalysisSnapshot(selectedDriver, initialProject.designs, initialProject.powerW, initialProject.splInputMode),
  );
  const [analysisResults, setAnalysisResults] = useState<SimulationResult[]>([]);
  const [chartResults, setChartResults] = useState<SimulationResult[]>([]);
  const [optimizerCandidates, setOptimizerCandidates] = useState<OptimizerCandidate[]>([]);
  const [analysisPending, setAnalysisPending] = useState(true);
  const [chartPending, setChartPending] = useState(true);
  const [focusedDesignId, setFocusedDesignId] = useState(initialProject.focusedDesignId);
  const [fixedDriverFields, setFixedDriverFields] = useState<FixedDriverFieldsByDriver>(() =>
    initialProject.fixedDriverFields,
  );
  const selectedFixedDriverFields = fixedDriverFields[selectedDriver.id] ?? [];
  const [activeTab, setActiveTab] = useState<ChartTab>(initialProject.activeTab);
  const [chartFrequencyMinHz, setChartFrequencyMinHz] = useState(initialProject.chartFrequencyMinHz);
  const [chartFrequencyMaxHz, setChartFrequencyMaxHz] = useState(initialProject.chartFrequencyMaxHz);
  const [chartStepTimeMinMs, setChartStepTimeMinMs] = useState(initialProject.chartStepTimeMinMs);
  const [chartStepTimeMaxMs, setChartStepTimeMaxMs] = useState(initialProject.chartStepTimeMaxMs);
  const [chartYScales, setChartYScales] = useState<Record<ChartTab, ChartYScaleState>>(() => initialProject.chartYScales);
  const [chartExpanded, setChartExpanded] = useState(false);
  const [optimizerGoal, setOptimizerGoal] = useState<OptimizerGoal>(initialProject.optimizerGoal);
  const [powerW, setPowerW] = useState(initialProject.powerW);
  const [splInputMode, setSplInputMode] = useState<SplInputMode>(initialProject.splInputMode);
  const [referenceByTab, setReferenceByTab] = useState<ReferenceByTab>(() => initialProject.referenceByTab);
  const [compareEnabled, setCompareEnabled] = useState(initialProject.compareEnabled);
  const [compareDriverIds, setCompareDriverIds] = useState<string[]>(() => initialProject.compareDriverIds);
  const [mechanicalDerivedField, setMechanicalDerivedField] = useState<MechanicalDerivedField | undefined>(
    () => initialProject.mechanicalDerivedField,
  );
  const [motorDerivedField, setMotorDerivedField] = useState<MotorDerivedField | undefined>(
    () => initialProject.motorDerivedField,
  );
  const [qualityDerivedField, setQualityDerivedField] = useState<QualityDerivedField | undefined>(
    () => initialProject.qualityDerivedField,
  );
  const [lastManualDriverField, setLastManualDriverField] = useState<keyof SpeakerDriver | undefined>();
  const [lastDriverFormulaChangeFields, setLastDriverFormulaChangeFields] = useState<ReadonlyArray<keyof SpeakerDriver>>([]);
  const [measurements, setMeasurements] = useState<MeasurementTrace[]>(() => initialProject.measurements);
  const [sealedZma, setSealedZma] = useState<SealedZmaState>(() => initialProject.sealedZma);
  const [addedMassZma, setAddedMassZma] = useState<AddedMassZmaState>(() => initialProject.addedMassZma);
  const [freeAirZma, setFreeAirZma] = useState<FreeAirZmaState>(() => initialProject.freeAirZma);
  const [acousticOptions, setAcousticOptions] = useState<AcousticOptions>(() => initialProject.acousticOptions);
  const [status, setStatus] = useState(() =>
    initialProjectRef.current?.source === "share"
      ? UI_TEXT[initialProject.language].projectLinkLoaded
      : "",
  );
  const [leftPanelWidth, setLeftPanelWidth] = useState(() =>
    loadPanelWidth(LEFT_PANEL_STORAGE_KEY, LEFT_PANEL_LIMITS),
  );
  const [rightPanelWidth, setRightPanelWidth] = useState(() =>
    loadPanelWidth(RIGHT_PANEL_STORAGE_KEY, RIGHT_PANEL_LIMITS),
  );
  const [sidebarPanelOrder, setSidebarPanelOrder] = useState<SidebarPanelId[]>(() =>
    loadPanelOrder(SIDEBAR_PANEL_ORDER_STORAGE_KEY, DEFAULT_SIDEBAR_PANEL_ORDER),
  );
  const [chartPanelOrder, setChartPanelOrder] = useState<ChartToolPanelId[]>(() =>
    loadPanelOrder(CHART_PANEL_ORDER_STORAGE_KEY, DEFAULT_CHART_PANEL_ORDER),
  );
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const measurementInputRef = useRef<HTMLInputElement>(null);
  const chartSvgRef = useRef<SVGSVGElement>(null);
  const persistedProjectJsonRef = useRef<string | null>(null);
  const simulationWorkerRef = useRef<Worker | null>(null);
  const simulationRequestIdRef = useRef({ analysis: 0, chart: 0 });
  const panelDragRef = useRef<PanelDragState | null>(null);
  const text = UI_TEXT[language];
  const currentProjectFile = useMemo(
    () =>
      createProjectFile({
        acousticOptions,
        activeTab,
        addedMassZma,
        freeAirZma,
        chartFrequencyMinHz,
        chartFrequencyMaxHz,
        chartStepTimeMinMs,
        chartStepTimeMaxMs,
        chartYScales,
        compareDriverIds,
        compareEnabled,
        designs,
        drivers,
        focusedDesignId,
        fixedDriverFields,
        language,
        libraryFilters,
        mechanicalDerivedField,
        motorDerivedField,
        qualityDerivedField,
        measurements,
        optimizerGoal,
        powerW,
        referenceByTab,
        selectedDriverId,
        sealedZma,
        splInputMode,
      }),
    [
      acousticOptions,
      activeTab,
      addedMassZma,
      freeAirZma,
      chartFrequencyMinHz,
      chartFrequencyMaxHz,
      chartStepTimeMinMs,
      chartStepTimeMaxMs,
      chartYScales,
      compareDriverIds,
      compareEnabled,
      designs,
      drivers,
      focusedDesignId,
      fixedDriverFields,
      language,
      libraryFilters,
      mechanicalDerivedField,
      motorDerivedField,
      qualityDerivedField,
      measurements,
      optimizerGoal,
      powerW,
      referenceByTab,
      selectedDriverId,
      sealedZma,
      splInputMode,
    ],
  );

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
    if (initialProjectRef.current?.source === "share") {
      clearProjectShareHash();
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void parseCompressedProjectShareHash(window.location.hash).then((project) => {
      if (cancelled || !project) {
        return;
      }
      applyProject(project);
      setStatus(UI_TEXT[project.language].projectLinkLoaded);
      clearProjectShareHash();
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(DRIVER_STORAGE_KEY, JSON.stringify(drivers));
  }, [drivers]);

  useEffect(() => {
    const projectJson = JSON.stringify(currentProjectFile);
    if (projectJson === persistedProjectJsonRef.current) {
      return;
    }
    localStorage.setItem(PROJECT_STORAGE_KEY, projectJson);
    persistedProjectJsonRef.current = projectJson;
  }, [currentProjectFile]);

  useEffect(() => {
    const handleProjectStorage = (event: StorageEvent) => {
      if (
        event.storageArea !== localStorage ||
        event.key !== PROJECT_STORAGE_KEY ||
        event.newValue === null ||
        event.newValue === persistedProjectJsonRef.current
      ) {
        return;
      }

      const project = parseProjectFile(event.newValue);
      if (!project) {
        return;
      }

      persistedProjectJsonRef.current = event.newValue;
      applyProject(project);
      setStatus(UI_TEXT[project.language].projectSynced);
    };

    window.addEventListener("storage", handleProjectStorage);
    return () => window.removeEventListener("storage", handleProjectStorage);
  }, []);

  useEffect(() => {
    localStorage.setItem(LEFT_PANEL_STORAGE_KEY, String(leftPanelWidth));
  }, [leftPanelWidth]);

  useEffect(() => {
    localStorage.setItem(RIGHT_PANEL_STORAGE_KEY, String(rightPanelWidth));
  }, [rightPanelWidth]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_PANEL_ORDER_STORAGE_KEY, JSON.stringify(sidebarPanelOrder));
  }, [sidebarPanelOrder]);

  useEffect(() => {
    localStorage.setItem(CHART_PANEL_ORDER_STORAGE_KEY, JSON.stringify(chartPanelOrder));
  }, [chartPanelOrder]);

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

  useEffect(() => {
    if (!chartExpanded) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setChartExpanded(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [chartExpanded]);

  const templates = useMemo(() => getDesignTemplates(selectedDriver), [selectedDriver]);
  const driverProfile = useMemo(() => analyzeDriver(selectedDriver), [selectedDriver]);
  const filteredDrivers = useMemo(() => filterDrivers(drivers, libraryFilters), [drivers, libraryFilters]);
  const driverSelectOptions = useMemo(() => {
    return filteredDrivers.some((driver) => driver.id === selectedDriver.id)
      ? filteredDrivers
      : [selectedDriver, ...filteredDrivers];
  }, [filteredDrivers, selectedDriver]);
  const activeDesignCount = designs.filter((design) => design.enabled).length;
  const focusedDesign = useMemo(() => {
    return designs.find((design) => design.id === focusedDesignId) ??
      designs.find((design) => design.enabled) ??
      designs[0];
  }, [designs, focusedDesignId]);
  const liveChartDesigns = useMemo(() => {
    return designs.filter((design) => design.enabled);
  }, [designs]);
  const chartFrequencyDomain = useMemo(
    () => normalizeChartFrequencyDomain(chartFrequencyMinHz, chartFrequencyMaxHz),
    [chartFrequencyMaxHz, chartFrequencyMinHz],
  );
  const chartStepTimeDomain = useMemo(
    () => normalizeChartStepTimeDomain(chartStepTimeMinMs, chartStepTimeMaxMs),
    [chartStepTimeMaxMs, chartStepTimeMinMs],
  );
  const activeChartYScale = chartYScales[activeTab] ?? defaultChartYScale(activeTab);
  const chartYDomain = useMemo(
    () => activeChartYScale.auto ? undefined : normalizeChartYDomain(activeChartYScale.min, activeChartYScale.max),
    [activeChartYScale.auto, activeChartYScale.max, activeChartYScale.min],
  );
  const updateActiveChartYScale = (patch: Partial<ChartYScaleState>) => {
    setChartYScales((current) => {
      const currentScale = current[activeTab] ?? defaultChartYScale(activeTab);
      return {
        ...current,
        [activeTab]: {
          ...currentScale,
          ...patch,
        },
      };
    });
  };
  const updateChartFrequencyDomain = (domain: [number, number]) => {
    const [nextMin, nextMax] = normalizeChartFrequencyDomain(domain[0], domain[1]);
    setChartFrequencyMinHz(roundFrequencyForInput(nextMin));
    setChartFrequencyMaxHz(roundFrequencyForInput(nextMax));
  };
  const updateChartStepTimeDomain = (domain: [number, number]) => {
    const [nextMin, nextMax] = normalizeChartStepTimeDomain(domain[0], domain[1]);
    setChartStepTimeMinMs(roundStepTimeForInput(nextMin));
    setChartStepTimeMaxMs(roundStepTimeForInput(nextMax));
  };
  const updateChartYDomain = (domain: [number, number]) => {
    const [nextMin, nextMax] = normalizeChartYDomain(domain[0], domain[1]);
    updateActiveChartYScale({
      auto: false,
      min: roundChartYForInput(nextMin),
      max: roundChartYForInput(nextMax),
    });
  };
  const analysisStale =
    analysisSnapshot.driver !== selectedDriver ||
    analysisSnapshot.designs !== designs ||
    analysisSnapshot.powerW !== powerW ||
    analysisSnapshot.splInputMode !== splInputMode;
  const allWarnings = analysisResults.flatMap((result) =>
    result.metrics.notes.map((note) =>
      `${displayDesignName(result.design.name, text)}: ${translateNote(note, text)}`,
    ),
  );
  const focusedAnalysisResult =
    analysisResults.find((result) => result.design.id === focusedDesignId) ??
    analysisResults[0];

  useEffect(() => {
    const requestId = simulationRequestIdRef.current.chart + 1;
    const outputs = outputsForChartTab(activeTab);
    simulationRequestIdRef.current.chart = requestId;
    setChartPending(true);

    const worker = simulationWorkerRef.current;
    if (!worker) {
      setChartResults(
        liveChartDesigns.map((design) =>
          simulateDesign(selectedDriver, design, {
            frequencyMaxHz: chartFrequencyDomain[1],
            powerW,
            splInputMode,
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
      driver: selectedDriver,
      designs: liveChartDesigns,
      frequencyMaxHz: chartFrequencyDomain[1],
      powerW,
      splInputMode,
      outputs,
    });
  }, [activeTab, chartFrequencyDomain, powerW, selectedDriver, liveChartDesigns, splInputMode]);

  const adjustedChartResults = useMemo(
    () => applyAcousticOptionsToResults(chartResults, acousticOptions),
    [acousticOptions, chartResults],
  );
  const compareChartResults = useMemo(() => {
    if (!compareEnabled) {
      return [];
    }
    if (!focusedDesign) {
      return [];
    }
    const outputs = outputsForChartTab(activeTab);
    const selectedCompareDrivers = compareDriverIds
      .map((id) => drivers.find((driver) => driver.id === id))
      .filter(Boolean) as SpeakerDriver[];
    const compareDrivers = [
      selectedDriver,
      ...selectedCompareDrivers.filter((driver) => driver.id !== selectedDriver.id),
    ];
    return applyAcousticOptionsToResults(
      compareDrivers.map((driver, index) =>
        simulateDesign(driver, {
          ...focusedDesign,
          id: driver.id,
          name: displayDriverName(driver, text),
          color: DESIGN_COLORS[index % DESIGN_COLORS.length],
          enabled: true,
        }, { frequencyMaxHz: chartFrequencyDomain[1], powerW, splInputMode, outputs }),
      ),
      acousticOptions,
    );
  }, [activeTab, acousticOptions, chartFrequencyDomain, compareDriverIds, compareEnabled, drivers, focusedDesign, powerW, selectedDriver, splInputMode, text]);
  const chartDisplayResults = compareEnabled ? compareChartResults : adjustedChartResults;
  const currentDriverMeasurements = useMemo(
    () => measurements.filter((measurement) => measurement.driverId === selectedDriver.id),
    [measurements, selectedDriver.id],
  );
  const zmaMeasurements = useMemo(
    () => currentDriverMeasurements.filter((measurement) => measurement.kind === "zma"),
    [currentDriverMeasurements],
  );
  const frdMeasurements = useMemo(
    () => currentDriverMeasurements.filter((measurement) => measurement.kind === "frd"),
    [currentDriverMeasurements],
  );
  const selectedFreeAirMeasurement = useMemo(
    () => zmaMeasurements.find((measurement) => measurement.id === freeAirZma.selectedMeasurementId) ?? zmaMeasurements[0],
    [freeAirZma.selectedMeasurementId, zmaMeasurements],
  );
  const freeAirReOhm = freeAirZma.reOhm ??
    (Number.isFinite(selectedDriver.reOhm) && selectedDriver.reOhm > 0 ? selectedDriver.reOhm : undefined);
  const freeAirTsEstimate = useMemo(
    () => selectedFreeAirMeasurement
      ? estimateFreeAirTsFromZma(selectedFreeAirMeasurement.points, freeAirReOhm)
      : null,
    [freeAirReOhm, selectedFreeAirMeasurement],
  );
  const selectedSealedZmaMeasurement = useMemo(
    () => zmaMeasurements.find((measurement) => measurement.id === sealedZma.selectedMeasurementId) ?? zmaMeasurements[0],
    [sealedZma.selectedMeasurementId, zmaMeasurements],
  );
  const sealedReOhm = sealedZma.reOhm ??
    (Number.isFinite(selectedDriver.reOhm) && selectedDriver.reOhm > 0 ? selectedDriver.reOhm : undefined);
  const sealedZmaEstimate = useMemo(
    () => selectedSealedZmaMeasurement ? estimateSealedBoxFromZma(selectedSealedZmaMeasurement.points, sealedReOhm) : null,
    [sealedReOhm, selectedSealedZmaMeasurement],
  );
  const sealedFsFromFreeAir = freeAirTsEstimate !== null &&
    selectedFreeAirMeasurement !== undefined &&
    selectedSealedZmaMeasurement !== undefined &&
    selectedFreeAirMeasurement.id !== selectedSealedZmaMeasurement.id;
  const sealedDerivationDriver = useMemo(
    () => sealedFsFromFreeAir && freeAirTsEstimate
      ? { ...selectedDriver, fsHz: freeAirTsEstimate.fsHz, qes: freeAirTsEstimate.qes }
      : selectedDriver,
    [freeAirTsEstimate, sealedFsFromFreeAir, selectedDriver],
  );
  const sealedBoxTsEstimate = useMemo(
    () => estimateSealedBoxTsFromZma(sealedDerivationDriver, sealedZmaEstimate, sealedZma.boxVolumeLiters),
    [sealedDerivationDriver, sealedZma.boxVolumeLiters, sealedZmaEstimate],
  );
  const selectedAddedMassMeasurement = useMemo(
    () => zmaMeasurements.find((measurement) => measurement.id === addedMassZma.selectedMeasurementId) ?? zmaMeasurements[0],
    [addedMassZma.selectedMeasurementId, zmaMeasurements],
  );
  const addedMassZmaEstimate = useMemo(
    () => selectedAddedMassMeasurement ? estimateSealedBoxFromZma(selectedAddedMassMeasurement.points) : null,
    [selectedAddedMassMeasurement],
  );
  const addedMassFsFromFreeAir = freeAirTsEstimate !== null &&
    selectedFreeAirMeasurement !== undefined &&
    selectedAddedMassMeasurement !== undefined &&
    selectedFreeAirMeasurement.id !== selectedAddedMassMeasurement.id;
  const addedMassDerivationDriver = useMemo(
    () => addedMassFsFromFreeAir && freeAirTsEstimate
      ? { ...selectedDriver, fsHz: freeAirTsEstimate.fsHz }
      : selectedDriver,
    [addedMassFsFromFreeAir, freeAirTsEstimate, selectedDriver],
  );
  const addedMassTsEstimate = useMemo(
    () => estimateAddedMassTsFromZma(addedMassDerivationDriver, addedMassZmaEstimate, addedMassZma.addedMassGrams),
    [addedMassDerivationDriver, addedMassZma.addedMassGrams, addedMassZmaEstimate],
  );
  const measurementSeries = useMemo(
    () => {
      const importedSeries = currentDriverMeasurements
        .filter((measurement) => !measurement.hidden && measurementVisibleOnTab(measurement, activeTab))
        .map((measurement) => ({
          color: measurement.color,
          measurement: true,
          name: measurementSeriesName(measurement, activeTab),
          points: measurementPointsForTab(measurement, activeTab),
        }));
      if (
        activeTab !== "response" ||
        !sealedZmaEstimate?.responseDb.length ||
        !selectedSealedZmaMeasurement ||
        selectedSealedZmaMeasurement.hidden
      ) {
        return importedSeries;
      }
      const series = [
        ...importedSeries,
        {
          color: selectedSealedZmaMeasurement.color,
          measurement: true,
          name: text.measurements.sealedZma.derivedSeries,
          points: sealedZmaEstimate.responseDb,
        },
      ];
      const { fsHz, qts } = sealedDerivationDriver;
      if (
        Number.isFinite(sealedZma.targetQtc) &&
        Number.isFinite(qts) &&
        qts > 0 &&
        fsHz > 0 &&
        sealedZma.targetQtc > qts
      ) {
        series.push({
          color: SEALED_TARGET_COLOR,
          measurement: true,
          name: text.measurements.sealedZma.targetSeries,
          points: sealedResponseFromFcQtc(
            fsHz * (sealedZma.targetQtc / qts),
            sealedZma.targetQtc,
            selectedSealedZmaMeasurement.points,
          ),
        });
      }
      return series;
    },
    [activeTab, currentDriverMeasurements, sealedDerivationDriver, sealedZma.targetQtc, sealedZmaEstimate, selectedSealedZmaMeasurement, text],
  );

  useEffect(() => {
    const requestId = simulationRequestIdRef.current.analysis + 1;
    simulationRequestIdRef.current.analysis = requestId;
    setAnalysisPending(true);

    const worker = simulationWorkerRef.current;
    if (!worker) {
      setAnalysisResults(
        analysisSnapshot.designs
          .filter((design) => design.enabled)
          .map((design) => simulateDesign(analysisSnapshot.driver, design, {
            powerW: analysisSnapshot.powerW,
            splInputMode: analysisSnapshot.splInputMode,
          })),
      );
      setOptimizerCandidates(optimizeDesigns(
        analysisSnapshot.driver,
        analysisSnapshot.powerW,
        optimizerGoal,
        analysisSnapshot.splInputMode,
      ));
      setAnalysisPending(false);
      return;
    }

    worker.postMessage({
      id: requestId,
      type: "analysis",
      driver: analysisSnapshot.driver,
      designs: analysisSnapshot.designs,
      powerW: analysisSnapshot.powerW,
      splInputMode: analysisSnapshot.splInputMode,
      goal: optimizerGoal,
    });
  }, [analysisSnapshot, optimizerGoal]);

  function commitSelectedDriver(editedDriver: SpeakerDriver, changedKey?: keyof SpeakerDriver) {
    const shouldForkPreset = isProtectedPresetDriver(selectedDriver);
    const nextDriver: SpeakerDriver = {
      ...editedDriver,
      id: shouldForkPreset ? newId("driver") : editedDriver.id,
      name: shouldForkPreset && changedKey !== "name"
        ? `${displayDriverName(selectedDriver, text)} ${text.copySuffix}`
        : editedDriver.name,
      source: selectedDriver.source?.verified ? markSourceModified(selectedDriver.source) : selectedDriver.source,
    };

    setDrivers((current) => {
      if (shouldForkPreset) {
        return [...current, nextDriver];
      }
      return current.map((driver) => (driver.id === selectedDriver.id ? nextDriver : driver));
    });

    if (shouldForkPreset) {
      setFixedDriverFields((current) => ({
        ...current,
        [nextDriver.id]: current[selectedDriver.id] ?? [],
      }));
      setSelectedDriverId(nextDriver.id);
      setCompareDriverIds((current) =>
        current.map((id) => (id === selectedDriver.id ? nextDriver.id : id)),
      );
    }
  }

  function clearDerivedFormulaField(key: keyof SpeakerDriver) {
    if (key === mechanicalDerivedField) {
      setMechanicalDerivedField(undefined);
    }
    if (key === motorDerivedField) {
      setMotorDerivedField(undefined);
    }
    if (key === qualityDerivedField) {
      setQualityDerivedField(undefined);
    }
  }

  function setDriverFormulaFieldFixed(key: keyof SpeakerDriver, fixed: boolean) {
    if (!isDriverFormulaField(key)) {
      return;
    }
    if (fixed || driverActiveFormulaForField(key, {
      mechanical: mechanicalDerivedField,
      motor: motorDerivedField,
      quality: qualityDerivedField,
    }) !== undefined) {
      clearDerivedFormulaField(key);
    }
    setLastManualDriverField(undefined);
    setLastDriverFormulaChangeFields([]);
    setFixedDriverFields((current) => {
      const currentFields = current[selectedDriver.id] ?? [];
      const nextFields = fixed
        ? Array.from(new Set([...currentFields, key]))
        : currentFields.filter((field) => field !== key);
      const { [selectedDriver.id]: _removed, ...rest } = current;
      return nextFields.length > 0 ? { ...rest, [selectedDriver.id]: nextFields } : rest;
    });
  }

  function updateDriverField(key: keyof SpeakerDriver, value: string) {
    const nextMechanicalDerivedField = key === mechanicalDerivedField ? undefined : mechanicalDerivedField;
    const nextMotorDerivedField = key === motorDerivedField ? undefined : motorDerivedField;
    const nextQualityDerivedField = key === qualityDerivedField ? undefined : qualityDerivedField;
    const editedDriver = applyDriverFieldValue(
      selectedDriver,
      key,
      value,
      nextMechanicalDerivedField,
      nextMotorDerivedField,
      nextQualityDerivedField,
    );

    clearDerivedFormulaField(key);
    if (key !== "name" && key !== "id" && key !== "source") {
      const changedFields = changedDriverFormulaFields(selectedDriver, editedDriver, key);
      setLastManualDriverField(changedFields.length > 0 ? key : undefined);
      setLastDriverFormulaChangeFields(changedFields);
    } else {
      setLastManualDriverField(undefined);
      setLastDriverFormulaChangeFields([]);
    }

    commitSelectedDriver(editedDriver, key);
  }

  function deriveDriverFormulaField(
    field: MechanicalDerivedField | MotorDerivedField | QualityDerivedField,
    formula: DriverFormulaKind,
    sourceChangedKey?: keyof SpeakerDriver,
  ) {
    const primaryDerivedDriver = formula === "mechanical" && isMechanicalDerivedField(field)
      ? reconcileMechanicalDerivedField(selectedDriver, field, sourceChangedKey)
      : formula === "motor" && isMotorDerivedField(field)
        ? reconcileMotorDerivedField(selectedDriver, field)
        : formula === "quality" && isQualityDerivedField(field)
          ? reconcileQualityDerivedField(selectedDriver, field)
          : selectedDriver;
    if (primaryDerivedDriver === selectedDriver) {
      setStatus(text.driverDerivation.unavailable(driverFieldByKey.get(field)?.label ?? field));
      return;
    }

    let nextMechanicalDerivedField = mechanicalDerivedField;
    let nextMotorDerivedField = motorDerivedField;
    let nextQualityDerivedField = qualityDerivedField;

    if (formula === "mechanical" && isMechanicalDerivedField(field)) {
      nextMechanicalDerivedField = field;
      nextMotorDerivedField = motorDerivedField === field ? undefined : motorDerivedField;
    } else if (formula === "motor" && isMotorDerivedField(field)) {
      nextMotorDerivedField = field;
      nextMechanicalDerivedField = mechanicalDerivedField === field ? undefined : mechanicalDerivedField;
      nextQualityDerivedField = qualityDerivedField === field ? undefined : qualityDerivedField;
    } else if (formula === "quality" && isQualityDerivedField(field)) {
      nextQualityDerivedField = field;
      nextMotorDerivedField = motorDerivedField === field ? undefined : motorDerivedField;
    } else {
      return;
    }
    const derivedDriver = reconcileDriverDerivedFields(
      primaryDerivedDriver,
      field,
      nextMechanicalDerivedField,
      nextMotorDerivedField,
      nextQualityDerivedField,
    );
    setMechanicalDerivedField(nextMechanicalDerivedField);
    setMotorDerivedField(nextMotorDerivedField);
    setQualityDerivedField(nextQualityDerivedField);
    if (isDriverFormulaField(field)) {
      setFixedDriverFields((current) => {
        const currentFields = current[selectedDriver.id] ?? [];
        const nextFields = currentFields.filter((item) => item !== field);
        const { [selectedDriver.id]: _removed, ...rest } = current;
        return nextFields.length > 0 ? { ...rest, [selectedDriver.id]: nextFields } : rest;
      });
    }
    setLastManualDriverField(undefined);
    setLastDriverFormulaChangeFields([]);
    commitSelectedDriver(derivedDriver, field);
  }

  function resetDriverToDatasheet() {
    const preset = findPresetForDriver(selectedDriver);
    if (!preset?.source) {
      return;
    }
    const nextDriver: SpeakerDriver = {
      ...preset,
      id: selectedDriver.id,
      name: selectedDriver.name,
    };
    setMechanicalDerivedField(undefined);
    setMotorDerivedField(undefined);
    setQualityDerivedField(undefined);
    setLastManualDriverField(undefined);
    setLastDriverFormulaChangeFields([]);
    setFixedDriverFields((current) => {
      const { [selectedDriver.id]: _removed, ...rest } = current;
      return rest;
    });
    setDrivers((current) => current.map((driver) => (driver.id === selectedDriver.id ? nextDriver : driver)));
  }

  function selectDriverWithDefaults(driver: SpeakerDriver) {
    const nextDesigns = createDefaultDesigns(driver);
    setLastManualDriverField(undefined);
    setLastDriverFormulaChangeFields([]);
    setSelectedDriverId(driver.id);
    setDesigns(nextDesigns);
    setFocusedDesignId(nextDesigns.find((design) => design.enabled)?.id ?? nextDesigns[0]?.id ?? "");
    setAnalysisSnapshot(createAnalysisSnapshot(driver, nextDesigns, powerW, splInputMode));
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
    setFixedDriverFields((current) => ({
      ...current,
      [next.id]: current[selectedDriver.id] ?? [],
    }));
    selectDriverWithDefaults(next);
  }

  function deleteDriver() {
    if (drivers.length <= 1) {
      return;
    }
    const nextDrivers = drivers.filter((driver) => driver.id !== selectedDriver.id);
    setDrivers(nextDrivers);
    setFixedDriverFields((current) => {
      const { [selectedDriver.id]: _removed, ...rest } = current;
      return rest;
    });
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

  async function importMeasurementFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      const parsedTrace = parseMeasurementTraceFile(file.name, await file.text());
      if (!parsedTrace) {
        setStatus(text.requiredFieldsMissing);
        return;
      }
      const driverMeasurements = measurements.filter((measurement) => measurement.driverId === selectedDriver.id);
      const trace: MeasurementTrace = {
        ...parsedTrace,
        color: DESIGN_COLORS[(driverMeasurements.length + 6) % DESIGN_COLORS.length],
        driverId: selectedDriver.id,
        hidden: false,
        id: newId("measurement"),
        offsetDb: 0,
        tab: measurementKindToDefaultTab(parsedTrace.kind),
      };
      setMeasurements((current) => [...current, trace]);
      if (trace.kind === "zma") {
        setSealedZma((current) => ({ ...current, selectedMeasurementId: trace.id }));
      }
      setActiveTab(trace.kind === "zma" ? "impedance" : activeTab === "spl" ? "spl" : "response");
      setStatus(text.measurements.imported(driverMeasurements.length + 1, measurements.length + 1));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : text.importError);
    }
  }

  function removeMeasurement(id: string) {
    setMeasurements((current) => current.filter((measurement) => measurement.id !== id));
  }

  function renameMeasurement(id: string, name: string) {
    if (!name) {
      return;
    }
    setMeasurements((current) => current.map((measurement) =>
      measurement.id === id ? { ...measurement, name } : measurement,
    ));
  }

  function toggleMeasurementVisibility(id: string) {
    setMeasurements((current) => current.map((measurement) =>
      measurement.id === id ? { ...measurement, hidden: !measurement.hidden } : measurement,
    ));
  }

  function applyMeasuredDriverValues(values: Partial<Record<DriverFormulaField, number | undefined>>) {
    const entries = (Object.entries(values) as Array<[DriverFormulaField, number | undefined]>)
      .filter((entry): entry is [DriverFormulaField, number] => Number.isFinite(entry[1]));
    if (entries.length === 0) {
      return;
    }

    const appliedKeys = new Set<keyof SpeakerDriver>(entries.map(([key]) => key));
    const nextMechanicalDerivedField = mechanicalDerivedField !== undefined && appliedKeys.has(mechanicalDerivedField)
      ? undefined
      : mechanicalDerivedField;
    const nextMotorDerivedField = motorDerivedField !== undefined && appliedKeys.has(motorDerivedField)
      ? undefined
      : motorDerivedField;
    const nextQualityDerivedField = qualityDerivedField !== undefined && appliedKeys.has(qualityDerivedField)
      ? undefined
      : qualityDerivedField;

    let editedDriver: SpeakerDriver = { ...selectedDriver };
    for (const [key, value] of entries) {
      const limits = driverFieldLimits.get(key);
      const rounded = Math.round(value * 10000) / 10000;
      editedDriver = {
        ...editedDriver,
        [key]: limits ? clampNumber(rounded, limits.min, limits.max ?? Number.POSITIVE_INFINITY) : rounded,
      };
    }
    for (const [key] of entries) {
      editedDriver = reconcileDriverDerivedFields(
        editedDriver,
        key,
        nextMechanicalDerivedField,
        nextMotorDerivedField,
        nextQualityDerivedField,
      );
    }

    setMechanicalDerivedField(nextMechanicalDerivedField);
    setMotorDerivedField(nextMotorDerivedField);
    setQualityDerivedField(nextQualityDerivedField);
    setLastManualDriverField(undefined);
    setLastDriverFormulaChangeFields([]);

    commitSelectedDriver(editedDriver);
    setStatus(text.measurements.applied);
  }

  function updateMeasurementOffset(id: string, offsetDb: number) {
    setMeasurements((current) => current.map((measurement) =>
      measurement.id === id
        ? { ...measurement, offsetDb: clampNumber(offsetDb, -60, 60) }
        : measurement,
    ));
  }

  function autoAlignMeasurementSpl(id: string) {
    const measurement = measurements.find((item) => item.id === id);
    if (!measurement || !focusedDesign) {
      return;
    }
    const [modelResult] = applyAcousticOptionsToResults(
      [simulateDesign(selectedDriver, focusedDesign, { powerW, splInputMode, outputs: ["spl"] })],
      acousticOptions,
    );
    const offsetDb = alignSplOffsetDb(measurement.points, modelResult?.splDb ?? []);
    if (offsetDb === null) {
      setStatus(text.measurements.splAlign.failed);
      return;
    }
    updateMeasurementOffset(id, Math.round(offsetDb * 10) / 10);
    setStatus(text.measurements.splAlign.aligned);
  }

  function toggleCompareDriver(id: string) {
    setCompareDriverIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function applyProject(project: ProjectState) {
    setAcousticOptions(project.acousticOptions);
    setLanguage(project.language);
    setDrivers(project.drivers);
    setLibraryFilters(project.libraryFilters);
    setFixedDriverFields(project.fixedDriverFields);
    setMechanicalDerivedField(project.mechanicalDerivedField);
    setMotorDerivedField(project.motorDerivedField);
    setQualityDerivedField(project.qualityDerivedField);
    setLastManualDriverField(undefined);
    setLastDriverFormulaChangeFields([]);
    setSelectedDriverId(project.selectedDriverId);
    setDesigns(project.designs);
    setFocusedDesignId(project.focusedDesignId);
    setActiveTab(project.activeTab);
    setChartFrequencyMinHz(project.chartFrequencyMinHz);
    setChartFrequencyMaxHz(project.chartFrequencyMaxHz);
    setChartStepTimeMinMs(project.chartStepTimeMinMs);
    setChartStepTimeMaxMs(project.chartStepTimeMaxMs);
    setChartYScales(project.chartYScales);
    setCompareEnabled(project.compareEnabled);
    setCompareDriverIds(project.compareDriverIds);
    setMeasurements(project.measurements);
    setOptimizerGoal(project.optimizerGoal);
    setPowerW(project.powerW);
    setSealedZma(project.sealedZma);
    setAddedMassZma(project.addedMassZma);
    setFreeAirZma(project.freeAirZma);
    setSplInputMode(project.splInputMode);
    setReferenceByTab(project.referenceByTab);
    setAnalysisSnapshot(createAnalysisSnapshot(
      project.drivers.find((driver) => driver.id === project.selectedDriverId) ?? project.drivers[0],
      project.designs,
      project.powerW,
      project.splInputMode,
    ));
  }

  function exportProject() {
    const blob = new Blob([
      JSON.stringify(currentProjectFile, null, 2),
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

  async function copyProjectLink() {
    const shareUrl = await createProjectShareUrl(currentProjectFile);
    if (shareUrl.length > PROJECT_SHARE_URL_MAX_LENGTH) {
      setStatus(text.projectLinkTooLarge);
      return;
    }

    try {
      await copyTextToClipboard(shareUrl);
      setStatus(text.projectLinkCopied);
    } catch {
      setStatus(text.projectLinkCopyFailed);
    }
  }

  function exportReportHtml() {
    const svg = chartSvgRef.current;
    const report = createReportHtml({
      acousticOptions,
      chartSvg: svg ? serializeSvg(svg) : "",
      driver: selectedDriver,
      language,
      measurements,
      powerW,
      splInputMode,
      results: analysisResults,
      text,
      title: chartProps.title,
      warnings: allWarnings,
    });
    downloadBlob(new Blob([report], { type: "text/html;charset=utf-8" }), "speaker-builder-report.html");
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
    setAnalysisSnapshot(createAnalysisSnapshot(selectedDriver, designs, powerW, splInputMode));
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

  function moveSidebarPanel(id: SidebarPanelId, direction: -1 | 1) {
    setSidebarPanelOrder((current) => movePanelInOrder(current, id, direction));
  }

  function moveChartPanel(id: ChartToolPanelId, direction: -1 | 1) {
    setChartPanelOrder((current) => movePanelInOrder(current, id, direction));
  }

  function startPanelDrag(area: PanelArea, id: string, event: ReactDragEvent<HTMLElement>) {
    panelDragRef.current = { area, id };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `${area}:${id}`);
  }

  function dragPanelOver(area: PanelArea, event: ReactDragEvent<HTMLElement>) {
    if (panelDragRef.current?.area !== area) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function dropSidebarPanel(targetId: SidebarPanelId, event: ReactDragEvent<HTMLElement>) {
    event.preventDefault();
    const dragged = panelDragRef.current;
    panelDragRef.current = null;
    if (dragged?.area !== "sidebar") {
      return;
    }
    setSidebarPanelOrder((current) => reorderPanelBefore(current, dragged.id as SidebarPanelId, targetId));
  }

  function dropChartPanel(targetId: ChartToolPanelId, event: ReactDragEvent<HTMLElement>) {
    event.preventDefault();
    const dragged = panelDragRef.current;
    panelDragRef.current = null;
    if (dragged?.area !== "chartTools") {
      return;
    }
    setChartPanelOrder((current) => reorderPanelBefore(current, dragged.id as ChartToolPanelId, targetId));
  }

  const chartFocusedSeriesId = compareEnabled ? selectedDriver.id : focusedDesignId;
  const chartProps = getChartProps(activeTab, chartDisplayResults, selectedDriver, chartFocusedSeriesId, text, powerW, splInputMode, chartFrequencyDomain, chartStepTimeDomain, chartYDomain, measurementSeries);
  const isTimeDomainChart = activeTab === "impulse" || activeTab === "step";
  const chartXRangeControls = isTimeDomainChart
    ? {
        max: chartStepTimeMaxMs,
        maxFloor: 1,
        maxLimit: CHART_STEP_TIME_MAX_LIMIT_MS,
        maxStep: "10",
        min: chartStepTimeMinMs,
        minFloor: CHART_STEP_TIME_MIN_LIMIT_MS,
        minLimit: CHART_STEP_TIME_MIN_MAX_MS,
        minStep: "1",
        presets: CHART_STEP_TIME_PRESETS,
        unit: text.axisLabels.time.includes("мс") ? "мс" : "ms",
        onMaxChange: (value: string) => {
          const nextMax = parseBoundedNumber(value, chartStepTimeMaxMs, 1, CHART_STEP_TIME_MAX_LIMIT_MS);
          setChartStepTimeMaxMs(nextMax);
          setChartStepTimeMinMs((currentMin) => currentMin < nextMax
            ? currentMin
            : clampNumber(nextMax - 50, CHART_STEP_TIME_MIN_LIMIT_MS, CHART_STEP_TIME_MIN_MAX_MS));
        },
        onMinChange: (value: string) => {
          const nextMin = parseBoundedNumber(value, chartStepTimeMinMs, CHART_STEP_TIME_MIN_LIMIT_MS, CHART_STEP_TIME_MIN_MAX_MS);
          setChartStepTimeMinMs(nextMin);
          setChartStepTimeMaxMs((currentMax) => currentMax > nextMin
            ? currentMax
            : clampNumber(nextMin + 50, 1, CHART_STEP_TIME_MAX_LIMIT_MS));
        },
        onPreset: (preset: ChartRangePreset) => {
          setChartStepTimeMinMs(preset.min);
          setChartStepTimeMaxMs(preset.max);
        },
      }
    : {
        max: chartFrequencyMaxHz,
        maxFloor: MIN_FREQUENCY_MAX_HZ,
        maxLimit: MAX_FREQUENCY_MAX_HZ,
        maxStep: "100",
        min: chartFrequencyMinHz,
        minFloor: CHART_FREQUENCY_MIN_LIMIT_HZ,
        minLimit: CHART_FREQUENCY_MIN_MAX_HZ,
        minStep: "10",
        presets: CHART_RANGE_PRESETS.map((preset) => ({ label: preset.label, min: preset.minHz, max: preset.maxHz })),
        unit: text.axisLabels.frequency.includes("Гц") ? "Гц" : "Hz",
        onMaxChange: (value: string) => {
          const nextMax = parseBoundedNumber(value, chartFrequencyMaxHz, MIN_FREQUENCY_MAX_HZ, MAX_FREQUENCY_MAX_HZ);
          setChartFrequencyMaxHz(nextMax);
          setChartFrequencyMinHz((currentMin) => currentMin < nextMax
            ? currentMin
            : clampNumber(nextMax / 2, CHART_FREQUENCY_MIN_LIMIT_HZ, CHART_FREQUENCY_MIN_MAX_HZ));
        },
        onMinChange: (value: string) => {
          const nextMin = parseBoundedNumber(value, chartFrequencyMinHz, CHART_FREQUENCY_MIN_LIMIT_HZ, CHART_FREQUENCY_MIN_MAX_HZ);
          setChartFrequencyMinHz(nextMin);
          setChartFrequencyMaxHz((currentMax) => currentMax > nextMin
            ? currentMax
            : clampNumber(nextMin * 2, MIN_FREQUENCY_MAX_HZ, MAX_FREQUENCY_MAX_HZ));
        },
        onPreset: (preset: ChartRangePreset) => {
          setChartFrequencyMinHz(preset.min);
          setChartFrequencyMaxHz(preset.max);
        },
      };
  const focusedDesignName = focusedDesign ? displayDesignName(focusedDesign.name, text) : "";
  const chartSubtitle = compareEnabled && focusedDesign
    ? `${text.compare.mode} · ${focusedDesignName}`
    : displayDriverName(selectedDriver, text);
  const configStatusText = compareEnabled && focusedDesign
    ? text.compare.focusedConfig(focusedDesignName)
    : text.activeCount(activeDesignCount, designs.length);
  const sidebarPanelLabels: Record<SidebarPanelId, string> = {
    drivers: text.drivers,
    model: text.model,
  };
  const chartPanelLabels: Record<ChartToolPanelId, string> = {
    compare: text.compare.title,
    corrections: text.corrections.title,
    inputs: text.chartInputs.title,
    measurements: text.measurements.title,
  };

  function renderSidebarPanel(panelId: SidebarPanelId) {
    if (panelId === "drivers") {
      return (
        <>
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
          <DriverLibraryFilters
            filters={libraryFilters}
            text={text}
            total={drivers.length}
            visible={filteredDrivers.length}
            onChange={setLibraryFilters}
          />
          <select
            className="driver-select"
            data-testid="driver-select"
            value={selectedDriver.id}
            onChange={(event) => changeSelectedDriver(event.target.value)}
          >
            {driverSelectOptions.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {displayDriverName(driver, text)}
              </option>
            ))}
          </select>
          {status ? <div className="status-line">{status}</div> : null}
          <DriverSourcePanel
            canReset={Boolean(findPresetForDriver(selectedDriver)?.source)}
            driver={selectedDriver}
            text={text}
            onReset={resetDriverToDatasheet}
          />
        </>
      );
    }

    return (
      <>
        <label className="field span-2">
          <span>{text.model}</span>
          <input
            type="text"
            value={displayDriverName(selectedDriver, text)}
            onChange={(event) => updateDriverField("name", event.target.value)}
          />
        </label>
        <div className="driver-grid">
          {driverFields.map((field) => {
            const issues = driverProfile.fieldIssues[field.key] ?? [];
            const mechanicalField = isMechanicalDerivedField(field.key) ? field.key : undefined;
            const motorField = isMotorDerivedField(field.key) ? field.key : undefined;
            const qualityField = isQualityDerivedField(field.key) ? field.key : undefined;
            const derivableField = mechanicalField ?? motorField ?? qualityField;
            const canChooseFieldMode = isDriverFormulaField(field.key);
            const activeFormula = driverActiveFormulaForField(field.key, {
              mechanical: mechanicalDerivedField,
              motor: motorDerivedField,
              quality: qualityDerivedField,
            });
            const promptSource = driverFormulaPromptSourceForChangedFields(lastDriverFormulaChangeFields, field.key, {
              mechanical: mechanicalDerivedField,
              motor: motorDerivedField,
            });
            const promptFormula = promptSource?.formula;
            const isDerivedField = activeFormula !== undefined;
            const isFixedField = canChooseFieldMode &&
              !isDerivedField &&
              selectedFixedDriverFields.includes(field.key as DriverFormulaField);
            const promptedDerivedFieldValue = promptFormula !== undefined
              ? deriveDriverFormulaValue(selectedDriver, field.key, promptFormula)
              : undefined;
            const fieldValue = selectedDriver[field.key];
            const shouldPromptDerive = derivableField !== undefined &&
              !isDerivedField &&
              !isFixedField &&
              promptFormula !== undefined &&
              activeFormula !== promptFormula &&
              promptedDerivedFieldValue !== undefined &&
              driverFormulaValueDiffers(fieldValue, promptedDerivedFieldValue);
            const promptChainText = shouldPromptDerive && promptSource !== undefined
              ? driverFormulaPromptChain(lastDriverFormulaChangeFields, promptSource.changedKey, field.key)
              : undefined;
            let derivedFieldValue: number | undefined;
            if (activeFormula !== undefined && typeof fieldValue === "number") {
              derivedFieldValue = fieldValue;
            } else if (activeFormula !== undefined) {
              derivedFieldValue = deriveDriverFormulaValue(selectedDriver, field.key, activeFormula);
            } else {
              derivedFieldValue = promptedDerivedFieldValue ?? defaultDerivedFieldValue(selectedDriver, field.key);
            }
            const shownDerivedValue = derivedFieldValue ?? (
              typeof fieldValue === "number" ? fieldValue : undefined
            );
            const derivedFieldText = shownDerivedValue !== undefined
              ? formatCompactNumber(shownDerivedValue)
              : undefined;
            const titleItems = [
              ...issues.map((issue) => text.driverAnalysis.issues[issue]),
              isDerivedField ? text.driverDerivation.title(field.label) : "",
              isFixedField ? text.driverDerivation.fixedTitle(field.label) : "",
              promptChainText !== undefined ? text.driverDerivation.promptChain(promptChainText) : "",
            ].filter(Boolean);
            return (
              <label
                className={`field ${issues.length > 0 ? "invalid" : ""} ${isDerivedField ? "derived" : ""}`}
                data-testid={`driver-field-${field.key}`}
                key={field.key}
                title={titleItems.join("\n")}
              >
                <span>
                  {field.label}
                  {field.unit ? <em>{field.unit}</em> : null}
                  {issues.length > 0 ? <strong>!</strong> : null}
                </span>
                <input
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  data-testid={`driver-input-${field.key}`}
                  value={String(selectedDriver[field.key] ?? "")}
                  onChange={(event) => updateDriverField(field.key, event.target.value)}
                />
                {canChooseFieldMode ? (
                  <>
                    <div className={`field-mode-row ${shouldPromptDerive ? "attention" : ""}`}>
                      <button
                        className={!isDerivedField && !isFixedField ? "active" : ""}
                        data-testid={`driver-mode-${field.key}-measured`}
                        title={text.driverDerivation.measuredTitle(field.label)}
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          setDriverFormulaFieldFixed(field.key, false);
                        }}
                      >
                        {text.driverDerivation.measured}
                      </button>
                      <button
                        className={!isDerivedField && isFixedField ? "active fixed" : ""}
                        data-testid={`driver-mode-${field.key}-fixed`}
                        title={text.driverDerivation.fixedTitle(field.label)}
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          setDriverFormulaFieldFixed(field.key, true);
                        }}
                      >
                        {text.driverDerivation.fixed}
                      </button>
                      {derivableField !== undefined ? (
                        <button
                          className={`${isDerivedField ? "active derived" : ""} ${shouldPromptDerive ? "attention" : ""}`}
                          data-testid={`driver-mode-${field.key}-derive`}
                          title={isDerivedField
                            ? text.driverDerivation.title(field.label)
                            : promptChainText !== undefined
                              ? text.driverDerivation.promptChain(promptChainText)
                              : undefined}
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            deriveDriverFormulaField(
                              derivableField,
                              promptFormula ?? defaultFormulaForField(derivableField),
                              promptSource?.changedKey,
                            );
                          }}
                        >
                          {isDerivedField && derivedFieldText
                            ? text.driverDerivation.derived(derivedFieldText, field.unit)
                            : text.driverDerivation.derive}
                        </button>
                      ) : null}
                    </div>
                    {promptChainText !== undefined ? (
                      <span className="field-derive-chain" data-testid={`driver-chain-${field.key}`}>
                        {text.driverDerivation.promptChain(promptChainText)}
                      </span>
                    ) : null}
                  </>
                ) : null}
              </label>
            );
          })}
        </div>
        <DriverImpactPanel activeTab={activeTab} text={text} />
        <DriverRelationsPanel
          driver={selectedDriver}
          lastManualField={lastManualDriverField}
          mechanicalDerivedField={mechanicalDerivedField}
          motorDerivedField={motorDerivedField}
          qualityDerivedField={qualityDerivedField}
          text={text}
        />
        <DriverAnalysisPanel profile={driverProfile} text={text} />
      </>
    );
  }

  function renderChartToolPanel(panelId: ChartToolPanelId) {
    const index = chartPanelOrder.indexOf(panelId);
    const dragHandle = (
      <PanelDragBar
        canMoveDown={index < chartPanelOrder.length - 1}
        canMoveUp={index > 0}
        label={chartPanelLabels[panelId]}
        text={text}
        onDragStart={(event) => startPanelDrag("chartTools", panelId, event)}
        onMoveDown={() => moveChartPanel(panelId, 1)}
        onMoveUp={() => moveChartPanel(panelId, -1)}
      />
    );

    if (panelId === "inputs") {
      return (
        <ChartInputsPanel
          key={panelId}
          activeTab={activeTab}
          acousticOptions={acousticOptions}
          design={focusedDesign}
          dragHandle={dragHandle}
          driver={selectedDriver}
          powerW={powerW}
          splInputMode={splInputMode}
          profile={driverProfile}
          text={text}
          onDragOver={(event) => dragPanelOver("chartTools", event)}
          onDrop={(event) => dropChartPanel(panelId, event)}
        />
      );
    }

    if (panelId === "corrections") {
      return (
        <AcousticCorrectionsPanel
          key={panelId}
          dragHandle={dragHandle}
          options={acousticOptions}
          text={text}
          onChange={setAcousticOptions}
          onDragOver={(event) => dragPanelOver("chartTools", event)}
          onDrop={(event) => dropChartPanel(panelId, event)}
        />
      );
    }

    if (panelId === "measurements") {
      return (
        <MeasurementPanel
          key={panelId}
          addedMassFsFromFreeAir={addedMassFsFromFreeAir}
          addedMassFsHz={addedMassDerivationDriver.fsHz}
          addedMassTsEstimate={addedMassTsEstimate}
          addedMassZma={addedMassZma}
          count={currentDriverMeasurements.length}
          dragHandle={dragHandle}
          driver={selectedDriver}
          driverMeasurements={currentDriverMeasurements}
          frdMeasurements={frdMeasurements}
          freeAirTsEstimate={freeAirTsEstimate}
          freeAirZma={freeAirZma}
          sealedBoxTsEstimate={sealedBoxTsEstimate}
          sealedFsFromFreeAir={sealedFsFromFreeAir}
          sealedFsHz={sealedDerivationDriver.fsHz}
          estimate={sealedZmaEstimate}
          sealedZma={sealedZma}
          text={text}
          totalCount={measurements.length}
          zmaMeasurements={zmaMeasurements}
          onAddedMassZmaChange={(patch) => setAddedMassZma((current) => normalizeAddedMassZmaState({ ...current, ...patch }))}
          onApplyDriverValues={applyMeasuredDriverValues}
          onFreeAirZmaChange={(patch) => setFreeAirZma((current) => normalizeFreeAirZmaState({ ...current, ...patch }))}
          onAutoAlignSpl={autoAlignMeasurementSpl}
          onClear={() => setMeasurements([])}
          onImport={() => measurementInputRef.current?.click()}
          onClearCurrent={() => {
            setMeasurements((current) => current.filter((measurement) => measurement.driverId !== selectedDriver.id));
          }}
          onMeasurementOffsetChange={updateMeasurementOffset}
          onRemoveMeasurement={removeMeasurement}
          onRenameMeasurement={renameMeasurement}
          onSealedZmaChange={(patch) => setSealedZma((current) => normalizeSealedZmaState({ ...current, ...patch }))}
          onToggleMeasurementVisibility={toggleMeasurementVisibility}
          onDragOver={(event) => dragPanelOver("chartTools", event)}
          onDrop={(event) => dropChartPanel(panelId, event)}
        />
      );
    }

    return (
      <DriverComparePanel
        key={panelId}
        dragHandle={dragHandle}
        drivers={drivers}
        enabled={compareEnabled}
        activeDriverId={selectedDriver.id}
        selectedIds={compareDriverIds}
        text={text}
        onEnabledChange={setCompareEnabled}
        onToggleDriver={toggleCompareDriver}
        onDragOver={(event) => dragPanelOver("chartTools", event)}
        onDrop={(event) => dropChartPanel(panelId, event)}
      />
    );
  }

  const currentReference = referenceByTab[activeTab];
  const layoutStyle = {
    "--left-panel-width": `${leftPanelWidth}px`,
    "--right-panel-width": `${rightPanelWidth}px`,
  } as CSSProperties;
  const inputDrive = resolveDriveInput(selectedDriver, { powerW, splInputMode });
  const fixedInputMode = splInputMode === "oneWatt" || splInputMode === "twoPointEightThreeVolt";
  const inputControlValue = splInputMode === "oneWatt"
    ? 1
    : splInputMode === "twoPointEightThreeVolt"
      ? 2.83
      : powerW;
  const inputControlUnit = splInputMode === "twoPointEightThreeVolt" ? "V" : "W";

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
          <label className="power-control" title={`${fmt(inputDrive.voltageRms, 2)} Vrms / ${fmt(inputDrive.electricalPowerW, 2)} W @ Re`}>
            <Gauge size={18} />
            <span>{text.splInputMode}</span>
            <select
              aria-label={text.splInputMode}
              value={splInputMode}
              onChange={(event) => setSplInputMode(event.target.value as SplInputMode)}
            >
              {SPL_INPUT_MODES.map((mode) => (
                <option key={mode} value={mode}>{text.splInputModes[mode]}</option>
              ))}
            </select>
            <input
              type="number"
              min="0.1"
              max="100000"
              step={splInputMode === "twoPointEightThreeVolt" ? "0.01" : "1"}
              disabled={fixedInputMode}
              value={inputControlValue}
              onChange={(event) => {
                if (!fixedInputMode) {
                  setPowerW(parseBoundedNumber(event.target.value, powerW, 0.1, 100000));
                }
              }}
            />
            <span>{inputControlUnit}</span>
          </label>
          <button type="button" className="icon-button" onClick={exportProject} title={text.exportJson}>
            <Download size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            data-testid="share-project-link"
            onClick={copyProjectLink}
            title={text.shareProjectLink}
            aria-label={text.shareProjectLink}
          >
            <Share2 size={18} />
          </button>
          <button type="button" className="icon-button" onClick={exportReportHtml} title={text.exportReport}>
            <FileText size={18} />
          </button>
          <a className="text-button" href={`${import.meta.env.BASE_URL}egui/`} title={text.eguiPrototype}>
            <ExternalLink size={18} />
            <span>{text.eguiPrototype}</span>
          </a>
        </div>
      </header>

      <main className="workspace" style={layoutStyle}>
        <aside className="sidebar panel">
          {sidebarPanelOrder.map((panelId, index) => (
            <MovablePanel
              key={panelId}
              canMoveDown={index < sidebarPanelOrder.length - 1}
              canMoveUp={index > 0}
              label={sidebarPanelLabels[panelId]}
              text={text}
              onDragOver={(event) => dragPanelOver("sidebar", event)}
              onDragStart={(event) => startPanelDrag("sidebar", panelId, event)}
              onDrop={(event) => dropSidebarPanel(panelId, event)}
              onMoveDown={() => moveSidebarPanel(panelId, 1)}
              onMoveUp={() => moveSidebarPanel(panelId, -1)}
            >
              {renderSidebarPanel(panelId)}
            </MovablePanel>
          ))}
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
          <div className={`panel chart-panel ${chartExpanded ? "expanded" : ""}`}>
            <div className="chart-header">
              <div>
                <h2>{chartProps.title}</h2>
                <span>
                  {chartSubtitle}
                  {chartPending ? ` · ${text.analysisCalculating}` : ""}
                </span>
              </div>
              <div className="chart-tools">
                <div className="chart-tool-row">
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
                  <div className="chart-export-actions">
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => setChartExpanded((expanded) => !expanded)}
                      title={chartExpanded ? text.chartView.collapse : text.chartView.expand}
                      aria-label={chartExpanded ? text.chartView.collapse : text.chartView.expand}
                    >
                      {chartExpanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
                    </button>
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
                <div className="chart-actions">
                  <ChartScaleControls
                    text={text}
                    xMax={chartXRangeControls.max}
                    xMaxFloor={chartXRangeControls.maxFloor}
                    xMaxLimit={chartXRangeControls.maxLimit}
                    xMaxStep={chartXRangeControls.maxStep}
                    xMin={chartXRangeControls.min}
                    xMinFloor={chartXRangeControls.minFloor}
                    xMinLimit={chartXRangeControls.minLimit}
                    xMinStep={chartXRangeControls.minStep}
                    xPresets={chartXRangeControls.presets}
                    xUnit={chartXRangeControls.unit}
                    yAuto={activeChartYScale.auto}
                    yMax={activeChartYScale.max}
                    yMin={activeChartYScale.min}
                    onXMaxChange={chartXRangeControls.onMaxChange}
                    onXMinChange={chartXRangeControls.onMinChange}
                    onPreset={chartXRangeControls.onPreset}
                    onReset={() => {
                      if (isTimeDomainChart) {
                        setChartStepTimeMinMs(DEFAULT_CHART_STEP_TIME_MIN_MS);
                        setChartStepTimeMaxMs(DEFAULT_CHART_STEP_TIME_MAX_MS);
                      } else {
                        setChartFrequencyMinHz(DEFAULT_CHART_FREQUENCY_MIN_HZ);
                        setChartFrequencyMaxHz(DEFAULT_FREQUENCY_MAX_HZ);
                      }
                      updateActiveChartYScale(defaultChartYScale(activeTab));
                    }}
                    onYAutoChange={(auto) => updateActiveChartYScale({ auto })}
                    onYMaxChange={(value) => {
                      updateActiveChartYScale({
                        auto: false,
                        max: parseBoundedNumber(value, activeChartYScale.max, -CHART_Y_LIMIT, CHART_Y_LIMIT),
                      });
                    }}
                    onYMinChange={(value) => {
                      updateActiveChartYScale({
                        auto: false,
                        min: parseBoundedNumber(value, activeChartYScale.min, -CHART_Y_LIMIT, CHART_Y_LIMIT),
                      });
                    }}
                  />
                </div>
              </div>
            </div>
            <input
              ref={measurementInputRef}
              className="hidden-input"
              type="file"
              accept=".frd,.zma,.txt,.csv,text/plain,text/csv"
              onChange={importMeasurementFile}
            />

            <div className="chart-workbench">
              <div className="chart-stage">
                <LineChart
                  {...chartProps}
                  referenceLabel={text.reference}
                  referenceSeries={currentReference?.series ?? []}
                  svgRef={chartSvgRef}
                  xLimit={isTimeDomainChart
                    ? [CHART_STEP_TIME_MIN_LIMIT_MS, CHART_STEP_TIME_MAX_LIMIT_MS]
                    : [CHART_FREQUENCY_MIN_LIMIT_HZ, MAX_FREQUENCY_MAX_HZ]}
                  onXDomainChange={isTimeDomainChart ? updateChartStepTimeDomain : updateChartFrequencyDomain}
                  onXDomainReset={isTimeDomainChart
                    ? () => updateChartStepTimeDomain([DEFAULT_CHART_STEP_TIME_MIN_MS, DEFAULT_CHART_STEP_TIME_MAX_MS])
                    : () => updateChartFrequencyDomain([DEFAULT_CHART_FREQUENCY_MIN_HZ, DEFAULT_FREQUENCY_MAX_HZ])}
                  onYDomainChange={updateChartYDomain}
                  onYDomainReset={() => updateActiveChartYScale(defaultChartYScale(activeTab))}
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
                    <span>{configStatusText}</span>
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
                      driver={selectedDriver}
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
            {chartFrequencyDomain[1] > DEFAULT_FREQUENCY_MAX_HZ ? (
              <div className="chart-range-warning">{text.chartScale.warning}</div>
            ) : null}
            <div className="chart-control-strip">
              {chartPanelOrder.map((panelId) => renderChartToolPanel(panelId))}
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
            <CalculationPassport
              driver={analysisSnapshot.driver}
              powerW={analysisSnapshot.powerW}
              result={focusedAnalysisResult}
              splInputMode={analysisSnapshot.splInputMode}
              stale={analysisStale}
              text={text}
            />
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

function DriverLibraryFilters({
  filters,
  text,
  total,
  visible,
  onChange,
}: {
  filters: LibraryFilters;
  text: UiText;
  total: number;
  visible: number;
  onChange: (filters: LibraryFilters) => void;
}) {
  const update = (patch: Partial<LibraryFilters>) => onChange({ ...filters, ...patch });
  const updateNumber = (key: keyof LibraryFilters, value: string) => {
    const parsed = Number.parseFloat(value);
    update({ [key]: Number.isFinite(parsed) ? parsed : undefined } as Partial<LibraryFilters>);
  };

  return (
    <div className="library-panel">
      <div className="library-head">
        <span>
          <Filter size={14} />
          {text.library.title}
        </span>
        <em>{text.library.visible(visible, total)}</em>
      </div>
      <label className="field span-2">
        <span>{text.library.search}</span>
        <div className="search-field">
          <Search size={14} />
          <input
            type="search"
            value={filters.query}
            onChange={(event) => update({ query: event.target.value })}
          />
        </div>
      </label>
      <div className="library-grid">
        <label className="field">
          <span>{text.library.status}</span>
          <select value={filters.status} onChange={(event) => update({ status: event.target.value as DriverFilterStatus })}>
            <option value="all">{text.library.all}</option>
            <option value="verified">{text.library.verified}</option>
            <option value="modified">{text.library.modified}</option>
            <option value="user">{text.library.user}</option>
          </select>
        </label>
        <FilterNumber label={text.library.maxFs} unit="Hz" value={filters.maxFsHz} onChange={(value) => updateNumber("maxFsHz", value)} />
        <FilterNumber label={text.library.maxQts} unit="" value={filters.maxQts} onChange={(value) => updateNumber("maxQts", value)} />
        <FilterNumber label={text.library.maxVas} unit="L" value={filters.maxVasL} onChange={(value) => updateNumber("maxVasL", value)} />
        <FilterNumber label={text.library.minSd} unit="cm²" value={filters.minSdCm2} onChange={(value) => updateNumber("minSdCm2", value)} />
        <FilterNumber label={text.library.minXmax} unit="mm" value={filters.minXmaxMm} onChange={(value) => updateNumber("minXmaxMm", value)} />
      </div>
    </div>
  );
}

function FilterNumber({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {unit ? <em>{unit}</em> : null}
      </span>
      <input
        type="number"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function DesignEditor({
  boxLabels,
  design,
  driver,
  focused,
  text,
  onChange,
  onDuplicate,
  onDelete,
}: {
  boxLabels: Record<BoxKind, string>;
  design: BoxDesign;
  driver: SpeakerDriver;
  focused: boolean;
  text: UiText;
  onChange: (patch: Partial<BoxDesign>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const hasTuning = design.kind === "vented" || design.kind === "bandpass";
  const hasPort = design.kind === "vented" || design.kind === "bandpass";
  const hasPassiveRadiator = design.kind === "passive";
  const hasAperiodicVent = design.kind === "aperiodic";
  const hasVentGeometry = hasPort || hasAperiodicVent;
  const aperiodicMode = hasAperiodicVent ? design.aperiodicMode ?? "ql" : undefined;
  const ventShapeLabel = hasAperiodicVent ? text.aperiodicVentShape : text.portShape;
  const ventDiameterLabel = hasAperiodicVent ? text.aperiodicVentDiameter : text.portDiameter;
  const ventCountLabel = hasAperiodicVent ? text.aperiodicVentCount : text.ports;
  const dampingLabel = hasAperiodicVent ? text.aperiodicDamping : "Ql";
  const aperiodicSummary = hasAperiodicVent ? aperiodicVentSummary(design, driver, text) : undefined;
  const aperiodicResistance = hasAperiodicVent && aperiodicMode === "flow"
    ? aperiodicResistanceSummary(design, driver, text)
    : undefined;
  const selectedDampingPreset = hasAperiodicVent && aperiodicMode === "ql"
    ? selectedAperiodicDampingPreset(design.ql ?? 1.7)
    : undefined;
  const passiveTuning = hasPassiveRadiator ? passiveRadiatorTuningSummary(design, driver) : undefined;

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
        <div className="design-head-actions">
          <button type="button" className="icon-button" onClick={onDuplicate} title={text.duplicate}>
            <Copy size={16} />
          </button>
          <button type="button" className="icon-button" onClick={onDelete} title={text.delete}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <div className="design-grid">
        <label className="field">
          <span>{text.type}</span>
          <select
            value={design.kind}
            onChange={(event) => onChange(designKindPatch(event.target.value as BoxKind, design, driver))}
          >
            {Object.entries(boxLabels).map(([kind, label]) => (
              <option key={kind} value={kind}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {design.kind === "bandpass" ? (
          <>
            <NumberField
              label={text.bandpassRear}
              unit="L"
              value={design.bandpassRearLiters ?? design.vbLiters}
              min={0.1}
              step="0.1"
              onChange={(rear) => {
                const front = design.bandpassFrontLiters ?? design.vbLiters * 0.6;
                onChange({ bandpassRearLiters: rear, vbLiters: rear + front });
              }}
            />
            <NumberField
              label={text.bandpassFront}
              unit="L"
              value={design.bandpassFrontLiters ?? design.vbLiters * 0.6}
              min={0.1}
              step="0.1"
              onChange={(front) => {
                const rear = design.bandpassRearLiters ?? design.vbLiters;
                onChange({ bandpassFrontLiters: front, vbLiters: rear + front });
              }}
            />
          </>
        ) : (
          <NumberField label={text.table.vb} unit="L" value={design.vbLiters} min={0.1} step="0.1" onChange={(vbLiters) => onChange({ vbLiters })} />
        )}
        {hasTuning ? (
          <NumberField label="Fb" unit="Hz" value={design.fbHz ?? 30} min={1} step="0.1" onChange={(fbHz) => onChange({ fbHz })} />
        ) : null}
        {hasAperiodicVent ? (
          <label className="field">
            <span>{text.aperiodicMode}</span>
            <select
              value={aperiodicMode}
              onChange={(event) => onChange(aperiodicModePatch(event.target.value as AperiodicMode, design))}
            >
              {APERIODIC_MODES.map((mode) => (
                <option key={mode} value={mode}>{text.aperiodicModes[mode]}</option>
              ))}
            </select>
          </label>
        ) : null}
        {design.kind !== "sealed" && design.kind !== "infinite" && !hasPassiveRadiator && !(hasAperiodicVent && aperiodicMode === "flow") ? (
          <NumberField label={dampingLabel} unit="" value={design.ql ?? (design.kind === "aperiodic" ? 1.7 : 7)} min={0.1} step="0.1" onChange={(ql) => onChange({ ql })} />
        ) : null}
        {hasPassiveRadiator ? (
          <>
            <NumberField
              label={text.passiveRadiatorSd}
              unit="cm²"
              value={design.passiveRadiatorSdCm2 ?? defaultPassiveRadiatorSdCm2(driver)}
              min={1}
              step="1"
              onChange={(passiveRadiatorSdCm2) => onChange({ passiveRadiatorSdCm2 })}
            />
            <NumberField
              label={text.passiveRadiatorMms}
              unit="g"
              value={design.passiveRadiatorMmsG ?? defaultPassiveRadiatorMmsG(design, driver)}
              min={1}
              step="1"
              onChange={(passiveRadiatorMmsG) => onChange({ passiveRadiatorMmsG })}
            />
            <NumberField
              label={text.passiveRadiatorQms}
              unit=""
              value={design.passiveRadiatorQms ?? design.ql ?? 9}
              min={0.5}
              step="0.1"
              onChange={(passiveRadiatorQms) => onChange({ passiveRadiatorQms, ql: passiveRadiatorQms })}
            />
            <NumberField
              label={text.passiveRadiatorXmax}
              unit="mm"
              value={design.passiveRadiatorXmaxMm ?? defaultPassiveRadiatorXmaxMm(driver)}
              min={0.1}
              step="0.1"
              onChange={(passiveRadiatorXmaxMm) => onChange({ passiveRadiatorXmaxMm })}
            />
            <NumberField
              label={text.passiveRadiatorCount}
              unit=""
              value={design.passiveRadiatorCount ?? 1}
              min={1}
              step="1"
              onChange={(passiveRadiatorCount) => onChange({ passiveRadiatorCount: Math.max(1, Math.round(passiveRadiatorCount)) })}
            />
          </>
        ) : null}
        {hasAperiodicVent && aperiodicMode === "ql" ? (
          <div className="aperiodic-preset-control" role="group" aria-label={text.aperiodicDampingPreset}>
            <span>{text.aperiodicDampingPreset}</span>
            <div className="aperiodic-preset-buttons">
              {APERIODIC_DAMPING_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  className={selectedDampingPreset === preset.key ? "active" : ""}
                  aria-pressed={selectedDampingPreset === preset.key}
                  title={`Ql ${formatCompactNumber(preset.ql)}`}
                  onClick={() => onChange({ ql: preset.ql })}
                >
                  {text.aperiodicDampingPresets[preset.key]}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {hasAperiodicVent && aperiodicMode === "flow" ? (
          <>
            <label className="field">
              <span>{text.aperiodicMaterial}</span>
              <select
                value={design.aperiodicMaterial ?? "felt"}
                onChange={(event) => onChange(aperiodicMaterialPatch(event.target.value as AperiodicMaterial, design))}
              >
                {APERIODIC_MATERIAL_KEYS.map((material) => (
                  <option key={material} value={material}>{text.aperiodicMaterials[material]}</option>
                ))}
              </select>
            </label>
            <NumberField
              label={text.aperiodicThickness}
              unit="mm"
              value={design.aperiodicThicknessMm ?? 8}
              min={0.5}
              max={200}
              step="0.5"
              onChange={(aperiodicThicknessMm) => onChange({ aperiodicThicknessMm })}
            />
            <NumberField
              label={text.aperiodicFlowResistance}
              unit="Pa s/m²"
              value={design.flowResistivityPaSecM2 ?? defaultFlowResistivity(design.aperiodicMaterial ?? "felt")}
              min={100}
              max={200000}
              step="100"
              onChange={(flowResistivityPaSecM2) => onChange({ flowResistivityPaSecM2, aperiodicMaterial: "custom" })}
            />
          </>
        ) : null}
        {hasVentGeometry ? (
          <>
            <label className="field">
              <span>{ventShapeLabel}</span>
              <select
                value={design.portShape ?? "round"}
                onChange={(event) => onChange({ portShape: event.target.value as BoxDesign["portShape"] })}
              >
                <option value="round">{text.portShapes.round}</option>
                <option value="slot">{text.portShapes.slot}</option>
              </select>
            </label>
            {(design.portShape ?? "round") === "slot" ? (
              <>
                <NumberField
                  label={text.portWidth}
                  unit="cm"
                  value={design.portWidthCm ?? 20}
                  min={0.1}
                  step="0.1"
                  onChange={(portWidthCm) => onChange({ portWidthCm })}
                />
                <NumberField
                  label={text.portHeight}
                  unit="cm"
                  value={design.portHeightCm ?? 3}
                  min={0.1}
                  step="0.1"
                  onChange={(portHeightCm) => onChange({ portHeightCm })}
                />
              </>
            ) : (
              <NumberField
                label={ventDiameterLabel}
                unit="cm"
                value={design.portDiameterCm ?? (hasAperiodicVent ? defaultAperiodicVentDiameterCm(driver) : 7)}
                min={0.1}
                step="0.1"
                onChange={(portDiameterCm) => onChange({ portDiameterCm })}
              />
            )}
            <NumberField
              label={ventCountLabel}
              unit=""
              value={design.portCount ?? 1}
              min={1}
              step="1"
              onChange={(portCount) => onChange({ portCount: Math.max(1, Math.round(portCount)) })}
            />
          </>
        ) : null}
        {aperiodicSummary ? (
          <div className={`design-readout ${aperiodicSummary.tone}`}>
            <span>{text.aperiodicVentRatio}</span>
            <strong>{aperiodicSummary.value}</strong>
            <em>{aperiodicSummary.note}</em>
          </div>
        ) : null}
        {aperiodicResistance ? (
          <div className="design-readout">
            <span>{text.aperiodicRa}</span>
            <strong>{aperiodicResistance.value}</strong>
            <em>{aperiodicResistance.note}</em>
          </div>
        ) : null}
        {passiveTuning ? (
          <div className="design-readout">
            <span>{text.passiveRadiatorTuning}</span>
            <strong>{passiveTuning.value}</strong>
            <em>{passiveTuning.note}</em>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function NumberField({
  label,
  unit,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min?: number;
  max?: number;
  step: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  function handleChange(value: string) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) {
      return;
    }
    onChange(clampNumber(parsed, min ?? Number.NEGATIVE_INFINITY, max ?? Number.POSITIVE_INFINITY));
  }

  return (
    <label className="field">
      <span>
        {label}
        {unit ? <em>{unit}</em> : null}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={Number.isFinite(value) ? value : ""}
        onChange={(event) => handleChange(event.target.value)}
      />
    </label>
  );
}

function designKindPatch(kind: BoxKind, design: BoxDesign, driver: SpeakerDriver): Partial<BoxDesign> {
  if (kind === "aperiodic") {
    return {
      kind,
      ql: design.ql ?? 1.7,
      aperiodicMode: design.aperiodicMode ?? "flow",
      aperiodicMaterial: design.aperiodicMaterial ?? "felt",
      aperiodicThicknessMm: design.aperiodicThicknessMm ?? 8,
      flowResistivityPaSecM2: design.flowResistivityPaSecM2 ?? defaultFlowResistivity(design.aperiodicMaterial ?? "felt"),
      portShape: design.portShape ?? "round",
      portDiameterCm: design.portDiameterCm ?? defaultAperiodicVentDiameterCm(driver),
      portCount: design.portCount ?? 1,
    };
  }
  if (kind === "vented" || kind === "bandpass") {
    const base: Partial<BoxDesign> = {
      kind,
      fbHz: design.fbHz ?? Math.max(15, driver.fsHz),
      ql: design.ql && design.ql >= 2 ? design.ql : (kind === "bandpass" ? 7 : 7),
      portShape: design.portShape ?? "round",
      portDiameterCm: design.portDiameterCm ?? 7,
      portCount: design.portCount ?? 1,
    };
    if (kind === "bandpass") {
      base.bandpassRearLiters = design.bandpassRearLiters ?? Math.max(1, design.vbLiters);
      base.bandpassFrontLiters = design.bandpassFrontLiters ?? Math.max(1, design.vbLiters * 0.6);
    }
    return base;
  }
  if (kind === "passive") {
    const vbLiters = design.vbLiters || Math.max(1, driver.vasL * 0.8);
    const fbHz = design.fbHz ?? Math.max(15, driver.fsHz * 0.78);
    const passiveRadiatorSdCm2 = design.passiveRadiatorSdCm2 ?? defaultPassiveRadiatorSdCm2(driver);
    const passiveRadiatorCount = design.passiveRadiatorCount ?? 1;
    return {
      kind,
      ql: design.ql ?? 9,
      passiveRadiatorSdCm2,
      passiveRadiatorMmsG: design.passiveRadiatorMmsG ?? passiveRadiatorMassForTarget(vbLiters, fbHz, passiveRadiatorSdCm2, passiveRadiatorCount),
      passiveRadiatorQms: design.passiveRadiatorQms ?? design.ql ?? 9,
      passiveRadiatorXmaxMm: design.passiveRadiatorXmaxMm ?? defaultPassiveRadiatorXmaxMm(driver),
      passiveRadiatorCount,
    };
  }
  return { kind };
}

function aperiodicModePatch(mode: AperiodicMode, design: BoxDesign): Partial<BoxDesign> {
  if (mode === "flow") {
    const material = design.aperiodicMaterial ?? "felt";
    return {
      aperiodicMode: "flow",
      aperiodicMaterial: material,
      aperiodicThicknessMm: design.aperiodicThicknessMm ?? 8,
      flowResistivityPaSecM2: design.flowResistivityPaSecM2 ?? defaultFlowResistivity(material),
    };
  }
  return {
    aperiodicMode: "ql",
    ql: design.ql ?? 1.7,
  };
}

function aperiodicMaterialPatch(material: AperiodicMaterial, design: BoxDesign): Partial<BoxDesign> {
  return {
    aperiodicMaterial: material,
    flowResistivityPaSecM2: material === "custom"
      ? design.flowResistivityPaSecM2 ?? defaultFlowResistivity("felt")
      : defaultFlowResistivity(material),
  };
}

function defaultFlowResistivity(material: AperiodicMaterial): number {
  return APERIODIC_MATERIALS[material].flowResistivityPaSecM2;
}

function defaultAperiodicVentDiameterCm(driver: SpeakerDriver): number {
  const targetAreaCm2 = Math.max(0.5, driver.sdCm2 * 0.1);
  return roundTo(Math.sqrt((targetAreaCm2 * 4) / Math.PI), 1);
}

function defaultPassiveRadiatorSdCm2(driver: SpeakerDriver): number {
  return roundTo(Math.max(driver.sdCm2 * 1.5, driver.sdCm2 + 20), 1);
}

function defaultPassiveRadiatorXmaxMm(driver: SpeakerDriver): number {
  return roundTo((driver.xmaxMm ?? 6) * 1.8, 1);
}

function defaultPassiveRadiatorMmsG(design: BoxDesign, driver: SpeakerDriver): number {
  return passiveRadiatorMassForTarget(
    design.vbLiters,
    design.fbHz ?? Math.max(15, driver.fsHz * 0.78),
    design.passiveRadiatorSdCm2 ?? defaultPassiveRadiatorSdCm2(driver),
    design.passiveRadiatorCount ?? 1,
  );
}

function passiveRadiatorMassForTarget(vbLiters: number, fbHz: number, sdCm2: number, count: number): number {
  const cab = Math.max(0.001, vbLiters / 1000) / (1.204 * 343 * 343);
  const sdM2 = Math.max(0.001, sdCm2 / 10000);
  const acousticMass = 1 / (Math.pow(Math.PI * 2 * Math.max(5, fbHz), 2) * cab);
  return roundTo(Math.max(1, acousticMass * Math.max(1, count) * sdM2 * sdM2 * 1000), 1);
}

function passiveRadiatorTuningSummary(design: BoxDesign, driver: SpeakerDriver): { value: string; note: string } {
  const cab = Math.max(0.001, design.vbLiters / 1000) / (1.204 * 343 * 343);
  const sdM2 = Math.max(0.001, (design.passiveRadiatorSdCm2 ?? defaultPassiveRadiatorSdCm2(driver)) / 10000);
  const count = Math.max(1, Math.round(design.passiveRadiatorCount ?? 1));
  const mmsG = design.passiveRadiatorMmsG ?? defaultPassiveRadiatorMmsG(design, driver);
  const acousticMass = Math.max(0.001, mmsG / 1000) / (count * sdM2 * sdM2);
  const tuningHz = 1 / (Math.PI * 2 * Math.sqrt(Math.max(1e-12, acousticMass * cab)));
  return {
    value: `${formatCompactNumber(tuningHz)} Hz`,
    note: `${formatCompactNumber(mmsG)} g`,
  };
}

function selectedAperiodicDampingPreset(ql: number): AperiodicDampingPresetKey | undefined {
  return APERIODIC_DAMPING_PRESETS.find((preset) => Math.abs(preset.ql - ql) <= 0.05)?.key;
}

function aperiodicVentSummary(
  design: BoxDesign,
  driver: SpeakerDriver,
  text: UiText,
): { note: string; tone: "weak" | "normal" | "large"; value: string } {
  const areaCm2 = designVentAreaCm2(design, driver);
  const ratio = driver.sdCm2 > 0 ? areaCm2 / driver.sdCm2 : 0;
  const note = ratio < 0.03
    ? text.aperiodicVentWeak
    : ratio > 0.3
      ? text.aperiodicVentLarge
      : text.aperiodicVentNormal;
  const tone = ratio < 0.03 ? "weak" : ratio > 0.3 ? "large" : "normal";
  return {
    note,
    tone,
    value: `${formatCompactNumber(areaCm2)} cm² / ${fmt(ratio * 100, 1)}%`,
  };
}

function aperiodicResistanceSummary(
  design: BoxDesign,
  driver: SpeakerDriver,
  text: UiText,
): { note: string; value: string } {
  const areaM2 = Math.max(0.00001, designVentAreaCm2(design, driver) / 10000);
  const thicknessM = clampNumber((design.aperiodicThicknessMm ?? 8) / 1000, 0.0005, 0.2);
  const material = design.aperiodicMaterial ?? "felt";
  const flow = clampNumber(design.flowResistivityPaSecM2 ?? defaultFlowResistivity(material), 100, 200000);
  const ra = (flow * thicknessM) / areaM2;
  return {
    note: text.aperiodicMaterials[material],
    value: `${formatCompactNumber(ra)} Pa s/m³`,
  };
}

function designVentAreaCm2(design: BoxDesign, driver?: SpeakerDriver): number {
  const count = Math.max(1, design.portCount ?? 1);
  if (design.portShape === "slot") {
    return Math.max(0, design.portWidthCm ?? 0) * Math.max(0, design.portHeightCm ?? 0) * count;
  }
  const diameterCm = design.portDiameterCm ?? (driver ? defaultAperiodicVentDiameterCm(driver) : 0);
  const radiusCm = Math.max(0, diameterCm) / 2;
  return Math.PI * radiusCm * radiusCm * count;
}

function MovablePanel({
  canMoveDown,
  canMoveUp,
  children,
  label,
  text,
  onDragOver,
  onDragStart,
  onDrop,
  onMoveDown,
  onMoveUp,
}: {
  canMoveDown: boolean;
  canMoveUp: boolean;
  children: ReactNode;
  label: string;
  text: UiText;
  onDragOver: (event: ReactDragEvent<HTMLElement>) => void;
  onDragStart: (event: ReactDragEvent<HTMLElement>) => void;
  onDrop: (event: ReactDragEvent<HTMLElement>) => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
}) {
  return (
    <section className="section movable-panel" onDragOver={onDragOver} onDrop={onDrop}>
      <PanelDragBar
        canMoveDown={canMoveDown}
        canMoveUp={canMoveUp}
        label={label}
        text={text}
        onDragStart={onDragStart}
        onMoveDown={onMoveDown}
        onMoveUp={onMoveUp}
      />
      {children}
    </section>
  );
}

function PanelDragBar({
  canMoveDown,
  canMoveUp,
  label,
  text,
  onDragStart,
  onMoveDown,
  onMoveUp,
}: {
  canMoveDown: boolean;
  canMoveUp: boolean;
  label: string;
  text: UiText;
  onDragStart: (event: ReactDragEvent<HTMLElement>) => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
}) {
  return (
    <div className="panel-drag-bar">
      <span
        aria-label={`${text.panelLayout.drag}: ${label}`}
        className="panel-drag-handle"
        draggable
        role="button"
        tabIndex={0}
        title={text.panelLayout.drag}
        onDragStart={onDragStart}
      >
        <GripVertical size={15} />
      </span>
      <span className="panel-drag-label">{label}</span>
      <div className="panel-order-actions">
        <button type="button" disabled={!canMoveUp} title={text.panelLayout.moveUp} onClick={onMoveUp}>
          <ArrowUp size={14} />
        </button>
        <button type="button" disabled={!canMoveDown} title={text.panelLayout.moveDown} onClick={onMoveDown}>
          <ArrowDown size={14} />
        </button>
      </div>
    </div>
  );
}

function DriverSourcePanel({
  canReset,
  driver,
  text,
  onReset,
}: {
  canReset: boolean;
  driver: SpeakerDriver;
  text: UiText;
  onReset: () => void;
}) {
  const source = driver.source;
  const sourceStatus = source?.modified ? "modified" : source?.verified ? "verified" : "";
  const sourceStatusText = source?.modified
    ? text.driverSource.modified
    : source?.verified
      ? text.driverSource.verified
      : text.driverSource.manual;

  return (
    <div className={`driver-source ${sourceStatus}`}>
      <div className="driver-source-head">
        <div>
          <FileCheck2 size={15} />
          <h3>{text.driverSource.title}</h3>
        </div>
        <span>{sourceStatusText}</span>
      </div>
      <div className="driver-source-body">
        <span>{source?.title ?? text.driverSource.sourceUnknown}</span>
        <div className="driver-source-actions">
          {source?.url ? (
            <a href={source.url} target="_blank" rel="noreferrer">
              <ExternalLink size={14} />
              {text.driverSource.open}
            </a>
          ) : null}
          {canReset ? (
            <button type="button" onClick={onReset}>
              <RefreshCw size={14} />
              {text.driverSource.reset}
            </button>
          ) : null}
        </div>
      </div>
      {source?.notes?.length ? (
        <div className="driver-source-notes">
          {source.notes.map((note) => (
            <span key={note}>{text.driverSource.notes[note]}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ChartInputsPanel({
  activeTab,
  acousticOptions,
  design,
  dragHandle,
  driver,
  powerW,
  splInputMode,
  profile,
  text,
  onDragOver,
  onDrop,
}: {
  activeTab: ChartTab;
  acousticOptions: AcousticOptions;
  design?: BoxDesign;
  dragHandle?: ReactNode;
  driver: SpeakerDriver;
  powerW: number;
  splInputMode: SplInputMode;
  profile: DriverProfile;
  text: UiText;
  onDragOver?: (event: ReactDragEvent<HTMLElement>) => void;
  onDrop?: (event: ReactDragEvent<HTMLElement>) => void;
}) {
  const groups = chartInputGroups(activeTab, driver, design, powerW, splInputMode, acousticOptions, profile, text)
    .filter((group) => group.items.length > 0);

  return (
    <section className="mini-panel chart-inputs-panel movable-panel" onDragOver={onDragOver} onDrop={onDrop}>
      {dragHandle}
      <div className="mini-panel-head">
        <h3>{text.chartInputs.title}</h3>
        <span>{text.chartTabs[activeTab]}</span>
      </div>
      <div className="chart-input-groups">
        {groups.map((group) => (
          <div className="chart-input-group" key={group.id}>
            <h4>{group.label}</h4>
            <div className="chart-input-list">
              {group.items.map((item) => (
                <div className={`chart-input-item ${item.tone ?? ""}`} key={`${group.id}-${item.label}`}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  {item.note ? <em>{item.note}</em> : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AcousticCorrectionsPanel({
  dragHandle,
  options,
  text,
  onChange,
  onDragOver,
  onDrop,
}: {
  dragHandle?: ReactNode;
  options: AcousticOptions;
  text: UiText;
  onChange: (options: AcousticOptions) => void;
  onDragOver?: (event: ReactDragEvent<HTMLElement>) => void;
  onDrop?: (event: ReactDragEvent<HTMLElement>) => void;
}) {
  const update = (patch: Partial<AcousticOptions>) => onChange({ ...options, ...patch });
  return (
    <section className="mini-panel movable-panel" onDragOver={onDragOver} onDrop={onDrop}>
      {dragHandle}
      <div className="mini-panel-head">
        <h3>{text.corrections.title}</h3>
      </div>
      <div className="mini-grid">
        <NumberField label={text.corrections.roomGain} unit="dB" value={options.roomGainDb} min={-24} max={24} step="0.5" onChange={(roomGainDb) => update({ roomGainDb })} />
        <NumberField label={text.corrections.roomStart} unit="Hz" value={options.roomGainStartHz} min={1} max={500} step="5" onChange={(roomGainStartHz) => update({ roomGainStartHz })} />
        <NumberField label={text.corrections.baffleStep} unit="dB" value={options.baffleStepDb} min={-24} max={24} step="0.5" onChange={(baffleStepDb) => update({ baffleStepDb })} />
        <NumberField label={text.corrections.baffleHz} unit="Hz" value={options.baffleStepHz} min={1} max={20000} step="10" onChange={(baffleStepHz) => update({ baffleStepHz })} />
      </div>
    </section>
  );
}

function MeasurementPanel({
  addedMassFsFromFreeAir,
  addedMassFsHz,
  addedMassTsEstimate,
  addedMassZma,
  count,
  dragHandle,
  driver,
  driverMeasurements,
  estimate,
  frdMeasurements,
  freeAirTsEstimate,
  freeAirZma,
  sealedBoxTsEstimate,
  sealedFsFromFreeAir,
  sealedFsHz,
  sealedZma,
  text,
  totalCount,
  zmaMeasurements,
  onAddedMassZmaChange,
  onApplyDriverValues,
  onAutoAlignSpl,
  onClear,
  onClearCurrent,
  onFreeAirZmaChange,
  onImport,
  onMeasurementOffsetChange,
  onRemoveMeasurement,
  onRenameMeasurement,
  onSealedZmaChange,
  onToggleMeasurementVisibility,
  onDragOver,
  onDrop,
}: {
  addedMassFsFromFreeAir: boolean;
  addedMassFsHz: number;
  addedMassTsEstimate: AddedMassTsEstimate | null;
  addedMassZma: AddedMassZmaState;
  count: number;
  dragHandle?: ReactNode;
  driver: SpeakerDriver;
  driverMeasurements: MeasurementTrace[];
  estimate: SealedZmaEstimate | null;
  frdMeasurements: MeasurementTrace[];
  freeAirTsEstimate: FreeAirTsEstimate | null;
  freeAirZma: FreeAirZmaState;
  sealedBoxTsEstimate: SealedBoxTsEstimate | null;
  sealedFsFromFreeAir: boolean;
  sealedFsHz: number;
  sealedZma: SealedZmaState;
  text: UiText;
  totalCount: number;
  zmaMeasurements: MeasurementTrace[];
  onAddedMassZmaChange: (patch: Partial<AddedMassZmaState>) => void;
  onApplyDriverValues: (values: Partial<Record<DriverFormulaField, number | undefined>>) => void;
  onAutoAlignSpl: (id: string) => void;
  onClear: () => void;
  onClearCurrent: () => void;
  onFreeAirZmaChange: (patch: Partial<FreeAirZmaState>) => void;
  onImport: () => void;
  onMeasurementOffsetChange: (id: string, offsetDb: number) => void;
  onRemoveMeasurement: (id: string) => void;
  onRenameMeasurement: (id: string, name: string) => void;
  onSealedZmaChange: (patch: Partial<SealedZmaState>) => void;
  onToggleMeasurementVisibility: (id: string) => void;
  onDragOver?: (event: ReactDragEvent<HTMLElement>) => void;
  onDrop?: (event: ReactDragEvent<HTMLElement>) => void;
}) {
  const [selectedFrdId, setSelectedFrdId] = useState<string | undefined>(undefined);
  const selectedFrdMeasurement = frdMeasurements.find((measurement) => measurement.id === selectedFrdId) ??
    frdMeasurements[0];
  const targetVolume = sealedTargetVolumeFromTs(driver, sealedZma.targetQtc);
  const sealedAlignment = estimate?.qtc !== undefined
    ? sealedAlignmentFromFcQtc(estimate.fcHz, estimate.qtc)
    : null;
  const qtcAdvice = estimate?.qtc
    ? estimate.qtc > sealedZma.targetQtc + 0.04
      ? text.measurements.sealedZma.currentAboveTarget
      : estimate.qtc < sealedZma.targetQtc - 0.04
        ? text.measurements.sealedZma.currentBelowTarget
        : undefined
    : undefined;

  return (
    <section className="mini-panel measurement-panel movable-panel" onDragOver={onDragOver} onDrop={onDrop}>
      {dragHandle}
      <div className="mini-panel-head">
        <h3>{text.measurements.title}</h3>
        <span>{text.measurements.imported(count, totalCount)}</span>
      </div>
      <p>{text.measurements.visibleHint}</p>
      <div className="measurement-actions">
        <button type="button" className="text-button" onClick={onImport} title={text.measurements.import}>
          <Upload size={16} />
          {text.measurements.import}
        </button>
        <button type="button" className="text-button" disabled={count === 0} onClick={onClearCurrent}>
          <RefreshCw size={16} />
          {text.measurements.clearCurrent}
        </button>
        <button type="button" className="text-button" disabled={totalCount === 0} onClick={onClear}>
          <Trash2 size={16} />
          {text.measurements.clear}
        </button>
      </div>
      {driverMeasurements.length > 0 ? (
        <ul className="measurement-list" data-testid="measurement-list">
          {driverMeasurements.map((measurement) => (
            <li key={measurement.id} className={measurement.hidden ? "hidden-trace" : ""}>
              <i style={{ background: measurement.color }} />
              <input
                type="text"
                className="measurement-name"
                value={measurement.name}
                title={text.measurements.rename}
                aria-label={text.measurements.rename}
                onChange={(event) => onRenameMeasurement(measurement.id, event.target.value)}
              />
              <span className="measurement-kind">{measurement.kind === "zma" ? "ZMA" : "FRD"}</span>
              <button
                type="button"
                className="icon-button"
                title={measurement.hidden ? text.measurements.show : text.measurements.hide}
                aria-label={measurement.hidden ? text.measurements.show : text.measurements.hide}
                onClick={() => onToggleMeasurementVisibility(measurement.id)}
              >
                {measurement.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button
                type="button"
                className="icon-button"
                title={text.measurements.remove}
                aria-label={text.measurements.remove}
                onClick={() => onRemoveMeasurement(measurement.id)}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="sealed-zma-tool" data-testid="free-air-tool">
        <div className="mini-panel-head">
          <h3>{text.measurements.freeAir.title}</h3>
        </div>
        <p>{text.measurements.freeAir.conditions}</p>
        {zmaMeasurements.length > 0 ? (
          <>
            <label className="field">
              <span>{text.measurements.freeAir.zma}</span>
              <select
                value={freeAirZma.selectedMeasurementId ?? zmaMeasurements[0]?.id ?? ""}
                onChange={(event) => onFreeAirZmaChange({ selectedMeasurementId: event.target.value })}
              >
                {zmaMeasurements.map((measurement) => (
                  <option key={measurement.id} value={measurement.id}>
                    {measurement.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="mini-grid">
              <NumberField
                label={text.measurements.freeAir.reDc}
                unit="Ω"
                value={freeAirZma.reOhm ?? driver.reOhm}
                min={0.1}
                max={100}
                step="0.01"
                onChange={(reOhm) => onFreeAirZmaChange({ reOhm })}
              />
            </div>
            {freeAirTsEstimate ? (
              <div className="sealed-zma-readout">
                <div>
                  <span>{text.measurements.freeAir.fs}</span>
                  <strong>{formatHz(freeAirTsEstimate.fsHz)}</strong>
                </div>
                <div>
                  <span>{text.measurements.freeAir.reByZma}</span>
                  <strong>{fmt(freeAirTsEstimate.baselineReOhm, 2)} Ω</strong>
                </div>
                <div>
                  <span>{text.measurements.freeAir.qms}</span>
                  <strong>{fmt(freeAirTsEstimate.qms, 3)}</strong>
                </div>
                <div>
                  <span>{text.measurements.freeAir.qes}</span>
                  <strong>{fmt(freeAirTsEstimate.qes, 3)}</strong>
                </div>
                <div>
                  <span>{text.measurements.freeAir.qts}</span>
                  <strong>{fmt(freeAirTsEstimate.qts, 3)}</strong>
                </div>
              </div>
            ) : (
              <p>{text.measurements.freeAir.invalid}</p>
            )}
            {freeAirTsEstimate ? (
              <button
                type="button"
                className="text-button"
                onClick={() => onApplyDriverValues({
                  fsHz: freeAirTsEstimate.fsHz,
                  qes: freeAirTsEstimate.qes,
                  qms: freeAirTsEstimate.qms,
                  qts: freeAirTsEstimate.qts,
                })}
              >
                {text.measurements.applyToDriver}
              </button>
            ) : null}
            <p>{text.measurements.freeAir.reHint}</p>
          </>
        ) : (
          <p>{text.measurements.freeAir.noZma}</p>
        )}
      </div>
      <div className="sealed-zma-tool" data-testid="sealed-zma-tool">
        <div className="mini-panel-head">
          <h3>{text.measurements.sealedZma.title}</h3>
          {estimate ? <span>{text.measurements.sealedZma.confidence[estimate.confidence]}</span> : null}
        </div>
        <p>{text.measurements.sealedZma.conditions}</p>
        {zmaMeasurements.length > 0 ? (
          <>
            <label className="field">
              <span>{text.measurements.sealedZma.zma}</span>
              <select
                value={sealedZma.selectedMeasurementId ?? zmaMeasurements[0]?.id ?? ""}
                onChange={(event) => onSealedZmaChange({ selectedMeasurementId: event.target.value })}
              >
                {zmaMeasurements.map((measurement) => (
                  <option key={measurement.id} value={measurement.id}>
                    {measurement.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="mini-grid">
              <NumberField
                label={text.measurements.sealedZma.boxVolume}
                unit="L"
                value={sealedZma.boxVolumeLiters}
                min={0.1}
                max={10000}
                step="0.1"
                onChange={(boxVolumeLiters) => onSealedZmaChange({ boxVolumeLiters })}
              />
              <NumberField
                label={text.measurements.sealedZma.reDc}
                unit="Ω"
                value={sealedZma.reOhm ?? driver.reOhm}
                min={0.1}
                max={100}
                step="0.01"
                onChange={(reOhm) => onSealedZmaChange({ reOhm })}
              />
              <NumberField
                label={text.measurements.sealedZma.targetQtc}
                unit=""
                value={sealedZma.targetQtc}
                min={0.3}
                max={2}
                step="0.01"
                onChange={(targetQtc) => onSealedZmaChange({ targetQtc })}
              />
            </div>
            <p>
              {(sealedFsFromFreeAir ? text.measurements.fsFromFreeAir : text.measurements.fsFromDriver)(formatHz(sealedFsHz))}
            </p>
            {estimate ? (
              <div className="sealed-zma-readout">
                <div>
                  <span>{text.measurements.sealedZma.fc}</span>
                  <strong>{formatHz(estimate.fcHz)}</strong>
                </div>
                <div>
                  <span>{text.measurements.sealedZma.qtc}</span>
                  <strong>{fmt(estimate.qtc, 2)}</strong>
                </div>
                <div>
                  <span>{text.measurements.sealedZma.qmc}</span>
                  <strong>{fmt(estimate.qmc, 3)}</strong>
                </div>
                <div>
                  <span>{text.measurements.sealedZma.qec}</span>
                  <strong>{fmt(estimate.qec, 3)}</strong>
                </div>
                <div>
                  <span>{text.measurements.sealedZma.zMax}</span>
                  <strong>{fmt(estimate.zMaxOhm, 1)} Ω</strong>
                </div>
                <div>
                  <span>{text.measurements.sealedZma.f12}</span>
                  <strong>{formatHzPair(estimate.f1Hz, estimate.f2Hz)}</strong>
                </div>
                {sealedAlignment ? (
                  <>
                    <div>
                      <span>{text.measurements.sealedZma.f3}</span>
                      <strong>{formatHz(sealedAlignment.f3Hz)}</strong>
                    </div>
                    {sealedAlignment.peakDb !== undefined ? (
                      <div>
                        <span>{text.measurements.sealedZma.peak}</span>
                        <strong>+{fmt(sealedAlignment.peakDb, 1)} dB · {formatHz(sealedAlignment.peakHz)}</strong>
                      </div>
                    ) : null}
                    {estimate.qtc !== undefined ? (
                      <div>
                        <span>{text.measurements.sealedZma.alignment}</span>
                        <strong>{text.measurements.sealedZma.alignmentLabels[sealedAlignmentKey(estimate.qtc)]}</strong>
                      </div>
                    ) : null}
                  </>
                ) : null}
                {targetVolume ? (
                  <div>
                    <span>{text.measurements.sealedZma.tsTargetVolume}</span>
                    <strong>{fmt(targetVolume, 1)} L</strong>
                  </div>
                ) : null}
                {sealedBoxTsEstimate ? (
                  <>
                    <div>
                      <span>{text.measurements.sealedZma.vasByZma}</span>
                      <strong>{fmt(sealedBoxTsEstimate.vasL, 1)} L</strong>
                    </div>
                    {sealedBoxTsEstimate.qts !== undefined ? (
                      <div>
                        <span>{text.measurements.sealedZma.qtsByZma}</span>
                        <strong>{fmt(sealedBoxTsEstimate.qts, 3)}</strong>
                      </div>
                    ) : null}
                    <div>
                      <span>{text.measurements.sealedZma.tsPredicted}</span>
                      <strong>
                        {formatHz(sealedBoxTsEstimate.fcFromTsHz)} / {sealedBoxTsEstimate.qtcFromTs !== undefined
                          ? fmt(sealedBoxTsEstimate.qtcFromTs, 2)
                          : "-"}
                      </strong>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
            {sealedBoxTsEstimate ? (
              <button
                type="button"
                className="text-button"
                onClick={() => onApplyDriverValues({
                  qts: sealedBoxTsEstimate.qts,
                  vasL: sealedBoxTsEstimate.vasL,
                })}
              >
                {text.measurements.applyToDriver}
              </button>
            ) : null}
            <p>{qtcAdvice ?? text.measurements.sealedZma.responseHint}</p>
          </>
        ) : (
          <p>{text.measurements.sealedZma.noZma}</p>
        )}
      </div>
      <div className="sealed-zma-tool" data-testid="added-mass-tool">
        <div className="mini-panel-head">
          <h3>{text.measurements.addedMass.title}</h3>
        </div>
        <p>{text.measurements.addedMass.conditions}</p>
        {zmaMeasurements.length > 0 ? (
          <>
            <label className="field">
              <span>{text.measurements.addedMass.zma}</span>
              <select
                value={addedMassZma.selectedMeasurementId ?? zmaMeasurements[0]?.id ?? ""}
                onChange={(event) => onAddedMassZmaChange({ selectedMeasurementId: event.target.value })}
              >
                {zmaMeasurements.map((measurement) => (
                  <option key={measurement.id} value={measurement.id}>
                    {measurement.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="mini-grid">
              <NumberField
                label={text.measurements.addedMass.mass}
                unit="g"
                value={addedMassZma.addedMassGrams}
                min={0.1}
                max={1000}
                step="0.1"
                onChange={(addedMassGrams) => onAddedMassZmaChange({ addedMassGrams })}
              />
            </div>
            <p>
              {(addedMassFsFromFreeAir ? text.measurements.fsFromFreeAir : text.measurements.fsFromDriver)(formatHz(addedMassFsHz))}
            </p>
            {addedMassTsEstimate ? (
              <div className="sealed-zma-readout">
                <div>
                  <span>{text.measurements.addedMass.fm}</span>
                  <strong>{formatHz(addedMassTsEstimate.fmHz)}</strong>
                </div>
                <div>
                  <span>{text.measurements.addedMass.mmsByZma}</span>
                  <strong>{fmt(addedMassTsEstimate.mmsG, 2)} g</strong>
                </div>
                <div>
                  <span>{text.measurements.addedMass.cmsByZma}</span>
                  <strong>{fmt(addedMassTsEstimate.cmsMmN, 3)} mm/N</strong>
                </div>
                {addedMassTsEstimate.vasL !== undefined ? (
                  <div>
                    <span>{text.measurements.addedMass.vasByZma}</span>
                    <strong>{fmt(addedMassTsEstimate.vasL, 1)} L</strong>
                  </div>
                ) : null}
              </div>
            ) : (
              <p>{text.measurements.addedMass.invalid}</p>
            )}
            {addedMassTsEstimate ? (
              <button
                type="button"
                className="text-button"
                onClick={() => onApplyDriverValues({
                  cmsMmN: addedMassTsEstimate.cmsMmN,
                  mmsG: addedMassTsEstimate.mmsG,
                  vasL: addedMassTsEstimate.vasL,
                })}
              >
                {text.measurements.applyToDriver}
              </button>
            ) : null}
            <p>{text.measurements.addedMass.hint}</p>
          </>
        ) : (
          <p>{text.measurements.addedMass.noZma}</p>
        )}
      </div>
      <div className="sealed-zma-tool" data-testid="spl-align-tool">
        <div className="mini-panel-head">
          <h3>{text.measurements.splAlign.title}</h3>
        </div>
        <p>{text.measurements.splAlign.conditions}</p>
        {selectedFrdMeasurement ? (
          <>
            <label className="field">
              <span>{text.measurements.splAlign.frd}</span>
              <select
                value={selectedFrdMeasurement.id}
                onChange={(event) => setSelectedFrdId(event.target.value)}
              >
                {frdMeasurements.map((measurement) => (
                  <option key={measurement.id} value={measurement.id}>
                    {measurement.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="mini-grid">
              <NumberField
                label={text.measurements.splAlign.offset}
                unit="dB"
                value={selectedFrdMeasurement.offsetDb}
                min={-60}
                max={60}
                step="0.1"
                onChange={(offsetDb) => onMeasurementOffsetChange(selectedFrdMeasurement.id, offsetDb)}
              />
            </div>
            <div className="measurement-actions">
              <button
                type="button"
                className="text-button"
                onClick={() => onAutoAlignSpl(selectedFrdMeasurement.id)}
              >
                {text.measurements.splAlign.auto}
              </button>
              <button
                type="button"
                className="text-button"
                disabled={selectedFrdMeasurement.offsetDb === 0}
                onClick={() => onMeasurementOffsetChange(selectedFrdMeasurement.id, 0)}
              >
                {text.measurements.splAlign.reset}
              </button>
            </div>
            <p>{text.measurements.splAlign.hint}</p>
          </>
        ) : (
          <p>{text.measurements.splAlign.noFrd}</p>
        )}
      </div>
    </section>
  );
}

function DriverComparePanel({
  dragHandle,
  drivers,
  enabled,
  activeDriverId,
  selectedIds,
  text,
  onEnabledChange,
  onToggleDriver,
  onDragOver,
  onDrop,
}: {
  dragHandle?: ReactNode;
  drivers: SpeakerDriver[];
  enabled: boolean;
  activeDriverId: string;
  selectedIds: string[];
  text: UiText;
  onEnabledChange: (enabled: boolean) => void;
  onToggleDriver: (id: string) => void;
  onDragOver?: (event: ReactDragEvent<HTMLElement>) => void;
  onDrop?: (event: ReactDragEvent<HTMLElement>) => void;
}) {
  return (
    <section className="mini-panel compare-panel movable-panel" onDragOver={onDragOver} onDrop={onDrop}>
      {dragHandle}
      <div className="mini-panel-head">
        <h3>{text.compare.title}</h3>
        <label className="switch-control">
          <input type="checkbox" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} />
          <span>{text.compare.enable}</span>
        </label>
      </div>
      <p>{text.compare.hint}</p>
      <div className="compare-list">
        {drivers.map((driver) => {
          const isActiveDriver = driver.id === activeDriverId;
          return (
            <label key={driver.id} className={`compare-item ${isActiveDriver ? "active" : ""}`}>
              <input
                type="checkbox"
                checked={isActiveDriver || selectedIds.includes(driver.id)}
                disabled={isActiveDriver}
                onChange={() => onToggleDriver(driver.id)}
              />
              <span>{displayDriverName(driver, text)}</span>
            </label>
          );
        })}
      </div>
    </section>
  );
}

function ChartScaleControls({
  text,
  xMax,
  xMaxFloor,
  xMaxLimit,
  xMaxStep,
  xMin,
  xMinFloor,
  xMinLimit,
  xMinStep,
  xPresets,
  xUnit,
  yAuto,
  yMax,
  yMin,
  onXMaxChange,
  onXMinChange,
  onPreset,
  onReset,
  onYAutoChange,
  onYMaxChange,
  onYMinChange,
}: {
  text: UiText;
  xMax: number;
  xMaxFloor: number;
  xMaxLimit: number;
  xMaxStep: string;
  xMin: number;
  xMinFloor: number;
  xMinLimit: number;
  xMinStep: string;
  xPresets: ChartRangePreset[];
  xUnit: string;
  yAuto: boolean;
  yMax: number;
  yMin: number;
  onXMaxChange: (value: string) => void;
  onXMinChange: (value: string) => void;
  onPreset: (preset: ChartRangePreset) => void;
  onReset: () => void;
  onYAutoChange: (value: boolean) => void;
  onYMaxChange: (value: string) => void;
  onYMinChange: (value: string) => void;
}) {
  return (
    <div className="chart-scale-controls">
      <div className="chart-scale-presets">
        {xPresets.map((preset) => (
          <button key={preset.label} type="button" onClick={() => onPreset(preset)}>
            {preset.label}
          </button>
        ))}
      </div>
      <div className="chart-range-control x-range-control" aria-label={`${text.chartScale.from} ${text.chartScale.to}`}>
        <span>X</span>
        <input
          aria-label={text.chartScale.from}
          type="number"
          min={xMinFloor}
          max={xMinLimit}
          step={xMinStep}
          value={xMin}
          onChange={(event) => onXMinChange(event.target.value)}
        />
        <em>-</em>
        <input
          aria-label={text.chartScale.to}
          type="number"
          min={xMaxFloor}
          max={xMaxLimit}
          step={xMaxStep}
          value={xMax}
          onChange={(event) => onXMaxChange(event.target.value)}
        />
        <em>{xUnit}</em>
      </div>
      <label className="chart-range-control compact">
        <input
          type="checkbox"
          checked={yAuto}
          onChange={(event) => onYAutoChange(event.target.checked)}
        />
        <span>{text.chartScale.autoY}</span>
      </label>
      {!yAuto ? (
        <div className="chart-y-range-controls">
          <label className="chart-range-control y-field">
            <span>{text.chartScale.yMin}</span>
            <input
              type="number"
              step="1"
              value={yMin}
              onChange={(event) => onYMinChange(event.target.value)}
            />
          </label>
          <label className="chart-range-control y-field">
            <span>{text.chartScale.yMax}</span>
            <input
              type="number"
              step="1"
              value={yMax}
              onChange={(event) => onYMaxChange(event.target.value)}
            />
          </label>
        </div>
      ) : null}
      <button type="button" className="icon-button chart-reset-button" onClick={onReset} title={text.chartScale.reset} aria-label={text.chartScale.reset}>
        <RefreshCw size={16} />
      </button>
    </div>
  );
}

function DriverImpactPanel({
  activeTab,
  text,
}: {
  activeTab: ChartTab;
  text: UiText;
}) {
  const rows: Array<{ id: keyof UiText["driverImpact"]["rows"]; tabs: ChartTab[] }> = [
    { id: "damping", tabs: ["response", "spl", "phase", "groupDelay", "impulse", "step", "excursion", "impedance"] },
    { id: "level", tabs: ["spl"] },
    { id: "limits", tabs: ["spl", "excursion"] },
    { id: "motor", tabs: ["impedance", "response", "spl"] },
    { id: "piston", tabs: ["excursion", "port", "spl", "impedance"] },
  ];

  return (
    <div className="driver-impact">
      <h3>{text.driverImpact.title}</h3>
      <div className="driver-impact-list">
        {rows.map((row) => {
          const copy = text.driverImpact.rows[row.id];
          const isCurrent = row.tabs.includes(activeTab);
          return (
            <div className={`driver-impact-row ${isCurrent ? "active" : ""}`} key={row.id}>
              <span>{copy.params}</span>
              <em>{copy.charts}</em>
              {isCurrent ? <strong>{text.driverImpact.current}</strong> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DriverRelationsPanel({
  driver,
  lastManualField,
  mechanicalDerivedField,
  motorDerivedField,
  qualityDerivedField,
  text,
}: {
  driver: SpeakerDriver;
  lastManualField?: keyof SpeakerDriver;
  mechanicalDerivedField?: MechanicalDerivedField;
  motorDerivedField?: MotorDerivedField;
  qualityDerivedField?: QualityDerivedField;
  text: UiText;
}) {
  const chain = driverFormulaChain({
    lastManualField,
    mechanicalDerivedField,
    motorDerivedField,
    qualityDerivedField,
    text,
  });
  const formulas = driverActiveFormulaLabels({
    mechanicalDerivedField,
    motorDerivedField,
    qualityDerivedField,
    text,
  });
  const mismatches = driverFormulaMismatches(driver);

  return (
    <div className="driver-relations">
      <div className="driver-relations-head">
        <h3>{text.driverRelations.title}</h3>
        <span>{text.driverRelations.mismatches}</span>
      </div>
      <div className="driver-chain">
        <strong>{text.driverRelations.chain}</strong>
        <span>{chain.length > 0 ? chain.join(" -> ") : text.driverRelations.noChain}</span>
      </div>
      {formulas.length > 0 ? (
        <div className="driver-formula-list">
          {formulas.map((formula) => (
            <span key={formula}>{formula}</span>
          ))}
        </div>
      ) : null}
      <div className={`driver-mismatch-list ${mismatches.length === 0 ? "ok" : ""}`}>
        {mismatches.length > 0 ? mismatches.map((mismatch) => (
          <span key={mismatch.label}>{`${mismatch.label}: ${formatPercent(mismatch.errorRatio)}`}</span>
        )) : <span>{text.driverRelations.ok}</span>}
      </div>
    </div>
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

function chartInputGroups(
  activeTab: ChartTab,
  driver: SpeakerDriver,
  design: BoxDesign | undefined,
  powerW: number,
  splInputMode: SplInputMode,
  acousticOptions: AcousticOptions,
  profile: DriverProfile,
  text: UiText,
): ChartInputGroup[] {
  const groups = text.chartInputs.groups;
  const driverItems = chartDriverKeys(activeTab).map((key) => {
    const field = driverFieldByKey.get(key);
    const value = driver[key];
    const issues = profile.fieldIssues[key] ?? [];
    const isMissingSensitivity = key === "sensitivityDb" && value === undefined;
    return {
      label: field?.label ?? String(key),
      note: isMissingSensitivity ? text.chartInputs.notes.estimatedSensitivity : undefined,
      tone: issues.length > 0 || isMissingSensitivity ? "warning" as const : undefined,
      value: formatDriverInputValue(key, driver),
    };
  });

  const boxItems = design
    ? [
        { label: text.design, value: text.boxLabels[design.kind] },
        { label: "Vb", value: `${formatCompactNumber(design.vbLiters)} L` },
        ...(design.fbHz !== undefined && design.kind !== "passive" ? [{ label: "Fb", value: `${formatCompactNumber(design.fbHz)} Hz` }] : []),
        ...(design.kind === "aperiodic"
          ? aperiodicInputItems(design, driver, text)
          : design.ql !== undefined && design.kind !== "passive"
            ? [{ label: "Ql", value: formatCompactNumber(design.ql) }]
            : []),
        ...(chartUsesPort(activeTab, design) ? portInputItems(design, driver, text) : []),
      ]
    : [{ label: text.design, value: text.chartInputs.notes.noFocusedDesign, tone: "warning" as const }];

  const driveInput = resolveDriveInput(driver, { powerW, splInputMode });
  const globalItems: ChartInputItem[] = chartUsesPower(activeTab)
    ? [
        { label: text.splInputMode, value: text.splInputModes[splInputMode] },
        { label: "Vrms", value: `${formatCompactNumber(driveInput.voltageRms)} V` },
        { label: text.power, value: `${formatCompactNumber(driveInput.electricalPowerW)} W` },
      ]
    : [];

  const correctionItems: ChartInputItem[] = chartUsesCorrections(activeTab)
    ? [
        { label: text.corrections.roomGain, value: `${formatCompactNumber(acousticOptions.roomGainDb)} dB` },
        { label: text.corrections.roomStart, value: `${formatCompactNumber(acousticOptions.roomGainStartHz)} Hz` },
        { label: text.corrections.baffleStep, value: `${formatCompactNumber(acousticOptions.baffleStepDb)} dB` },
        { label: text.corrections.baffleHz, value: `${formatCompactNumber(acousticOptions.baffleStepHz)} Hz` },
      ]
    : [];

  return [
    { id: "driver", label: groups.driver, items: driverItems },
    { id: "box", label: groups.box, items: boxItems },
    { id: "global", label: groups.global, items: globalItems },
    { id: "corrections", label: groups.corrections, items: correctionItems },
  ];
}

function chartDriverKeys(activeTab: ChartTab): Array<keyof SpeakerDriver> {
  if (activeTab === "spl") {
    return ["sensitivityDb", "fsHz", "qts", "qes", "qms", "vasL", "sdCm2", "reOhm", "leMh", "mmsG", "cmsMmN", "blTm", "xmaxMm", "peW"];
  }
  if (activeTab === "excursion") {
    return ["fsHz", "qts", "qes", "qms", "vasL", "sdCm2", "reOhm", "mmsG", "cmsMmN", "blTm", "xmaxMm"];
  }
  if (activeTab === "impedance") {
    return ["reOhm", "leMh", "fsHz", "qts", "qes", "qms", "mmsG", "cmsMmN", "blTm", "vasL", "sdCm2"];
  }
  if (activeTab === "port") {
    return ["fsHz", "qts", "qes", "qms", "vasL", "sdCm2"];
  }
  if (activeTab === "phase" || activeTab === "groupDelay" || activeTab === "impulse" || activeTab === "step") {
    return ["fsHz", "qts", "qes", "qms", "vasL", "sdCm2", "reOhm", "mmsG", "cmsMmN", "blTm"];
  }
  return ["fsHz", "qts", "qes", "qms", "vasL", "sdCm2", "reOhm", "leMh", "mmsG", "cmsMmN", "blTm"];
}

function chartUsesPower(activeTab: ChartTab): boolean {
  return activeTab === "spl" || activeTab === "excursion" || activeTab === "port";
}

function chartUsesCorrections(activeTab: ChartTab): boolean {
  return activeTab === "response" || activeTab === "spl";
}

function chartUsesPort(activeTab: ChartTab, design: BoxDesign): boolean {
  return (activeTab === "port" || activeTab === "response" || activeTab === "spl" || activeTab === "impedance") &&
    (design.kind === "vented" || design.kind === "passive" || design.kind === "bandpass" || design.kind === "aperiodic");
}

function aperiodicInputItems(design: BoxDesign, driver: SpeakerDriver, text: UiText): ChartInputItem[] {
  const mode = design.aperiodicMode ?? "ql";
  if (mode === "flow") {
    const material = design.aperiodicMaterial ?? "felt";
    const resistance = aperiodicResistanceSummary(design, driver, text);
    return [
      { label: text.aperiodicMode, value: text.aperiodicModes.flow },
      { label: text.aperiodicMaterial, value: text.aperiodicMaterials[material] },
      { label: text.aperiodicThickness, value: `${formatCompactNumber(design.aperiodicThicknessMm ?? 8)} mm` },
      { label: text.aperiodicFlowResistance, value: `${formatCompactNumber(design.flowResistivityPaSecM2 ?? defaultFlowResistivity(material))} Pa s/m²` },
      { label: text.aperiodicRa, value: resistance.value },
    ];
  }

  return [
    { label: text.aperiodicMode, value: text.aperiodicModes.ql },
    { label: text.aperiodicDamping, value: formatCompactNumber(design.ql ?? 1.7) },
  ];
}

function portInputItems(design: BoxDesign, driver: SpeakerDriver, text: UiText): ChartInputItem[] {
  if (design.kind === "passive") {
    const tuning = passiveRadiatorTuningSummary(design, driver);
    return [
      { label: text.passiveRadiatorSd, value: `${formatCompactNumber(design.passiveRadiatorSdCm2 ?? defaultPassiveRadiatorSdCm2(driver))} cm²` },
      { label: text.passiveRadiatorMms, value: `${formatCompactNumber(design.passiveRadiatorMmsG ?? defaultPassiveRadiatorMmsG(design, driver))} g` },
      { label: text.passiveRadiatorQms, value: formatCompactNumber(design.passiveRadiatorQms ?? design.ql ?? 9) },
      { label: text.passiveRadiatorXmax, value: `${formatCompactNumber(design.passiveRadiatorXmaxMm ?? defaultPassiveRadiatorXmaxMm(driver))} mm` },
      { label: text.passiveRadiatorCount, value: formatCompactNumber(design.passiveRadiatorCount ?? 1) },
      { label: text.passiveRadiatorTuning, value: tuning.value },
    ];
  }

  const isAperiodic = design.kind === "aperiodic";
  const countLabel = isAperiodic ? text.aperiodicVentCount : text.ports;
  const diameterLabel = isAperiodic ? text.aperiodicVentDiameter : text.portDiameter;
  const items = design.portShape === "slot"
    ? [
        { label: text.portWidth, value: `${formatCompactNumber(design.portWidthCm ?? 0)} cm` },
        { label: text.portHeight, value: `${formatCompactNumber(design.portHeightCm ?? 0)} cm` },
        { label: countLabel, value: formatCompactNumber(design.portCount ?? 1) },
      ]
    : [
        { label: diameterLabel, value: `${formatCompactNumber(design.portDiameterCm ?? (isAperiodic ? defaultAperiodicVentDiameterCm(driver) : 0))} cm` },
        { label: countLabel, value: formatCompactNumber(design.portCount ?? 1) },
      ];

  if (isAperiodic) {
    const summary = aperiodicVentSummary(design, driver, text);
    return [
      ...items,
      { label: text.aperiodicVentRatio, value: summary.value, note: summary.note, tone: summary.tone === "normal" ? undefined : "warning" },
    ];
  }

  return items;
}

function formatDriverInputValue(key: keyof SpeakerDriver, driver: SpeakerDriver): string {
  const field = driverFieldByKey.get(key);
  const value = driver[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }
  const unit = field?.unit ? ` ${field.unit}` : "";
  return `${formatCompactNumber(value)}${unit}`;
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  const absValue = Math.abs(value);
  const decimals = absValue < 1 ? 4 : absValue < 10 ? 3 : absValue < 100 ? 1 : 0;
  const formatted = value.toFixed(decimals);
  return formatted.includes(".")
    ? formatted.replace(/0+$/, "").replace(/\.$/, "")
    : formatted;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return `${formatCompactNumber(value * 100)}%`;
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
              <span>{`${text.optimizer.maxSpl} ${formatMaxSplShort(candidate.result.metrics, text)}`}</span>
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

function CalculationPassport({
  driver,
  powerW,
  result,
  splInputMode,
  stale,
  text,
}: {
  driver: SpeakerDriver;
  powerW: number;
  result?: SimulationResult;
  splInputMode: SplInputMode;
  stale: boolean;
  text: UiText;
}) {
  if (!result) {
    return (
      <section className="calculation-passport">
        <div className="mini-panel-head">
          <h3>{text.calculationPassport.title}</h3>
          <span>{text.calculationPassport.empty}</span>
        </div>
      </section>
    );
  }

  const driveInput = resolveDriveInput(driver, { powerW, splInputMode });
  const metrics = result.metrics;
  const translatedNotes = metrics.notes.map((note) => translateNote(note, text));
  const alignmentRows = compactRows([
    { label: text.design, value: displayDesignName(result.design.name, text) },
    { label: text.type, value: text.boxLabels[result.design.kind] },
    { label: text.table.vb, value: `${fmt(result.design.vbLiters, 1)} L` },
    { label: text.table.tune, value: formatTune(result, text) },
    metrics.qtc !== undefined ? { label: "Qtc", value: fmt(metrics.qtc, 2) } : undefined,
    metrics.fcHz !== undefined ? { label: "Fc", value: formatHz(metrics.fcHz) } : undefined,
    metrics.effectiveQ !== undefined ? { label: text.aperiodicEffectiveQ, value: fmt(metrics.effectiveQ, 2) } : undefined,
    metrics.impedancePeakReductionDb !== undefined
      ? { label: text.calculationPassport.labels.peakReduction, value: `${fmt(metrics.impedancePeakReductionDb, 1)} dB` }
      : undefined,
  ]);
  const driveRows = compactRows([
    { label: text.splInputMode, value: text.splInputModes[splInputMode] },
    { label: text.calculationPassport.labels.electricalPower, value: `${fmt(driveInput.electricalPowerW, 2)} W` },
    { label: text.calculationPassport.labels.voltage, value: `${fmt(driveInput.voltageRms, 2)} Vrms` },
    { label: "Re / Znom", value: `${fmt(driver.reOhm, 2)} / ${fmt(driveInput.nominalOhm, 0)} Ω` },
    driver.sensitivityDb !== undefined ? { label: "Sens.", value: `${fmt(driver.sensitivityDb, 1)} dB` } : undefined,
  ]);
  const limitRows = compactRows([
    { label: "F3 / F6", value: `${formatHz(metrics.f3Hz)} / ${formatHz(metrics.f6Hz)}` },
    { label: text.table.peak, value: `${fmt(metrics.peakDb, 1)} dB @ ${formatHz(metrics.peakHz)}` },
    { label: text.table.spl, value: `${fmt(metrics.spl50HzDb, 1)} / ${fmt(metrics.spl80HzDb, 1)} dB` },
    { label: text.table.maxSpl, value: formatMaxSpl(metrics, text), tone: metrics.maxUsableSplReason ? "warning" as const : undefined },
    { label: text.table.excursion, value: `${fmt(metrics.maxExcursionMm, 1)} mm @ ${formatHz(metrics.maxExcursionHz)}` },
    metrics.maxPassiveRadiatorExcursionMm !== undefined
      ? { label: text.passiveRadiatorExcursion, value: `${fmt(metrics.maxPassiveRadiatorExcursionMm, 1)} mm @ ${formatHz(metrics.maxPassiveRadiatorExcursionHz)}` }
      : undefined,
    metrics.maxPortMach !== undefined || metrics.maxPassiveRadiatorExcursionMm !== undefined
      ? { label: text.table.port, value: formatPort(result) }
      : undefined,
    { label: text.table.zmin, value: `${fmt(metrics.minImpedanceOhm, 1)} Ω` },
    metrics.impedancePeakOhm !== undefined
      ? { label: text.calculationPassport.labels.zPeak, value: `${fmt(metrics.impedancePeakOhm, 1)} Ω` }
      : undefined,
  ]);

  return (
    <section className="calculation-passport">
      <div className="mini-panel-head">
        <h3>{text.calculationPassport.title}</h3>
        <span>{displayDesignName(result.design.name, text)}</span>
      </div>
      {stale ? <div className="passport-stale">{text.calculationPassport.stale}</div> : null}
      <div className="passport-grid">
        <PassportGroup label={text.calculationPassport.groups.alignment} rows={alignmentRows} />
        <PassportGroup label={text.calculationPassport.groups.drive} rows={driveRows} />
        <PassportGroup label={text.calculationPassport.groups.limits} rows={limitRows} />
        <div className="passport-group warnings">
          <h4>{text.calculationPassport.groups.warnings}</h4>
          {translatedNotes.length > 0 ? (
            <div className="passport-note-list">
              {translatedNotes.slice(0, 5).map((note) => <span key={note}>{note}</span>)}
            </div>
          ) : (
            <div className="passport-row">
              <span>{text.warnings}</span>
              <strong>—</strong>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PassportGroup({
  label,
  rows,
}: {
  label: string;
  rows: Array<{ label: string; tone?: "warning"; value: string }>;
}) {
  return (
    <div className="passport-group">
      <h4>{label}</h4>
      {rows.map((row) => (
        <div className={`passport-row ${row.tone ?? ""}`} key={`${label}-${row.label}`}>
          <span>{row.label}</span>
          <strong>{row.value}</strong>
        </div>
      ))}
    </div>
  );
}

function compactRows<T>(rows: Array<T | undefined>): T[] {
  return rows.filter((row): row is T => row !== undefined);
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
            <th>{text.table.spl}</th>
            <th>{text.table.maxSpl}</th>
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
              <td>{formatTune(result, text, boxLabels)}</td>
              <td>
                {formatHz(result.metrics.f3Hz)} / {formatHz(result.metrics.f6Hz)}
              </td>
              <td>
                {fmt(result.metrics.peakDb, 1)} dB @ {formatHz(result.metrics.peakHz)}
              </td>
              <td>
                {fmt(result.metrics.spl50HzDb, 1)} / {fmt(result.metrics.spl80HzDb, 1)} dB
              </td>
              <td>{formatMaxSpl(result.metrics, text)}</td>
              <td>
                {fmt(result.metrics.groupDelay30Ms, 1)} / {fmt(result.metrics.groupDelay40Ms, 1)} ms
              </td>
              <td>
                {fmt(result.metrics.maxExcursionMm, 1)} mm @ {formatHz(result.metrics.maxExcursionHz)}
              </td>
              <td>
                {result.metrics.maxPortMach !== undefined || result.metrics.maxPassiveRadiatorExcursionMm !== undefined
                  ? formatPort(result)
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
  markers = [],
  xDomain,
  yDomain,
  xScale = "log",
  xLabel,
  yLabel,
  referenceLines = [],
  svgRef,
  xLimit,
  onXDomainChange,
  onXDomainReset,
  onYDomainChange,
  onYDomainReset,
}: {
  title: string;
  series: Series[];
  referenceLabel?: string;
  referenceSeries?: Series[];
  markers?: ChartMarker[];
  xDomain: [number, number];
  yDomain: [number, number];
  xScale?: ScaleMode;
  xLabel: string;
  yLabel: string;
  referenceLines?: Array<{ y: number; label: string }>;
  svgRef?: Ref<SVGSVGElement>;
  xLimit?: [number, number];
  onXDomainChange?: (domain: [number, number]) => void;
  onXDomainReset?: () => void;
  onYDomainChange?: (domain: [number, number]) => void;
  onYDomainReset?: () => void;
}) {
  const width = 960;
  const [chartHeight, setChartHeight] = useState(540);
  const height = chartHeight;
  const margin = { top: 20, right: 24, bottom: 62, left: 58 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const chartBoxRef = useRef<HTMLDivElement>(null);
  const svgElementRef = useRef<SVGSVGElement | null>(null);
  const panDragRef = useRef<{
    axis: "x" | "y";
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startDomain: [number, number];
  } | null>(null);
  const [hover, setHover] = useState<{
    svgX: number;
    svgY: number;
    xValue: number;
  } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const setSvgElementRef = useCallback((element: SVGSVGElement | null) => {
    svgElementRef.current = element;
    if (typeof svgRef === "function") {
      svgRef(element);
      return;
    }
    if (svgRef) {
      (svgRef as { current: SVGSVGElement | null }).current = element;
    }
  }, [svgRef]);

  useEffect(() => {
    const chartBox = chartBoxRef.current;
    if (!chartBox) {
      return undefined;
    }

    const updateChartHeight = () => {
      const chartStage = chartBox.parentElement;
      const renderedWidth = chartBox.getBoundingClientRect().width;
      const stageHeight = chartStage?.getBoundingClientRect().height ?? 0;
      if (renderedWidth <= 0 || stageHeight <= 0) {
        return;
      }

      const legendHeight = chartBox.querySelector(".legend")?.getBoundingClientRect().height ?? 28;
      const targetSvgHeight = clampNumber(stageHeight - legendHeight - 10, 320, 680);
      const nextHeight = Math.round(clampNumber((targetSvgHeight / renderedWidth) * width, 220, 960));
      setChartHeight((currentHeight) => (Math.abs(currentHeight - nextHeight) > 1 ? nextHeight : currentHeight));
    };

    updateChartHeight();

    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateChartHeight);
    observer?.observe(chartBox);
    if (chartBox.parentElement) {
      observer?.observe(chartBox.parentElement);
    }
    const legend = chartBox.querySelector(".legend");
    if (legend) {
      observer?.observe(legend);
    }
    window.addEventListener("resize", updateChartHeight);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateChartHeight);
    };
  }, [referenceSeries.length, series.length]);
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
  const domainToScaled = (value: number) =>
    xScale === "log" ? Math.log10(Math.max(0.001, value)) : value;
  const scaledToDomain = (value: number) =>
    xScale === "log" ? Math.pow(10, value) : value;
  const constrainedScaledDomain = (scaledMin: number, scaledMax: number): [number, number] => {
    const limit = xLimit ?? xDomain;
    const limitMin = domainToScaled(limit[0]);
    const limitMax = domainToScaled(limit[1]);
    const maxSpan = limitMax - limitMin;
    const minSpan = Math.min(maxSpan, xScale === "log" ? Math.log10(1.08) : 1);
    let span = clampNumber(scaledMax - scaledMin, minSpan, maxSpan);
    let min = scaledMin;
    let max = min + span;

    if (min < limitMin) {
      min = limitMin;
      max = min + span;
    }
    if (max > limitMax) {
      max = limitMax;
      min = max - span;
    }

    span = max - min;
    if (span < minSpan) {
      max = Math.min(limitMax, min + minSpan);
      min = Math.max(limitMin, max - minSpan);
    }

    return [min, max];
  };
  const emitScaledXDomain = (scaledMin: number, scaledMax: number) => {
    if (!onXDomainChange) {
      return;
    }
    const [nextMin, nextMax] = constrainedScaledDomain(scaledMin, scaledMax);
    onXDomainChange([scaledToDomain(nextMin), scaledToDomain(nextMax)]);
  };
  const pointerPositionFromSvg = (element: SVGSVGElement, clientX: number, clientY: number) => {
    const rect = element.getBoundingClientRect();
    return {
      svgX: ((clientX - rect.left) / Math.max(rect.width, 1)) * width,
      svgY: ((clientY - rect.top) / Math.max(rect.height, 1)) * height,
    };
  };
  const pointerPosition = (event: ReactPointerEvent<SVGSVGElement> | ReactMouseEvent<SVGSVGElement>) =>
    pointerPositionFromSvg(event.currentTarget, event.clientX, event.clientY);
  const pointerInPlot = (svgX: number, svgY: number) =>
    svgX >= margin.left &&
    svgX <= width - margin.right &&
    svgY >= margin.top &&
    svgY <= height - margin.bottom;
  const pointerInYAxis = (svgX: number, svgY: number) =>
    svgX >= 0 &&
    svgX <= margin.left + 16 &&
    svgY >= margin.top &&
    svgY <= height - margin.bottom;
  const constrainedYDomain = (nextMin: number, nextMax: number): [number, number] => {
    const minSpan = 0.001;
    const maxSpan = CHART_Y_LIMIT * 2;
    let span = clampNumber(nextMax - nextMin, minSpan, maxSpan);
    let min = nextMin;
    let max = min + span;

    if (min < -CHART_Y_LIMIT) {
      min = -CHART_Y_LIMIT;
      max = min + span;
    }
    if (max > CHART_Y_LIMIT) {
      max = CHART_Y_LIMIT;
      min = max - span;
    }

    span = max - min;
    if (span < minSpan) {
      max = Math.min(CHART_Y_LIMIT, min + minSpan);
      min = Math.max(-CHART_Y_LIMIT, max - minSpan);
    }

    return [min, max];
  };
  const emitYDomain = (nextMin: number, nextMax: number) => {
    if (!onYDomainChange) {
      return;
    }
    onYDomainChange(constrainedYDomain(nextMin, nextMax));
  };

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0) {
      return;
    }
    const { svgX, svgY } = pointerPosition(event);
    if (onYDomainChange && pointerInYAxis(svgX, svgY)) {
      event.preventDefault();
      panDragRef.current = {
        axis: "y",
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startDomain: yDomain,
      };
      setIsPanning(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (!onXDomainChange) {
      return;
    }
    if (!pointerInPlot(svgX, svgY)) {
      return;
    }

    event.preventDefault();
    panDragRef.current = {
      axis: "x",
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startDomain: xDomain,
    };
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = panDragRef.current;
    if (drag?.axis === "y" && onYDomainChange) {
      event.preventDefault();
      const deltaY = event.clientY - drag.startClientY;
      const shift = (deltaY / innerHeight) * (drag.startDomain[1] - drag.startDomain[0]);
      emitYDomain(drag.startDomain[0] + shift, drag.startDomain[1] + shift);
      return;
    }

    if (drag?.axis === "x" && onXDomainChange) {
      event.preventDefault();
      const deltaX = event.clientX - drag.startClientX;
      const shift = (deltaX / innerWidth) * (domainToScaled(drag.startDomain[1]) - domainToScaled(drag.startDomain[0]));
      emitScaledXDomain(domainToScaled(drag.startDomain[0]) - shift, domainToScaled(drag.startDomain[1]) - shift);
      return;
    }

    const { svgX, svgY } = pointerPosition(event);
    if (!pointerInPlot(svgX, svgY)) {
      setHover(null);
      return;
    }

    setHover({ svgX, svgY, xValue: unscaleX(svgX) });
  }

  function stopPanning(event: ReactPointerEvent<SVGSVGElement>) {
    if (panDragRef.current?.pointerId !== event.pointerId) {
      return;
    }
    panDragRef.current = null;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleChartWheel(
    currentTarget: SVGSVGElement,
    clientX: number,
    clientY: number,
    deltaY: number,
    preventDefault: () => void,
  ) {
    const { svgX, svgY } = pointerPositionFromSvg(currentTarget, clientX, clientY);
    if (onYDomainChange && pointerInYAxis(svgX, svgY)) {
      preventDefault();
      const anchorRatio = 1 - (svgY - margin.top) / innerHeight;
      const anchor = yDomain[0] + anchorRatio * (yDomain[1] - yDomain[0]);
      const zoomFactor = Math.exp(clampNumber(deltaY, -240, 240) * 0.002);
      emitYDomain(
        anchor - (anchor - yDomain[0]) * zoomFactor,
        anchor + (yDomain[1] - anchor) * zoomFactor,
      );
      return;
    }

    if (!onXDomainChange) {
      return;
    }
    if (!pointerInPlot(svgX, svgY)) {
      return;
    }

    preventDefault();
    const currentMin = domainToScaled(xDomain[0]);
    const currentMax = domainToScaled(xDomain[1]);
    const anchor = domainToScaled(unscaleX(svgX));
    const zoomFactor = Math.exp(clampNumber(deltaY, -240, 240) * 0.002);
    emitScaledXDomain(
      anchor - (anchor - currentMin) * zoomFactor,
      anchor + (currentMax - anchor) * zoomFactor,
    );
  }

  useEffect(() => {
    const svgElement = svgElementRef.current;
    if (!svgElement) {
      return undefined;
    }

    const handleNativeWheel = (event: WheelEvent) => {
      handleChartWheel(svgElement, event.clientX, event.clientY, event.deltaY, () => event.preventDefault());
    };

    svgElement.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => {
      svgElement.removeEventListener("wheel", handleNativeWheel);
    };
  });

  function handleDoubleClick(event: ReactMouseEvent<SVGSVGElement>) {
    const { svgX, svgY } = pointerPosition(event);
    if (onYDomainReset && pointerInYAxis(svgX, svgY)) {
      event.preventDefault();
      onYDomainReset();
      return;
    }

    if (!onXDomainReset) {
      return;
    }
    if (!pointerInPlot(svgX, svgY)) {
      return;
    }
    event.preventDefault();
    onXDomainReset();
  }

  // Derived at render so the readout tracks the current series when data changes under a resting cursor.
  const hoverValues = hover
    ? ([
        ...series.map((item) => ({ ...item, name: item.name })),
        ...referenceSeries.map((item) => ({ ...item, name: `${referenceLabel}: ${item.name}` })),
      ]
        .map((item) => {
          const point = nearestPoint(item.points, hover.xValue, xScale);
          return point &&
            Number.isFinite(point.x) &&
            Number.isFinite(point.y) &&
            point.x >= xDomain[0] &&
            point.x <= xDomain[1] &&
            point.y >= yDomain[0] &&
            point.y <= yDomain[1]
            ? { color: item.color, name: item.name, x: point.x, y: point.y }
            : null;
        })
        .filter(Boolean) as Array<{ color: string; name: string; x: number; y: number }>)
    : [];
  const tooltipValues = hoverValues.slice(0, 7);
  const tooltipWidth = 320;
  const tooltipHeight = 40 + tooltipValues.length * 20;
  const tooltipX = hover ? Math.min(width - tooltipWidth - 10, hover.svgX + 14) : 0;
  const tooltipY = hover ? Math.max(8, Math.min(height - tooltipHeight - 8, hover.svgY - 18)) : 0;

  return (
    <div className={`chart-box ${onXDomainChange || onYDomainChange ? "interactive" : ""} ${isPanning ? "panning" : ""}`} ref={chartBoxRef}>
      <svg
        ref={setSvgElementRef}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={title}
        onDoubleClick={handleDoubleClick}
        onPointerCancel={stopPanning}
        onPointerDown={handlePointerDown}
        onPointerLeave={() => {
          if (!panDragRef.current) {
            setHover(null);
          }
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={stopPanning}
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
            className={`series-line ${item.focused ? "focused" : ""} ${item.muted ? "muted" : ""} ${item.measurement ? "measurement" : ""}`}
            d={pathForSeries(item.points, scaleX, scaleY, xDomain, yDomain)}
            stroke={item.color}
          />
        ))}
        {markers
          .filter((marker) =>
            Number.isFinite(marker.x) &&
            Number.isFinite(marker.y) &&
            marker.x >= xDomain[0] &&
            marker.x <= xDomain[1] &&
            marker.y >= yDomain[0] &&
            marker.y <= yDomain[1],
          )
          .map((marker, index) => {
            const markerX = scaleX(marker.x);
            const markerY = scaleY(marker.y);
            const labelX = clampNumber(markerX + 8, margin.left + 14, width - margin.right - 22);
            const labelY = clampNumber(markerY - 8 - (index % 2) * 12, margin.top + 14, height - margin.bottom - 8);
            return (
              <g className="chart-marker" key={`${marker.label}-${marker.x}-${marker.y}-${index}`}>
                <line x1={markerX} x2={markerX} y1={markerY} y2={height - margin.bottom} />
                <circle cx={markerX} cy={markerY} r="5" fill={marker.color} />
                <text x={labelX} y={labelY}>
                  {marker.label}
                </text>
              </g>
            );
          })}
        <rect
          className="plot-hitbox"
          x={margin.left}
          y={margin.top}
          width={innerWidth}
          height={innerHeight}
        />
        {onYDomainChange ? (
          <rect
            className="y-axis-hitbox"
            x="0"
            y={margin.top}
            width={margin.left + 16}
            height={innerHeight}
          />
        ) : null}
        {hover ? (
          <g className="chart-cursor">
            <line x1={hover.svgX} x2={hover.svgX} y1={margin.top} y2={height - margin.bottom} />
            {tooltipValues.map((item, index) => (
              <circle
                key={`marker-${item.name}-${index}`}
                className="chart-cursor-point"
                cx={scaleX(item.x)}
                cy={scaleY(item.y)}
                r={5}
                fill={item.color}
              />
            ))}
            <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx="8" />
            <text x={tooltipX + 10} y={tooltipY + 20}>
              {formatAxisReadout(hover.xValue, xLabel)}
            </text>
            {tooltipValues.map((item, index) => (
              <g key={`${item.name}-${index}`}>
                <circle cx={tooltipX + 12} cy={tooltipY + 40 + index * 20} r="4" fill={item.color} />
                <text x={tooltipX + 22} y={tooltipY + 44 + index * 20}>
                  {`${shortenSeriesName(item.name)}: ${formatAxisReadout(item.y, yLabel)}`}
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
          <span className={`${item.focused ? "focused" : ""} ${item.muted ? "muted" : ""} ${item.measurement ? "measurement" : ""}`} key={item.name}>
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
  if (tab === "spl") {
    return ["spl"];
  }
  if (tab === "excursion") {
    return ["excursion"];
  }
  if (tab === "groupDelay") {
    return ["groupDelay"];
  }
  if (tab === "impulse") {
    return ["impulse"];
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

  return ["port", "excursion", "metrics"];
}

function createAnalysisSnapshot(
  driver: SpeakerDriver,
  designs: BoxDesign[],
  powerW: number,
  splInputMode: SplInputMode,
): AnalysisSnapshot {
  return { driver, designs, powerW, splInputMode };
}

function getChartProps(
  tab: ChartTab,
  results: SimulationResult[],
  driver: SpeakerDriver,
  focusedDesignId: string,
  text: UiText,
  powerW: number,
  splInputMode: SplInputMode,
  chartFrequencyDomain: [number, number],
  chartStepTimeDomain: [number, number],
  chartYDomain: [number, number] | undefined,
  measurementSeries: Series[] = [],
): Parameters<typeof LineChart>[0] {
  const base = {
    markers: chartMarkersForTab(tab, results, focusedDesignId, text),
    xDomain: chartFrequencyDomain,
    xLabel: text.axisLabels.frequency,
    xScale: "log" as ScaleMode,
    series: [] as Series[],
    referenceLines: [] as Array<{ y: number; label: string }>,
  };

  if (tab === "response") {
    const yDomain = chartYDomain ?? [-36, 9] as [number, number];
    return {
      ...base,
      title: text.chartTitles.response,
      yLabel: "dB",
      yDomain,
      referenceLines: visibleReferenceLines([
        { y: 0, label: "0 dB" },
        { y: -3, label: "-3" },
        { y: -6, label: "-6" },
      ], yDomain),
      series: [...toSeriesList(results, "responseDb", focusedDesignId, text), ...measurementSeries],
    };
  }
  if (tab === "spl") {
    const points = [
      ...results.flatMap((result) => result.splDb),
      ...measurementSeries.flatMap((series) => series.points),
    ];
    const domain = splDomain(points.map((point) => point.y));
    const yDomain = chartYDomain ?? domain;
    const driveInput = resolveDriveInput(driver, { powerW, splInputMode });
    const sensitivityLine = driver.sensitivityDb !== undefined
      ? driver.sensitivityDb + powerToDb(driveInput.electricalPowerW)
      : 85;
    return {
      ...base,
      title: text.chartTitles.spl,
      yLabel: "dB SPL",
      yDomain,
      referenceLines: visibleReferenceLines([
        { y: sensitivityLine, label: `${fmt(sensitivityLine, 1)} dB` },
        { y: 100, label: "100" },
      ], yDomain),
      series: [...toSeriesList(results, "splDb", focusedDesignId, text), ...measurementSeries],
    };
  }
  if (tab === "excursion") {
    const points = results.flatMap((result) => result.excursionMm);
    const max = Math.max(driver.xmaxMm ?? 0, ...points.map((point) => point.y), 1);
    const yDomain = chartYDomain ?? [0, niceCeil(max * 1.18)] as [number, number];
    return {
      ...base,
      title: text.chartTitles.excursion,
      yLabel: "mm",
      yDomain,
      referenceLines: visibleReferenceLines(driver.xmaxMm ? [{ y: driver.xmaxMm, label: "Xmax" }] : [], yDomain),
      series: toSeriesList(results, "excursionMm", focusedDesignId, text),
    };
  }
  if (tab === "groupDelay") {
    const points = results.flatMap((result) => result.groupDelayMs);
    const max = Math.max(...points.map((point) => point.y), 12);
    const yDomain = chartYDomain ?? [0, niceCeil(max * 1.12)] as [number, number];
    return {
      ...base,
      title: text.chartTitles.groupDelay,
      yLabel: "ms",
      yDomain,
      series: toSeriesList(results, "groupDelayMs", focusedDesignId, text),
    };
  }
  if (tab === "impulse") {
    const yDomain = chartYDomain ?? [-1.1, 1.1] as [number, number];
    return {
      ...base,
      title: text.chartTitles.impulse,
      yLabel: text.axisLabels.normalized,
      xLabel: text.axisLabels.time,
      xScale: "linear",
      xDomain: chartStepTimeDomain,
      yDomain,
      referenceLines: visibleReferenceLines([{ y: 0, label: "0" }], yDomain),
      series: toSeriesList(results, "impulse", focusedDesignId, text),
    };
  }
  if (tab === "step") {
    const yDomain = chartYDomain ?? [-1.1, 1.1] as [number, number];
    return {
      ...base,
      title: text.chartTitles.step,
      yLabel: text.axisLabels.normalized,
      xLabel: text.axisLabels.time,
      xScale: "linear",
      xDomain: chartStepTimeDomain,
      yDomain,
      referenceLines: visibleReferenceLines([{ y: 0, label: "0" }], yDomain),
      series: toSeriesList(results, "step", focusedDesignId, text),
    };
  }
  if (tab === "phase") {
    const points = results.flatMap((result) => result.phaseDeg);
    const domain = paddedDomain(points.map((point) => point.y), [-360, 90]);
    const yDomain = chartYDomain ?? domain;
    return {
      ...base,
      title: text.chartTitles.phase,
      yLabel: text.axisLabels.phase,
      yDomain,
      series: toSeriesList(results, "phaseDeg", focusedDesignId, text),
    };
  }
  if (tab === "impedance") {
    const points = [
      ...results.flatMap((result) => result.impedanceOhm),
      ...measurementSeries.flatMap((series) => series.points),
    ];
    const max = Math.max(...points.map((point) => point.y), driver.reOhm * 2);
    const yDomain = chartYDomain ?? [0, niceCeil(max * 1.1)] as [number, number];
    return {
      ...base,
      title: text.chartTitles.impedance,
      yLabel: "Ω",
      yDomain,
      series: [...toSeriesList(results, "impedanceOhm", focusedDesignId, text), ...measurementSeries],
    };
  }
  const focusedResult = results.find((result) => result.design.id === focusedDesignId) ?? results[0];
  const showPassiveRadiator = focusedResult?.design.kind === "passive";
  if (showPassiveRadiator) {
    const passiveResults = results.filter((result) => result.design.kind === "passive");
    const points = passiveResults.flatMap((result) => result.passiveRadiatorExcursionMm);
    const maxXmax = Math.max(...passiveResults.map((result) => result.design.passiveRadiatorXmaxMm ?? 0), 0);
    const max = Math.max(maxXmax, ...points.map((point) => point.y), 1);
    const yDomain = chartYDomain ?? [0, niceCeil(max * 1.15)] as [number, number];
    return {
      ...base,
      title: text.passiveRadiatorExcursion,
      yLabel: "mm",
      yDomain,
      referenceLines: visibleReferenceLines(maxXmax > 0 ? [{ y: maxXmax, label: "Xmax PR" }] : [], yDomain),
      series: toSeriesList(passiveResults, "passiveRadiatorExcursionMm", focusedDesignId, text),
    };
  }

  const ventedResults = results.filter((result) => result.design.kind === "vented");
  const points = ventedResults.flatMap((result) => result.portMach);
  const max = Math.max(...points.map((point) => point.y), 0.18);
  const yDomain = chartYDomain ?? [0, Math.max(0.2, niceCeil(max * 1.15))] as [number, number];
  return {
    ...base,
    title: text.chartTitles.port,
    yLabel: "Mach",
    yDomain,
    referenceLines: visibleReferenceLines([
      { y: 0.1, label: "0.10" },
      { y: 0.16, label: "0.16" },
    ], yDomain),
    series: toSeriesList(ventedResults, "portMach", focusedDesignId, text),
  };
}

function visibleReferenceLines(
  lines: Array<{ y: number; label: string }>,
  yDomain: [number, number],
): Array<{ y: number; label: string }> {
  return lines.filter((line) => line.y >= yDomain[0] && line.y <= yDomain[1]);
}

function chartMarkersForTab(
  tab: ChartTab,
  results: SimulationResult[],
  focusedDesignId: string,
  text: UiText,
): ChartMarker[] {
  const result = results.find((item) => item.design.id === focusedDesignId) ?? results[0];
  if (!result) {
    return [];
  }

  const color = result.design.color;
  const markers: Array<ChartMarker | undefined> = [];
  const addFb = (points: Point[]) => {
    if (result.design.fbHz) {
      markers.push(pointMarker(points, result.design.fbHz, text.chartMarkers.fb, color));
    }
  };

  if (tab === "response") {
    const f3Hz = cutoffFrequency(result.responseDb, -3);
    const f6Hz = cutoffFrequency(result.responseDb, -6);
    const peak = extremumPoint(result.responseDb, "max");
    if (f3Hz) {
      markers.push({ color, label: text.chartMarkers.f3, x: f3Hz, y: -3 });
    }
    if (f6Hz) {
      markers.push({ color, label: text.chartMarkers.f6, x: f6Hz, y: -6 });
    }
    if (peak) {
      markers.push({ ...peak, color, label: text.chartMarkers.peak });
    }
    addFb(result.responseDb);
  } else if (tab === "spl") {
    const peak = extremumPoint(result.splDb, "max");
    const f3Hz = peak ? cutoffFrequency(result.splDb, peak.y - 3) : undefined;
    const f6Hz = peak ? cutoffFrequency(result.splDb, peak.y - 6) : undefined;
    if (f3Hz) {
      markers.push(pointMarker(result.splDb, f3Hz, text.chartMarkers.f3, color));
    }
    if (f6Hz) {
      markers.push(pointMarker(result.splDb, f6Hz, text.chartMarkers.f6, color));
    }
    if (peak) {
      markers.push({ ...peak, color, label: text.chartMarkers.maxSpl });
    }
    addFb(result.splDb);
  } else if (tab === "excursion") {
    const maxExcursion = extremumPoint(result.excursionMm, "max");
    if (maxExcursion) {
      markers.push({ ...maxExcursion, color, label: text.chartMarkers.maxExcursion });
    }
    addFb(result.excursionMm);
  } else if (tab === "groupDelay") {
    if (result.metrics.f3Hz && result.metrics.groupDelayAtF3Ms !== undefined) {
      markers.push({
        color,
        label: text.chartMarkers.f3,
        x: result.metrics.f3Hz,
        y: result.metrics.groupDelayAtF3Ms,
      });
    }
    addFb(result.groupDelayMs);
  } else if (tab === "phase") {
    addFb(result.phaseDeg);
  } else if (tab === "impedance") {
    const minZ = extremumPoint(result.impedanceOhm, "min");
    if (minZ) {
      markers.push({ ...minZ, color, label: text.chartMarkers.minZ });
    }
  } else if (tab === "port") {
    if (result.design.kind === "passive") {
      const maxPassiveRadiator = extremumPoint(result.passiveRadiatorExcursionMm, "max");
      if (maxPassiveRadiator) {
        markers.push({ ...maxPassiveRadiator, color, label: text.chartMarkers.maxExcursion });
      }
      if (result.metrics.passiveRadiatorTuningHz) {
        markers.push(pointMarker(result.passiveRadiatorExcursionMm, result.metrics.passiveRadiatorTuningHz, text.chartMarkers.fb, color));
      }
    } else {
      const maxPort = result.design.kind === "vented" ? extremumPoint(result.portMach, "max") : undefined;
      if (maxPort) {
        markers.push({ ...maxPort, color, label: text.chartMarkers.maxPort });
      }
      addFb(result.portMach);
    }
  }

  return markers.filter(Boolean) as ChartMarker[];
}

function pointMarker(points: Point[], x: number, label: string, color: string): ChartMarker | undefined {
  const point = nearestPoint(points, x, "log");
  return point ? { color, label, x: point.x, y: point.y } : undefined;
}

function cutoffFrequency(points: Point[], targetY: number): number | undefined {
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const crossesTarget =
      (previous.y <= targetY && current.y >= targetY) ||
      (previous.y >= targetY && current.y <= targetY);
    if (
      Number.isFinite(previous.x) &&
      Number.isFinite(previous.y) &&
      Number.isFinite(current.x) &&
      Number.isFinite(current.y) &&
      crossesTarget
    ) {
      const ratio = (targetY - previous.y) / (current.y - previous.y || 1);
      return previous.x + ratio * (current.x - previous.x);
    }
  }
  return undefined;
}

function extremumPoint(points: Point[], mode: "min" | "max"): Point | undefined {
  const validPoints = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (validPoints.length === 0) {
    return undefined;
  }

  return validPoints.reduce((best, point) => {
    if (mode === "max") {
      return point.y > best.y ? point : best;
    }
    return point.y < best.y ? point : best;
  }, validPoints[0]);
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

  const portResonance = note.match(/^Low port resonance: ([\d.]+) Hz$/);
  if (portResonance) {
    return text.notes.portResonanceLow(portResonance[1]);
  }

  const powerExceeded = note.match(/^Power exceeds Pe: ([\d.]+) W$/);
  if (powerExceeded) {
    return text.notes.powerExceeded(powerExceeded[1]);
  }

  const maxSplXmax = note.match(/^Max SPL limited by Xmax at ([\d.]+) Hz$/);
  if (maxSplXmax) {
    return text.notes.maxSplLimitedByXmax(maxSplXmax[1]);
  }

  const maxSplPort = note.match(/^Max SPL limited by port at ([\d.]+) Hz$/);
  if (maxSplPort) {
    return text.notes.maxSplLimitedByPort(maxSplPort[1]);
  }

  const maxSplPassive = note.match(/^Max SPL limited by passive radiator at ([\d.]+) Hz$/);
  if (maxSplPassive) {
    return text.notes.maxSplLimitedByPassive(maxSplPassive[1]);
  }

  const maxSplPe = note.match(/^Max SPL limited by Pe at ([\d.]+) Hz$/);
  if (maxSplPe) {
    return text.notes.maxSplLimitedByPe(maxSplPe[1]);
  }

  const passiveXmax = note.match(/^Passive radiator Xmax exceeded at ([\d.]+) Hz$/);
  if (passiveXmax) {
    return text.notes.passiveXmaxExceeded(passiveXmax[1]);
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
  if (note === "Bandpass models low-frequency band only") {
    return text.notes.bandpassApproximate;
  }

  return note;
}

function formatTune(
  result: SimulationResult,
  text: UiText,
  boxLabels: Record<BoxKind, string> = text.boxLabels,
): string {
  if (result.design.kind === "passive" && result.metrics.passiveRadiatorTuningHz !== undefined) {
    return `${text.passiveRadiatorTuning} ${fmt(result.metrics.passiveRadiatorTuningHz, 1)} Hz`;
  }
  if (result.design.fbHz) {
    return `Fb ${fmt(result.design.fbHz, 1)} Hz`;
  }
  if (result.design.kind === "aperiodic") {
    const qeff = result.metrics.effectiveQ !== undefined
      ? `${text.aperiodicEffectiveQ} ${fmt(result.metrics.effectiveQ, 2)}`
      : text.boxLabels.aperiodic;
    const reduction = result.metrics.impedancePeakReductionDb !== undefined
      ? ` / ${text.aperiodicPeakReduction} ${fmt(result.metrics.impedancePeakReductionDb, 1)} dB`
      : "";
    return `${qeff}${reduction}`;
  }
  if (result.metrics.qtc) {
    return `Qtc ${fmt(result.metrics.qtc, 2)}`;
  }

  return boxLabels[result.design.kind];
}

function formatPort(result: SimulationResult): string {
  if (result.design.kind === "passive" && result.metrics.maxPassiveRadiatorExcursionMm !== undefined) {
    const tuning = result.metrics.passiveRadiatorTuningHz !== undefined
      ? ` / ${fmt(result.metrics.passiveRadiatorTuningHz, 1)} Hz`
      : "";
    return `PR ${fmt(result.metrics.maxPassiveRadiatorExcursionMm, 1)} mm${tuning}`;
  }

  if (result.metrics.maxPortMach === undefined) {
    return "—";
  }

  const resonance = result.metrics.portResonanceHz ? ` / ${fmt(result.metrics.portResonanceHz, 0)} Hz` : "";
  return `M ${fmt(result.metrics.maxPortMach, 2)} / ${fmt(result.metrics.portLengthCm, 1)} cm${resonance}`;
}

function formatMaxSpl(metrics: SimulationResult["metrics"], text: UiText): string {
  if (metrics.maxUsableSplDb === undefined) {
    return "—";
  }

  const reason = metrics.maxUsableSplReason
    ? ` / ${text.limitReasons[metrics.maxUsableSplReason]}`
    : "";
  return `${fmt(metrics.maxUsableSplDb, 1)} dB @ ${formatHz(metrics.maxUsableSplHz)}${reason}`;
}

function formatMaxSplShort(metrics: SimulationResult["metrics"], text: UiText): string {
  if (metrics.maxUsableSplDb === undefined) {
    return "—";
  }

  const reason = metrics.maxUsableSplReason
    ? ` ${text.limitReasons[metrics.maxUsableSplReason]}`
    : "";
  return `${fmt(metrics.maxUsableSplDb, 1)} dB${reason}`;
}

function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll(".plot-hitbox, .y-axis-hitbox, .chart-cursor").forEach((node) => node.remove());
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", "960");
  clone.setAttribute("height", "390");
  clone.insertBefore(createSvgStyleElement(), clone.firstChild);
  clone.insertBefore(createSvgBackgroundElement(), clone.firstChild);
  return new XMLSerializer().serializeToString(clone);
}

function createSvgBackgroundElement(): SVGRectElement {
  const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  background.setAttribute("class", "export-bg");
  background.setAttribute("x", "0");
  background.setAttribute("y", "0");
  background.setAttribute("width", "960");
  background.setAttribute("height", "390");
  return background;
}

function createSvgStyleElement(): SVGStyleElement {
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `
    .export-bg { fill: #ffffff; }
    .plot-bg { fill: #fbfcfd; }
    .grid-line { stroke: #e4e9ef; stroke-width: 1; }
    .axis-line { stroke: #7b8797; stroke-width: 1.2; }
    .axis-text, .axis-label, .reference-text {
      fill: #66758a;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 12px;
    }
    .axis-label { font-weight: 700; }
    .reference-line { stroke: #a2adbb; stroke-dasharray: 5 5; stroke-width: 1.1; }
    .series-line {
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 2.4;
    }
    .reference-series-line {
      opacity: 0.48;
      stroke-dasharray: 7 7;
      stroke-width: 1.8;
    }
    .series-line.focused { stroke-width: 4.4; }
    .series-line.muted { opacity: 0.28; stroke-width: 1.8; }
    .series-line.measurement { stroke-dasharray: 4 5; stroke-width: 2; }
  `;
  return style;
}

function filterDrivers(drivers: SpeakerDriver[], filters: LibraryFilters): SpeakerDriver[] {
  const query = filters.query.trim().toLowerCase();
  return drivers.filter((driver) => {
    if (query && !driver.name.toLowerCase().includes(query)) {
      return false;
    }
    if (filters.status !== "all" && driverStatus(driver) !== filters.status) {
      return false;
    }
    if (filters.maxFsHz !== undefined && driver.fsHz > filters.maxFsHz) {
      return false;
    }
    if (filters.maxQts !== undefined && driver.qts > filters.maxQts) {
      return false;
    }
    if (filters.maxVasL !== undefined && driver.vasL > filters.maxVasL) {
      return false;
    }
    if (filters.minSdCm2 !== undefined && driver.sdCm2 < filters.minSdCm2) {
      return false;
    }
    if (filters.minXmaxMm !== undefined && (driver.xmaxMm ?? 0) < filters.minXmaxMm) {
      return false;
    }
    return true;
  });
}

function driverStatus(driver: SpeakerDriver): DriverFilterStatus {
  if (driver.source?.modified) {
    return "modified";
  }
  if (driver.source?.verified) {
    return "verified";
  }
  return "user";
}

function applyAcousticOptionsToResults(
  results: SimulationResult[],
  options: AcousticOptions,
): SimulationResult[] {
  if (options.roomGainDb === 0 && options.baffleStepDb === 0) {
    return results;
  }
  return results.map((result) => ({
    ...result,
    responseDb: applyAcousticOptionsToPoints(result.responseDb, options, false),
    splDb: applyAcousticOptionsToPoints(result.splDb, options, true),
  }));
}

function applyAcousticOptionsToPoints(points: Point[], options: AcousticOptions, absolute: boolean): Point[] {
  if (points.length === 0) {
    return points;
  }
  const adjusted = points.map((point) => ({
    x: point.x,
    y: point.y + acousticCorrectionDb(point.x, options),
  }));
  if (absolute) {
    return adjusted;
  }
  const reference = pointValueAt(adjusted, 200) ?? adjusted[adjusted.length - 1]?.y ?? 0;
  return adjusted.map((point) => ({ ...point, y: point.y - reference }));
}

function pointValueAt(points: Point[], x: number): number | undefined {
  if (points.length === 0) {
    return undefined;
  }
  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1];
    const right = points[index];
    if (left.x <= x && right.x >= x) {
      const ratio = (x - left.x) / Math.max(0.000001, right.x - left.x);
      return left.y + (right.y - left.y) * ratio;
    }
  }
  return points[points.length - 1].y;
}

function acousticCorrectionDb(frequency: number, options: AcousticOptions): number {
  const roomStart = Math.max(10, options.roomGainStartHz);
  const roomGain = frequency < roomStart
    ? options.roomGainDb * (1 - Math.log10(Math.max(10, frequency)) / Math.log10(roomStart))
    : 0;
  const baffleHz = Math.max(20, options.baffleStepHz);
  const baffle = options.baffleStepDb > 0
    ? -options.baffleStepDb / (1 + Math.pow(baffleHz / Math.max(1, frequency), 2))
    : 0;
  return roomGain + baffle;
}

function sealedAlignmentKey(qtc: number): "bessel" | "butterworth" | "chebyshev" | "critical" | "peaked" {
  if (qtc < 0.54) {
    return "critical";
  }
  if (qtc < 0.65) {
    return "bessel";
  }
  if (qtc < 0.8) {
    return "butterworth";
  }
  if (qtc <= 1.15) {
    return "chebyshev";
  }
  return "peaked";
}

function measurementKindToDefaultTab(kind: MeasurementTraceKind): ChartTab {
  return kind === "zma" ? "impedance" : "response";
}

function measurementVisibleOnTab(measurement: MeasurementTrace, tab: ChartTab): boolean {
  if (measurement.kind === "zma") {
    return tab === "impedance";
  }
  return tab === "response" || tab === "spl";
}

function measurementPointsForTab(measurement: MeasurementTrace, tab: ChartTab): Point[] {
  if (measurement.kind === "frd" && tab === "response") {
    return normalizeFrdResponsePoints(measurement.points);
  }
  if (measurement.kind === "frd" && tab === "spl" && measurement.offsetDb !== 0) {
    return measurement.points.map((point) => ({ ...point, y: point.y + measurement.offsetDb }));
  }
  return measurement.points;
}

function measurementSeriesName(measurement: MeasurementTrace, tab: ChartTab): string {
  if (measurement.kind === "frd" && tab === "response") {
    return `${measurement.name} · norm`;
  }
  if (measurement.kind === "frd" && tab === "spl" && measurement.offsetDb !== 0) {
    return `${measurement.name} ${measurement.offsetDb > 0 ? "+" : ""}${fmt(measurement.offsetDb, 1)} dB`;
  }
  return measurement.name;
}

function normalizeFrdResponsePoints(points: Point[]): Point[] {
  const referenceValues = points
    .filter((point) => point.x >= 120 && point.x <= 260 && Number.isFinite(point.y))
    .map((point) => point.y)
    .sort((left, right) => left - right);
  const fallbackValues = points
    .map((point) => point.y)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  const values = referenceValues.length > 0 ? referenceValues : fallbackValues;
  const referenceDb = values.length > 0 ? values[Math.floor(values.length / 2)] : 0;
  return points.map((point) => ({ ...point, y: point.y - referenceDb }));
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
  if (label.includes("Hz") || label.includes("Гц")) {
    const unit = label.includes("Гц") ? "Гц" : "Hz";
    return `${fmt(value, value < 100 ? 1 : 0)} ${unit}`;
  }
  if (label.includes("ms") || label.includes("мс")) {
    const unit = label.includes("мс") ? "мс" : "ms";
    return `${fmt(value, 1)} ${unit}`;
  }
  if (label === "dB") {
    return `${fmt(value, 1)} dB`;
  }
  if (label === "dB SPL") {
    return `${fmt(value, 1)} dB SPL`;
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
  if (label === "deg" || label === "°") {
    return `${fmt(value, 1)}°`;
  }

  return fmt(value, 3);
}

function shortenSeriesName(name: string): string {
  return name.length > 34 ? `${name.slice(0, 31)}...` : name;
}

function pathForSeries(
  points: Point[],
  scaleX: (x: number) => number,
  scaleY: (y: number) => number,
  xDomain: [number, number],
  yDomain: [number, number],
): string {
  let path = "";
  let lastDrawnPoint: Point | null = null;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (
      !Number.isFinite(previous.x) ||
      !Number.isFinite(previous.y) ||
      !Number.isFinite(current.x) ||
      !Number.isFinite(current.y)
    ) {
      lastDrawnPoint = null;
      continue;
    }

    const segment = clipSegmentToDomain(previous, current, xDomain, yDomain);
    if (!segment) {
      lastDrawnPoint = null;
      continue;
    }

    const [start, end] = segment;
    if (!lastDrawnPoint || !samePoint(lastDrawnPoint, start)) {
      path += ` M ${scaleX(start.x).toFixed(2)} ${scaleY(start.y).toFixed(2)}`;
    }
    path += ` L ${scaleX(end.x).toFixed(2)} ${scaleY(end.y).toFixed(2)}`;
    lastDrawnPoint = end;
  }

  return path.trim();
}

function clipSegmentToDomain(
  start: Point,
  end: Point,
  xDomain: [number, number],
  yDomain: [number, number],
): [Point, Point] | null {
  // Clip segments to the plot rectangle so hidden data does not draw along an edge.
  const [xMin, xMax] = xDomain;
  const [yMin, yMax] = yDomain;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let t0 = 0;
  let t1 = 1;

  const clip = (p: number, q: number) => {
    if (p === 0) {
      return q >= 0;
    }
    const ratio = q / p;
    if (p < 0) {
      if (ratio > t1) {
        return false;
      }
      if (ratio > t0) {
        t0 = ratio;
      }
      return true;
    }
    if (ratio < t0) {
      return false;
    }
    if (ratio < t1) {
      t1 = ratio;
    }
    return true;
  };

  if (
    !clip(-dx, start.x - xMin) ||
    !clip(dx, xMax - start.x) ||
    !clip(-dy, start.y - yMin) ||
    !clip(dy, yMax - start.y)
  ) {
    return null;
  }

  return [
    { x: start.x + t0 * dx, y: start.y + t0 * dy },
    { x: start.x + t1 * dx, y: start.y + t1 * dy },
  ];
}

function samePoint(left: Point, right: Point): boolean {
  return Math.abs(left.x - right.x) < 1e-9 && Math.abs(left.y - right.y) < 1e-9;
}

function createProjectFile(state: ProjectState): ProjectFile {
  return {
    ...state,
    version: 1,
  };
}

function createReportHtml({
  acousticOptions,
  chartSvg,
  driver,
  language,
  measurements,
  powerW,
  splInputMode,
  results,
  text,
  title,
  warnings,
}: {
  acousticOptions: AcousticOptions;
  chartSvg: string;
  driver: SpeakerDriver;
  language: Language;
  measurements: MeasurementTrace[];
  powerW: number;
  splInputMode: SplInputMode;
  results: SimulationResult[];
  text: UiText;
  title: string;
  warnings: string[];
}): string {
  const rows = results.map((result) => `
    <tr>
      <td>${escapeHtml(displayDesignName(result.design.name, text))}</td>
      <td>${fmt(result.design.vbLiters, 1)} L</td>
      <td>${formatTune(result, text)}</td>
      <td>${formatHz(result.metrics.f3Hz)} / ${formatHz(result.metrics.f6Hz)}</td>
      <td>${fmt(result.metrics.peakDb, 1)} dB</td>
      <td>${formatMaxSpl(result.metrics, text)}</td>
      <td>${formatPort(result)}</td>
    </tr>
  `).join("");
  const warningItems = warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");
  const source = driver.source?.url
    ? `<a href="${escapeHtml(driver.source.url)}">${escapeHtml(driver.source.title)}</a>`
    : escapeHtml(driver.source?.title ?? text.driverSource.sourceUnknown);
  const driveInput = resolveDriveInput(driver, { powerW, splInputMode });
  return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(text.appTitle)} - ${escapeHtml(displayDriverName(driver, text))}</title>
  <style>
    body { margin: 32px; color: #18212f; font: 14px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    h1, h2 { margin: 0 0 10px; }
    section { margin-top: 22px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #d8e0ea; padding: 8px; text-align: left; }
    th { background: #f3f6f9; }
    .chart svg { max-width: 100%; height: auto; }
    .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 18px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(text.appTitle)}</h1>
  <div class="meta">
    <div><strong>${escapeHtml(text.model)}:</strong> ${escapeHtml(displayDriverName(driver, text))}</div>
    <div><strong>${escapeHtml(text.driverSource.title)}:</strong> ${source}</div>
    <div><strong>${escapeHtml(text.splInputMode)}:</strong> ${escapeHtml(text.splInputModes[splInputMode])}</div>
    <div><strong>${escapeHtml(text.power)}:</strong> ${fmt(driveInput.electricalPowerW, 2)} W / ${fmt(driveInput.voltageRms, 2)} Vrms</div>
    <div><strong>${escapeHtml(text.corrections.title)}:</strong> ${escapeHtml(text.corrections.roomGain)} ${fmt(acousticOptions.roomGainDb, 1)} dB, ${escapeHtml(text.corrections.baffleStep)} ${fmt(acousticOptions.baffleStepDb, 1)} dB</div>
    <div><strong>${escapeHtml(text.measurements.title)}:</strong> ${measurements.length}</div>
  </div>
  <section class="chart">${chartSvg}</section>
  <section>
    <h2>${escapeHtml(text.metrics)}</h2>
    <table>
      <thead><tr><th>${escapeHtml(text.table.design)}</th><th>${escapeHtml(text.table.vb)}</th><th>${escapeHtml(text.table.tune)}</th><th>F3 / F6</th><th>${escapeHtml(text.table.peak)}</th><th>${escapeHtml(text.table.maxSpl)}</th><th>${escapeHtml(text.table.port)}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>
  ${warnings.length ? `<section><h2>${escapeHtml(text.warnings)}</h2><ul>${warningItems}</ul></section>` : ""}
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function analyzeDriver(driver: SpeakerDriver): DriverProfile {
  const issues = new Set<DriverIssue>();
  const fieldIssues: Partial<Record<keyof SpeakerDriver, DriverIssue[]>> = {};
  const addIssue = (issue: DriverIssue, fields: Array<keyof SpeakerDriver> = []) => {
    issues.add(issue);
    fields.forEach((field) => {
      fieldIssues[field] = [...(fieldIssues[field] ?? []), issue];
    });
  };

  driverFields.forEach((field) => {
    const value = driver[field.key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      if (requiredDriverNumberFields.has(field.key)) {
        addIssue("invalidRequired", [field.key]);
      }
      return;
    }
    if (value < field.min || (field.max !== undefined && value > field.max)) {
      addIssue("fieldOutOfRange", [field.key]);
    }
  });

  const invalidRequiredFields = Array.from(requiredDriverNumberFields).filter((field) => {
    const value = driver[field];
    return typeof value !== "number" || !Number.isFinite(value) || value <= 0;
  });
  if (invalidRequiredFields.length > 0) {
    addIssue("invalidRequired", invalidRequiredFields);
  }
  if (driver.qts < 0.18) {
    addIssue("qtsLow", ["qts"]);
  }
  if (driver.qts > 0.7) {
    addIssue("qtsHigh", ["qts"]);
  }
  if (driver.qes !== undefined && driver.qes <= driver.qts) {
    addIssue("qesNotAboveQts", ["qes", "qts"]);
  }
  if (driver.qms !== undefined && driver.qms <= driver.qts) {
    addIssue("qmsNotAboveQts", ["qms", "qts"]);
  }
  if (driver.xmaxMm !== undefined && driver.xmaxMm <= 0) {
    addIssue("xmaxInvalid", ["xmaxMm"]);
  }
  if (driver.peW !== undefined && driver.peW <= 0) {
    addIssue("powerInvalid", ["peW"]);
  }
  if (driver.qes !== undefined && driver.qms !== undefined && driver.qes > 0 && driver.qms > 0) {
    const expectedQts = (driver.qes * driver.qms) / (driver.qes + driver.qms);
    if (Math.abs(expectedQts - driver.qts) / Math.max(0.01, driver.qts) > 0.08) {
      addIssue("qtsFormulaMismatch", ["qts", "qes", "qms"]);
    }
  }
  if (driver.mmsG !== undefined && driver.mmsG > 0 && driver.sdCm2 > 0 && driver.vasL > 0) {
    const expectedFs = deriveMechanicalField(driver, "fsHz");
    if (expectedFs !== undefined && Math.abs(expectedFs - driver.fsHz) / Math.max(1, driver.fsHz) > 0.18) {
      addIssue("fsMmsVasMismatch", ["fsHz", "mmsG", "vasL", "sdCm2", ...(driver.cmsMmN !== undefined ? ["cmsMmN" as const] : [])]);
    }
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
    fieldIssues,
    issues: Array.from(issues),
    recommendation,
  };
}

function driverFormulaChain({
  lastManualField,
  mechanicalDerivedField,
  motorDerivedField,
  qualityDerivedField,
  text,
}: {
  lastManualField?: keyof SpeakerDriver;
  mechanicalDerivedField?: MechanicalDerivedField;
  motorDerivedField?: MotorDerivedField;
  qualityDerivedField?: QualityDerivedField;
  text: UiText;
}): string[] {
  const chain: string[] = [];
  const pushField = (field?: keyof SpeakerDriver) => {
    const label = field !== undefined ? driverFieldByKey.get(field)?.label : undefined;
    if (label !== undefined && chain[chain.length - 1] !== label) {
      chain.push(label);
    }
  };
  pushField(lastManualField);
  pushField(mechanicalDerivedField);

  if (motorDerivedField === "qes") {
    pushField(motorDerivedField);
    if (qualityDerivedField !== "qes") {
      pushField(qualityDerivedField);
    }
  } else {
    pushField(qualityDerivedField);
    pushField(motorDerivedField);
  }

  if (chain.length > 0) {
    chain.push(text.driverRelations.graphs);
  }
  return chain;
}

function driverFormulaPromptChain(
  changedFields: ReadonlyArray<keyof SpeakerDriver>,
  sourceField: keyof SpeakerDriver,
  candidateField: keyof SpeakerDriver,
): string {
  const sourceIndex = changedFields.indexOf(sourceField);
  const chainFields = sourceIndex >= 0
    ? changedFields.slice(0, sourceIndex + 1)
    : [sourceField];
  return [...chainFields, candidateField]
    .filter((field, index, fields) => index === 0 || field !== fields[index - 1])
    .map((field) => driverFieldByKey.get(field)?.label ?? String(field))
    .join(" -> ");
}

function driverActiveFormulaLabels({
  mechanicalDerivedField,
  motorDerivedField,
  qualityDerivedField,
  text,
}: {
  mechanicalDerivedField?: MechanicalDerivedField;
  motorDerivedField?: MotorDerivedField;
  qualityDerivedField?: QualityDerivedField;
  text: UiText;
}): string[] {
  const labels: string[] = [];
  if (mechanicalDerivedField !== undefined) {
    labels.push(`${driverFieldByKey.get(mechanicalDerivedField)?.label ?? mechanicalDerivedField}: ${text.driverRelations.formulas.mechanical}`);
  }
  if (qualityDerivedField !== undefined) {
    labels.push(`${driverFieldByKey.get(qualityDerivedField)?.label ?? qualityDerivedField}: ${text.driverRelations.formulas.quality}`);
  }
  if (motorDerivedField !== undefined) {
    labels.push(`${driverFieldByKey.get(motorDerivedField)?.label ?? motorDerivedField}: ${
      driverMotorFormulaLabel(motorDerivedField, text)
    }`);
  }
  return labels;
}

function driverMotorFormulaLabel(field: MotorDerivedField, text: UiText): string {
  if (field === "blTm") {
    return text.driverRelations.formulas.motorBl;
  }
  if (field === "fsHz") {
    return text.driverRelations.formulas.motorFs;
  }
  if (field === "reOhm") {
    return text.driverRelations.formulas.motorRe;
  }
  return text.driverRelations.formulas.motorQes;
}

function driverFormulaMismatches(driver: SpeakerDriver): Array<{ errorRatio: number; label: string }> {
  const mismatches: Array<{ errorRatio: number; label: string }> = [];
  const addMismatch = (label: string, actual?: number, expected?: number) => {
    if (actual === undefined || expected === undefined || actual <= 0 || expected <= 0) {
      return;
    }
    const errorRatio = Math.abs(actual - expected) / Math.max(Math.abs(actual), Math.abs(expected), 1e-9);
    if (errorRatio >= 0.02) {
      mismatches.push({ errorRatio, label });
    }
  };

  addMismatch("Qts", positiveNumber(driver.qts), deriveQualityField(driver, "qts"));
  addMismatch("Fs", positiveNumber(driver.fsHz), deriveMechanicalField(driver, "fsHz"));
  addMismatch("BL", positiveNumber(driver.blTm), deriveMotorField(driver, "blTm"));
  addMismatch("Qes", positiveNumber(driver.qes), deriveMotorField(driver, "qes"));

  return mismatches.length > 0
    ? mismatches
    : [];
}

function loadProjectState(): ProjectLoadState {
  const sharedProject = parseProjectShareHash(window.location.hash);
  if (sharedProject) {
    return { project: sharedProject, source: "share" };
  }

  try {
    const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
    if (raw) {
      const project = parseProjectFile(raw);
      if (project) {
        return { project, source: "storage" };
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
    project: defaultProjectState(drivers, selectedDriver, designs, focusedDesignId),
    source: "default",
  };
}

async function createProjectShareUrl(project: ProjectFile): Promise<string> {
  const url = new URL(window.location.href);
  const encodedProject = await encodeCompressedProjectSharePayload(JSON.stringify(project));
  url.hash = `${PROJECT_COMPRESSED_SHARE_HASH_PARAM}=${encodedProject}`;
  return url.toString();
}

function parseProjectShareHash(hash: string): ProjectState | null {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash) {
    return null;
  }

  try {
    const encodedProject = new URLSearchParams(normalizedHash).get(PROJECT_SHARE_HASH_PARAM);
    return encodedProject ? parseProjectFile(decodeBase64Url(encodedProject)) : null;
  } catch {
    return null;
  }
}

async function parseCompressedProjectShareHash(hash: string): Promise<ProjectState | null> {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash) {
    return null;
  }

  try {
    const encodedProject = new URLSearchParams(normalizedHash).get(PROJECT_COMPRESSED_SHARE_HASH_PARAM);
    return encodedProject
      ? parseProjectFile(await decodeCompressedProjectSharePayload(encodedProject))
      : null;
  } catch {
    return null;
  }
}

function clearProjectShareHash() {
  if (!hasProjectShareHash(window.location.hash)) {
    return;
  }
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

function hasProjectShareHash(hash: string): boolean {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash) {
    return false;
  }
  const params = new URLSearchParams(normalizedHash);
  return params.has(PROJECT_SHARE_HASH_PARAM) || params.has(PROJECT_COMPRESSED_SHARE_HASH_PARAM);
}

async function encodeCompressedProjectSharePayload(value: string): Promise<string> {
  if (typeof CompressionStream === "undefined") {
    return encodeBase64Url(value);
  }

  const stream = new Blob([value]).stream().pipeThrough(new CompressionStream("gzip"));
  const buffer = await new Response(stream).arrayBuffer();
  return encodeBytesBase64Url(new Uint8Array(buffer));
}

async function decodeCompressedProjectSharePayload(value: string): Promise<string> {
  if (typeof DecompressionStream === "undefined") {
    return decodeBase64Url(value);
  }

  const bytes = decodeBase64UrlToBytes(value);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

function encodeBase64Url(value: string): string {
  return encodeBytesBase64Url(new TextEncoder().encode(value));
}

function encodeBytesBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
  return new TextDecoder().decode(decodeBase64UrlToBytes(value));
}

function decodeBase64UrlToBytes(value: string): Uint8Array {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function copyTextToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.select();
  try {
    if (!document.execCommand("copy")) {
      throw new Error("Copy command failed");
    }
  } finally {
    textArea.remove();
  }
}

function defaultProjectState(drivers: SpeakerDriver[], selectedDriver: SpeakerDriver, designs: BoxDesign[], focusedDesignId: string): ProjectState {
  return {
    acousticOptions: DEFAULT_ACOUSTIC_OPTIONS,
    activeTab: "response",
    addedMassZma: DEFAULT_ADDED_MASS_ZMA,
    freeAirZma: DEFAULT_FREE_AIR_ZMA,
    chartFrequencyMinHz: DEFAULT_CHART_FREQUENCY_MIN_HZ,
    chartFrequencyMaxHz: DEFAULT_FREQUENCY_MAX_HZ,
    chartStepTimeMinMs: DEFAULT_CHART_STEP_TIME_MIN_MS,
    chartStepTimeMaxMs: DEFAULT_CHART_STEP_TIME_MAX_MS,
    chartYScales: defaultChartYScales(),
    compareDriverIds: [selectedDriver.id],
    compareEnabled: false,
    designs,
    drivers,
    focusedDesignId,
    fixedDriverFields: {},
    language: loadLanguage(),
    libraryFilters: DEFAULT_LIBRARY_FILTERS,
    measurements: [],
    optimizerGoal: "balanced",
    powerW: 25,
    referenceByTab: {},
    selectedDriverId: selectedDriver.id,
    sealedZma: DEFAULT_SEALED_ZMA,
    splInputMode: "rePower",
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

    const projectDrivers = parsed.drivers.filter(isSpeakerDriver);
    if (projectDrivers.length === 0) {
      return null;
    }
    const drivers = mergePresetDrivers(projectDrivers);

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
      acousticOptions: normalizeAcousticOptions(parsed.acousticOptions),
      activeTab: isChartTab(parsed.activeTab) ? parsed.activeTab : "response",
      addedMassZma: normalizeAddedMassZmaState(parsed.addedMassZma),
      freeAirZma: normalizeFreeAirZmaState(parsed.freeAirZma),
      chartFrequencyMinHz: normalizeChartFrequencyMin(parsed.chartFrequencyMinHz),
      chartFrequencyMaxHz: normalizeChartFrequencyMax(parsed.chartFrequencyMaxHz),
      chartStepTimeMinMs: normalizeChartStepTimeMin(parsed.chartStepTimeMinMs),
      chartStepTimeMaxMs: normalizeChartStepTimeMax(parsed.chartStepTimeMaxMs),
      chartYScales: normalizeChartYScales(parsed.chartYScales),
      compareDriverIds: Array.isArray(parsed.compareDriverIds)
        ? parsed.compareDriverIds.filter((id): id is string => typeof id === "string" && drivers.some((driver) => driver.id === id))
        : [selectedDriverId],
      compareEnabled: parsed.compareEnabled === true,
      designs: normalizedDesigns,
      drivers,
      focusedDesignId,
      fixedDriverFields: normalizeFixedDriverFields(parsed.fixedDriverFields, drivers),
      language: parsed.language === "en" ? "en" : "ru",
      libraryFilters: normalizeLibraryFilters(parsed.libraryFilters),
      mechanicalDerivedField: isMechanicalDerivedField(parsed.mechanicalDerivedField)
        ? parsed.mechanicalDerivedField
        : undefined,
      motorDerivedField: isMotorDerivedField(parsed.motorDerivedField)
        ? parsed.motorDerivedField
        : undefined,
      qualityDerivedField: isQualityDerivedField(parsed.qualityDerivedField)
        ? parsed.qualityDerivedField
        : undefined,
      measurements: Array.isArray(parsed.measurements)
        ? normalizeMeasurementTraces(parsed.measurements, selectedDriverId)
        : [],
      optimizerGoal: isOptimizerGoal(parsed.optimizerGoal) ? parsed.optimizerGoal : "balanced",
      powerW: typeof parsed.powerW === "number" && Number.isFinite(parsed.powerW)
        ? Math.max(0.1, parsed.powerW)
        : 25,
      referenceByTab: isPlainRecord(parsed.referenceByTab)
        ? normalizeReferenceByTab(parsed.referenceByTab)
        : {},
      selectedDriverId,
      sealedZma: normalizeSealedZmaState(parsed.sealedZma),
      splInputMode: isSplInputMode(parsed.splInputMode) ? parsed.splInputMode : "rePower",
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
    return Array.isArray(parsed) && parsed.length > 0
      ? mergePresetDrivers(parsed.filter(isSpeakerDriver))
      : PRESET_DRIVERS;
  } catch {
    return PRESET_DRIVERS;
  }
}

function normalizeLibraryFilters(value: unknown): LibraryFilters {
  if (!isPlainRecord(value)) {
    return DEFAULT_LIBRARY_FILTERS;
  }
  const status = value.status === "verified" || value.status === "modified" || value.status === "user"
    ? value.status
    : "all";
  return {
    maxFsHz: finiteOptional(value.maxFsHz),
    maxQts: finiteOptional(value.maxQts),
    maxVasL: finiteOptional(value.maxVasL),
    minSdCm2: finiteOptional(value.minSdCm2),
    minXmaxMm: finiteOptional(value.minXmaxMm),
    query: typeof value.query === "string" ? value.query : "",
    status,
  };
}

function normalizeAcousticOptions(value: unknown): AcousticOptions {
  if (!isPlainRecord(value)) {
    return DEFAULT_ACOUSTIC_OPTIONS;
  }
  return {
    baffleStepDb: finiteOptional(value.baffleStepDb) ?? DEFAULT_ACOUSTIC_OPTIONS.baffleStepDb,
    baffleStepHz: finiteOptional(value.baffleStepHz) ?? DEFAULT_ACOUSTIC_OPTIONS.baffleStepHz,
    roomGainDb: finiteOptional(value.roomGainDb) ?? DEFAULT_ACOUSTIC_OPTIONS.roomGainDb,
    roomGainStartHz: finiteOptional(value.roomGainStartHz) ?? DEFAULT_ACOUSTIC_OPTIONS.roomGainStartHz,
  };
}

function normalizeSealedZmaState(value: unknown): SealedZmaState {
  if (!isPlainRecord(value)) {
    return DEFAULT_SEALED_ZMA;
  }
  const reOhm = finiteOptional(value.reOhm);
  return {
    boxVolumeLiters: clampNumber(finiteOptional(value.boxVolumeLiters) ?? DEFAULT_SEALED_ZMA.boxVolumeLiters, 0.1, 10000),
    reOhm: reOhm !== undefined ? clampNumber(reOhm, 0.1, 100) : undefined,
    selectedMeasurementId: typeof value.selectedMeasurementId === "string" ? value.selectedMeasurementId : undefined,
    targetQtc: clampNumber(finiteOptional(value.targetQtc) ?? DEFAULT_SEALED_ZMA.targetQtc, 0.3, 2),
  };
}

function normalizeAddedMassZmaState(value: unknown): AddedMassZmaState {
  if (!isPlainRecord(value)) {
    return DEFAULT_ADDED_MASS_ZMA;
  }
  return {
    addedMassGrams: clampNumber(finiteOptional(value.addedMassGrams) ?? DEFAULT_ADDED_MASS_ZMA.addedMassGrams, 0.1, 1000),
    selectedMeasurementId: typeof value.selectedMeasurementId === "string" ? value.selectedMeasurementId : undefined,
  };
}

function normalizeFreeAirZmaState(value: unknown): FreeAirZmaState {
  if (!isPlainRecord(value)) {
    return DEFAULT_FREE_AIR_ZMA;
  }
  const reOhm = finiteOptional(value.reOhm);
  return {
    reOhm: reOhm !== undefined ? clampNumber(reOhm, 0.1, 100) : undefined,
    selectedMeasurementId: typeof value.selectedMeasurementId === "string" ? value.selectedMeasurementId : undefined,
  };
}

function normalizeFixedDriverFields(value: unknown, drivers: SpeakerDriver[]): FixedDriverFieldsByDriver {
  if (!isPlainRecord(value)) {
    return {};
  }
  const driverIds = new Set(drivers.map((driver) => driver.id));
  const normalized: FixedDriverFieldsByDriver = {};
  for (const [driverId, fields] of Object.entries(value)) {
    if (!driverIds.has(driverId) || !Array.isArray(fields)) {
      continue;
    }
    const fixedFields = Array.from(new Set(fields.filter(isDriverFormulaField)));
    if (fixedFields.length > 0) {
      normalized[driverId] = fixedFields;
    }
  }
  return normalized;
}

function normalizeChartFrequencyMax(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? clampNumber(value, MIN_FREQUENCY_MAX_HZ, MAX_FREQUENCY_MAX_HZ)
    : DEFAULT_FREQUENCY_MAX_HZ;
}

function normalizeChartFrequencyMin(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? clampNumber(value, CHART_FREQUENCY_MIN_LIMIT_HZ, CHART_FREQUENCY_MIN_MAX_HZ)
    : DEFAULT_CHART_FREQUENCY_MIN_HZ;
}

function normalizeChartStepTimeMax(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? clampNumber(value, 1, CHART_STEP_TIME_MAX_LIMIT_MS)
    : DEFAULT_CHART_STEP_TIME_MAX_MS;
}

function normalizeChartStepTimeMin(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? clampNumber(value, CHART_STEP_TIME_MIN_LIMIT_MS, CHART_STEP_TIME_MIN_MAX_MS)
    : DEFAULT_CHART_STEP_TIME_MIN_MS;
}

function normalizeChartYValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? clampNumber(value, -CHART_Y_LIMIT, CHART_Y_LIMIT)
    : fallback;
}

function defaultChartYScale(tab: ChartTab): ChartYScaleState {
  const [min, max] = DEFAULT_CHART_Y_RANGES[tab];
  return { auto: true, max, min };
}

function defaultChartYScales(): Record<ChartTab, ChartYScaleState> {
  return chartTabs.reduce((scales, tab) => {
    scales[tab] = defaultChartYScale(tab);
    return scales;
  }, {} as Record<ChartTab, ChartYScaleState>);
}

function normalizeChartYScales(value: unknown): Record<ChartTab, ChartYScaleState> {
  const scales = defaultChartYScales();
  if (!isPlainRecord(value)) {
    return scales;
  }

  for (const tab of chartTabs) {
    const scale = value[tab];
    if (!isPlainRecord(scale)) {
      continue;
    }
    const fallback = defaultChartYScale(tab);
    scales[tab] = {
      auto: typeof scale.auto === "boolean" ? scale.auto : fallback.auto,
      max: normalizeChartYValue(scale.max, fallback.max),
      min: normalizeChartYValue(scale.min, fallback.min),
    };
  }

  return scales;
}

function finiteOptional(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeMeasurementTraces(values: unknown[], fallbackDriverId: string): MeasurementTrace[] {
  return values
    .map((value, index) => normalizeMeasurementTrace(value, fallbackDriverId, index))
    .filter(Boolean) as MeasurementTrace[];
}

function normalizeMeasurementTrace(value: unknown, fallbackDriverId: string, index: number): MeasurementTrace | null {
  if (!isPlainRecord(value) || !Array.isArray(value.points) || !value.points.every(isPoint)) {
    return null;
  }
  if (typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }
  const kind = isMeasurementTraceKind(value.kind)
    ? value.kind
    : value.tab === "impedance"
      ? "zma"
      : "frd";
  return {
    color: typeof value.color === "string" ? value.color : DESIGN_COLORS[(index + 6) % DESIGN_COLORS.length],
    driverId: typeof value.driverId === "string" ? value.driverId : fallbackDriverId,
    hidden: value.hidden === true,
    id: value.id,
    kind,
    name: value.name,
    offsetDb: clampNumber(finiteOptional(value.offsetDb) ?? 0, -60, 60),
    points: value.points,
    tab: isChartTab(value.tab) ? value.tab : measurementKindToDefaultTab(kind),
  };
}

function isPoint(value: unknown): value is Point {
  return isPlainRecord(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y);
}

function isMeasurementTraceKind(value: unknown): value is MeasurementTraceKind {
  return value === "frd" || value === "zma";
}

function mergePresetDrivers(drivers: SpeakerDriver[]): SpeakerDriver[] {
  const enrichedDrivers = drivers.map(enrichPresetDriver);
  const existingIds = new Set(enrichedDrivers.map((driver) => driver.id));
  const existingNames = new Set(enrichedDrivers.map((driver) => driver.name.trim().toLowerCase()));
  const missingPresets = PRESET_DRIVERS.filter((preset) =>
    !existingIds.has(preset.id) && !existingNames.has(preset.name.trim().toLowerCase()),
  );
  return [...enrichedDrivers, ...missingPresets];
}

function applyDriverFieldValue(
  driver: SpeakerDriver,
  key: keyof SpeakerDriver,
  value: string,
  mechanicalDerivedField?: MechanicalDerivedField,
  motorDerivedField?: MotorDerivedField,
  qualityDerivedField?: QualityDerivedField,
): SpeakerDriver {
  if (key === "name") {
    return { ...driver, name: value };
  }
  if (key === "id" || key === "source") {
    return driver;
  }
  const trimmed = value.trim();
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) {
    if (!requiredDriverNumberFields.has(key) && trimmed === "") {
      return { ...driver, [key]: undefined };
    }
    return driver;
  }
  const limits = driverFieldLimits.get(key);
  const normalized = limits
    ? clampNumber(parsed, limits.min, limits.max ?? Number.POSITIVE_INFINITY)
    : parsed;
  const nextDriver = { ...driver, [key]: normalized };
  return reconcileDriverDerivedFields(
    nextDriver,
    key,
    mechanicalDerivedField,
    motorDerivedField,
    qualityDerivedField,
  );
}

function isProtectedPresetDriver(driver: SpeakerDriver): boolean {
  return Boolean(driver.source?.verified && PRESET_DRIVERS.some((preset) => preset.id === driver.id));
}

function findPresetForDriver(driver: SpeakerDriver): SpeakerDriver | undefined {
  const sourceTitle = driver.source?.title.trim().toLowerCase();
  return PRESET_DRIVERS.find((preset) =>
    preset.id === driver.id ||
    preset.name.trim().toLowerCase() === driver.name.trim().toLowerCase() ||
    (sourceTitle !== undefined && preset.source?.title.trim().toLowerCase() === sourceTitle),
  );
}

function markSourceModified(source: SpeakerDriver["source"]): SpeakerDriver["source"] {
  if (!source) {
    return source;
  }
  return {
    ...source,
    verified: false,
    modified: true,
    notes: Array.from(new Set(["modifiedFromDatasheet", ...(source.notes ?? [])])),
  };
}

function enrichPresetDriver(driver: SpeakerDriver): SpeakerDriver {
  const preset = PRESET_DRIVERS.find((item) =>
    item.id === driver.id || item.name.trim().toLowerCase() === driver.name.trim().toLowerCase(),
  );
  if (!preset?.source) {
    return driver;
  }
  if (!driverMatchesPreset(driver, preset)) {
    return {
      ...driver,
      source: markSourceModified(preset.source),
    };
  }
  return {
    ...preset,
    id: driver.id,
    name: driver.name,
    source: preset.source,
  };
}

function driverMatchesPreset(driver: SpeakerDriver, preset: SpeakerDriver): boolean {
  return driver.name === preset.name &&
    driver.fsHz === preset.fsHz &&
    driver.qts === preset.qts &&
    driver.qes === preset.qes &&
    driver.qms === preset.qms &&
    driver.vasL === preset.vasL &&
    driver.sdCm2 === preset.sdCm2 &&
    driver.reOhm === preset.reOhm &&
    driver.leMh === preset.leMh &&
    driver.xmaxMm === preset.xmaxMm &&
    driver.peW === preset.peW &&
    (driver.sensitivityDb === undefined || driver.sensitivityDb === preset.sensitivityDb) &&
    driver.mmsG === preset.mmsG &&
    driver.cmsMmN === preset.cmsMmN &&
    driver.blTm === preset.blTm;
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

function loadPanelOrder<T extends string>(key: string, defaults: T[]): T[] {
  try {
    const raw = localStorage.getItem(key);
    return normalizePanelOrder(raw ? JSON.parse(raw) : undefined, defaults);
  } catch {
    return [...defaults];
  }
}

function normalizePanelOrder<T extends string>(value: unknown, defaults: T[]): T[] {
  if (!Array.isArray(value)) {
    return [...defaults];
  }
  const allowed = new Set<string>(defaults);
  const ordered = value.filter((item): item is T => typeof item === "string" && allowed.has(item));
  const unique = ordered.filter((item, index) => ordered.indexOf(item) === index);
  return [...unique, ...defaults.filter((item) => !unique.includes(item))];
}

function movePanelInOrder<T extends string>(order: T[], id: T, direction: -1 | 1): T[] {
  const index = order.indexOf(id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= order.length) {
    return order;
  }
  const next = [...order];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

function reorderPanelBefore<T extends string>(order: T[], draggedId: T, targetId: T): T[] {
  if (draggedId === targetId || !order.includes(draggedId) || !order.includes(targetId)) {
    return order;
  }
  const withoutDragged = order.filter((item) => item !== draggedId);
  const targetIndex = withoutDragged.indexOf(targetId);
  return [
    ...withoutDragged.slice(0, targetIndex),
    draggedId,
    ...withoutDragged.slice(targetIndex),
  ];
}

function normalizeDesign(design: BoxDesign): BoxDesign {
  return {
    ...design,
    vbLiters: Math.max(0.1, design.vbLiters || 0.1),
    fbHz: design.fbHz !== undefined ? Math.max(1, design.fbHz) : undefined,
    ql: design.ql !== undefined ? Math.max(0.1, design.ql) : undefined,
    bandpassRearLiters: design.bandpassRearLiters !== undefined
      ? clampNumber(design.bandpassRearLiters, 0.1, 100000)
      : undefined,
    bandpassFrontLiters: design.bandpassFrontLiters !== undefined
      ? clampNumber(design.bandpassFrontLiters, 0.1, 100000)
      : undefined,
    aperiodicMode: design.aperiodicMode === "flow" || design.aperiodicMode === "ql" ? design.aperiodicMode : undefined,
    aperiodicMaterial: APERIODIC_MATERIAL_KEYS.includes(design.aperiodicMaterial as AperiodicMaterial)
      ? design.aperiodicMaterial
      : undefined,
    aperiodicThicknessMm: design.aperiodicThicknessMm !== undefined
      ? clampNumber(design.aperiodicThicknessMm, 0.5, 200)
      : undefined,
    flowResistivityPaSecM2: design.flowResistivityPaSecM2 !== undefined
      ? clampNumber(design.flowResistivityPaSecM2, 100, 200000)
      : undefined,
    passiveRadiatorSdCm2: design.passiveRadiatorSdCm2 !== undefined
      ? clampNumber(design.passiveRadiatorSdCm2, 1, 5000)
      : undefined,
    passiveRadiatorMmsG: design.passiveRadiatorMmsG !== undefined
      ? clampNumber(design.passiveRadiatorMmsG, 1, 10000)
      : undefined,
    passiveRadiatorQms: design.passiveRadiatorQms !== undefined
      ? clampNumber(design.passiveRadiatorQms, 0.5, 50)
      : undefined,
    passiveRadiatorXmaxMm: design.passiveRadiatorXmaxMm !== undefined
      ? clampNumber(design.passiveRadiatorXmaxMm, 0.1, 100)
      : undefined,
    passiveRadiatorCount: design.passiveRadiatorCount !== undefined
      ? clampNumber(Math.round(design.passiveRadiatorCount), 1, 16)
      : undefined,
    portShape: design.portShape === "slot" ? "slot" : "round",
    portDiameterCm: design.portDiameterCm !== undefined ? Math.max(0.1, design.portDiameterCm) : undefined,
    portHeightCm: design.portHeightCm !== undefined ? Math.max(0.1, design.portHeightCm) : undefined,
    portWidthCm: design.portWidthCm !== undefined ? Math.max(0.1, design.portWidthCm) : undefined,
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

function isSplInputMode(value: unknown): value is SplInputMode {
  return typeof value === "string" && SPL_INPUT_MODES.includes(value as SplInputMode);
}

function keyForTemplate(design: BoxDesign): string {
  return design.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function logTicks(domain: [number, number]): number[] {
  return [10, 20, 30, 40, 50, 80, 100, 200, 300, 500, 800, 1000, 2000, 3000, 5000, 8000, 10000, 20000].filter(
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

function splDomain(values: number[]): [number, number] {
  const valid = values.filter(Number.isFinite);
  if (valid.length === 0) {
    return [60, 110];
  }
  const min = Math.max(30, Math.floor((Math.min(...valid) - 6) / 5) * 5);
  const max = Math.ceil((Math.max(...valid) + 6) / 5) * 5;
  return [min, Math.max(min + 10, max)];
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

function formatHzPair(left?: number, right?: number): string {
  if (!left || !right) {
    return "—";
  }
  return `${formatHz(left)} / ${formatHz(right)}`;
}

function sealedTargetVolumeFromTs(driver: SpeakerDriver, targetQtc: number): number | undefined {
  if (targetQtc <= driver.qts || driver.vasL <= 0 || driver.qts <= 0) {
    return undefined;
  }
  const ratio = Math.pow(targetQtc / driver.qts, 2) - 1;
  return ratio > 0 ? driver.vasL / ratio : undefined;
}

function fmt(value?: number, decimals = 1): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return value.toFixed(decimals);
}

function powerToDb(powerW: number): number {
  return 10 * Math.log10(Math.max(1e-9, powerW));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundFrequencyForInput(value: number): number {
  if (value < 100) {
    return roundTo(value, 1);
  }
  return roundTo(value, 0);
}

function roundStepTimeForInput(value: number): number {
  if (value < 10) {
    return roundTo(value, 2);
  }
  if (value < 100) {
    return roundTo(value, 1);
  }
  return roundTo(value, 0);
}

function roundChartYForInput(value: number): number {
  const absValue = Math.abs(value);
  if (absValue < 1) {
    return roundTo(value, 3);
  }
  if (absValue < 10) {
    return roundTo(value, 2);
  }
  return roundTo(value, 1);
}

function normalizeChartFrequencyDomain(minHz: number, maxHz: number): [number, number] {
  const min = clampNumber(minHz, CHART_FREQUENCY_MIN_LIMIT_HZ, CHART_FREQUENCY_MIN_MAX_HZ);
  const max = clampNumber(maxHz, MIN_FREQUENCY_MAX_HZ, MAX_FREQUENCY_MAX_HZ);
  if (min < max) {
    return [min, max];
  }
  return [Math.max(CHART_FREQUENCY_MIN_LIMIT_HZ, max / 2), max];
}

function normalizeChartStepTimeDomain(minMs: number, maxMs: number): [number, number] {
  const min = clampNumber(minMs, CHART_STEP_TIME_MIN_LIMIT_MS, CHART_STEP_TIME_MIN_MAX_MS);
  const max = clampNumber(maxMs, 1, CHART_STEP_TIME_MAX_LIMIT_MS);
  if (min < max) {
    return [min, max];
  }
  return [Math.max(CHART_STEP_TIME_MIN_LIMIT_MS, max - 50), max];
}

function normalizeChartYDomain(minY: number, maxY: number): [number, number] {
  const min = clampNumber(minY, -CHART_Y_LIMIT, CHART_Y_LIMIT);
  const max = clampNumber(maxY, -CHART_Y_LIMIT, CHART_Y_LIMIT);
  if (min !== max) {
    return [Math.min(min, max), Math.max(min, max)];
  }
  const lower = clampNumber(min, -CHART_Y_LIMIT, CHART_Y_LIMIT - 1);
  return [lower, lower + 1];
}

function parseBoundedNumber(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? clampNumber(parsed, min, max) : fallback;
}

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export default App;
