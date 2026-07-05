import {
  Activity,
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FileCheck2,
  Filter,
  Gauge,
  GripVertical,
  Languages,
  Plus,
  RefreshCw,
  Search,
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
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  Ref,
} from "react";
import {
  BoxDesign,
  BoxKind,
  DESIGN_COLORS,
  DriverSourceNote,
  Point,
  PRESET_DRIVERS,
  OptimizerCandidate,
  OptimizerGoal,
  SimulationResult,
  SimulationOutput,
  SpeakerDriver,
  SplLimitReason,
  createDefaultDesigns,
  createDesignFromTemplate,
  getDesignTemplates,
  optimizeDesigns,
  parseDriversFromFile,
  simulateDesign,
} from "./lib/acoustics";

type ChartTab = "response" | "spl" | "excursion" | "groupDelay" | "step" | "phase" | "impedance" | "port";
type Language = "ru" | "en";
type ScaleMode = "linear" | "log";
type ResizeTarget = "left" | "right";
type SidebarPanelId = "drivers" | "model";
type ChartToolPanelId = "corrections" | "measurements" | "compare";
type PanelArea = "sidebar" | "chartTools";
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
  measurement?: boolean;
  muted?: boolean;
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
  id: string;
  name: string;
  points: Point[];
  tab: ChartTab;
}

interface AcousticOptions {
  baffleStepDb: number;
  baffleStepHz: number;
  roomGainDb: number;
  roomGainStartHz: number;
}

interface ProjectState {
  acousticOptions: AcousticOptions;
  activeTab: ChartTab;
  compareDriverIds: string[];
  compareEnabled: boolean;
  designs: BoxDesign[];
  drivers: SpeakerDriver[];
  focusedDesignId: string;
  language: Language;
  libraryFilters: LibraryFilters;
  measurements: MeasurementTrace[];
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
  | "qtsFormulaMismatch"
  | "fsMmsVasMismatch"
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

interface PanelDragState {
  area: PanelArea;
  id: string;
}

const DRIVER_STORAGE_KEY = "speaker-builder-drivers-v1";
const LANGUAGE_STORAGE_KEY = "speaker-builder-language-v1";
const PROJECT_STORAGE_KEY = "speaker-builder-project-v1";
const LEFT_PANEL_STORAGE_KEY = "speaker-builder-left-panel-width-v1";
const RIGHT_PANEL_STORAGE_KEY = "speaker-builder-right-panel-width-v1";
const SIDEBAR_PANEL_ORDER_STORAGE_KEY = "speaker-builder-sidebar-panel-order-v1";
const CHART_PANEL_ORDER_STORAGE_KEY = "speaker-builder-chart-panel-order-v1";
const LEFT_PANEL_LIMITS = { min: 240, max: 540, defaultValue: 320 };
const RIGHT_PANEL_LIMITS = { min: 260, max: 560, defaultValue: 340 };
const RESIZE_KEY_STEP = 16;
const DEFAULT_SIDEBAR_PANEL_ORDER: SidebarPanelId[] = ["drivers", "model"];
const DEFAULT_CHART_PANEL_ORDER: ChartToolPanelId[] = ["corrections", "measurements", "compare"];
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
  { key: "sensitivityDb", label: "Sens.", unit: "dB", step: "0.1" },
  { key: "mmsG", label: "Mms", unit: "g", step: "0.1" },
  { key: "blTm", label: "BL", unit: "Tm", step: "0.1" },
];

const chartTabs: ChartTab[] = ["response", "spl", "excursion", "groupDelay", "step", "phase", "impedance", "port"];
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
      spl: "SPL",
      excursion: "Ход",
      groupDelay: "Групповая задержка",
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
        qtsFormulaMismatch: "Qts не согласуется с Qes и Qms",
        fsMmsVasMismatch: "Fs, Mms, Vas и Sd дают заметно другую резонансную частоту",
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
      imported: (count: number) => `Измерений: ${count}`,
      clear: "Очистить",
    },
    corrections: {
      title: "Поправки графика",
      roomGain: "Room gain",
      roomStart: "Ниже",
      baffleStep: "Baffle step",
      baffleHz: "Частота",
    },
    duplicate: "Дублировать",
    excursion: "Ход",
    exportJson: "Экспорт проекта JSON",
    exportReport: "Экспорт отчета HTML",
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
      maxSplLimitedByPe: (frequency: string) => `SPL ограничен Pe на ${frequency} Hz`,
      maxSplLimitedByPort: (frequency: string) => `SPL ограничен портом на ${frequency} Hz`,
      maxSplLimitedByXmax: (frequency: string) => `SPL ограничен Xmax на ${frequency} Hz`,
      multiplePortsLong: "Несколько портов сильно увеличивают требуемую длину",
      powerExceeded: (power: string) => `Заданная мощность выше Pe: ${power} W`,
      portDiameterSmall: "Диаметр порта мал для площади диффузора",
      portMayNotFit: "Порт может не поместиться в корпус",
      portNearNoise: (mach: string) => `Скорость воздуха близка к шумовому пределу: Mach ${mach}`,
      portResonanceLow: (frequency: string) => `Низкая первая резонансная частота порта: ${frequency} Hz`,
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
      maxSpl: "Макс. SPL",
      peak: "Пик",
      port: "Порт",
      spl: "SPL 50 / 80",
      tune: "Настройка",
      vb: "Vb",
      zmin: "Zmin",
    },
    limitReasons: {
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
        qtsFormulaMismatch: "Qts does not match Qes and Qms",
        fsMmsVasMismatch: "Fs, Mms, Vas, and Sd imply a noticeably different resonance",
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
      imported: (count: number) => `Measurements: ${count}`,
      clear: "Clear",
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
      maxSplLimitedByPort: (frequency: string) => `Max SPL limited by port at ${frequency} Hz`,
      maxSplLimitedByXmax: (frequency: string) => `Max SPL limited by Xmax at ${frequency} Hz`,
      multiplePortsLong: "Multiple ports make the tuning tube long",
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
      power: "Pe",
      port: "port",
      xmax: "Xmax",
    } satisfies Record<SplLimitReason, string>,
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
  const [libraryFilters, setLibraryFilters] = useState<LibraryFilters>(() => initialProject.libraryFilters);
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
  const [compareEnabled, setCompareEnabled] = useState(initialProject.compareEnabled);
  const [compareDriverIds, setCompareDriverIds] = useState<string[]>(() => initialProject.compareDriverIds);
  const [measurements, setMeasurements] = useState<MeasurementTrace[]>(() => initialProject.measurements);
  const [acousticOptions, setAcousticOptions] = useState<AcousticOptions>(() => initialProject.acousticOptions);
  const deferredPowerW = useDeferredValue(powerW);
  const [status, setStatus] = useState("");
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
  const simulationWorkerRef = useRef<Worker | null>(null);
  const simulationRequestIdRef = useRef({ analysis: 0, chart: 0 });
  const panelDragRef = useRef<PanelDragState | null>(null);
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
          acousticOptions,
          activeTab,
          compareDriverIds,
          compareEnabled,
          designs,
          drivers,
          focusedDesignId,
          language,
          libraryFilters,
          measurements,
          optimizerGoal,
          powerW,
          referenceByTab,
          selectedDriverId,
        }),
      ),
    );
  }, [
    acousticOptions,
    activeTab,
    compareDriverIds,
    compareEnabled,
    designs,
    drivers,
    focusedDesignId,
    language,
    libraryFilters,
    measurements,
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
    const compareDrivers = selectedCompareDrivers.length > 0 ? selectedCompareDrivers : [selectedDriver];
    return applyAcousticOptionsToResults(
      compareDrivers.map((driver, index) =>
        simulateDesign(driver, {
          ...focusedDesign,
          id: driver.id,
          name: displayDriverName(driver, text),
          color: DESIGN_COLORS[index % DESIGN_COLORS.length],
          enabled: true,
        }, { powerW, outputs }),
      ),
      acousticOptions,
    );
  }, [activeTab, acousticOptions, compareDriverIds, compareEnabled, drivers, focusedDesign, powerW, selectedDriver, text]);
  const chartDisplayResults = compareEnabled ? compareChartResults : adjustedChartResults;
  const measurementSeries = useMemo(
    () => measurements
      .filter((measurement) => measurement.tab === activeTab)
      .map((measurement) => ({
        color: measurement.color,
        measurement: true,
        name: measurement.name,
        points: measurement.points,
      })),
    [activeTab, measurements],
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
    const editedDriver = applyDriverFieldValue(selectedDriver, key, value);
    const shouldForkPreset = isProtectedPresetDriver(selectedDriver);
    const nextDriver: SpeakerDriver = {
      ...editedDriver,
      id: shouldForkPreset ? newId("driver") : editedDriver.id,
      name: shouldForkPreset && key !== "name"
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
      setSelectedDriverId(nextDriver.id);
      setCompareDriverIds((current) =>
        current.map((id) => (id === selectedDriver.id ? nextDriver.id : id)),
      );
    }
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
    setDrivers((current) => current.map((driver) => (driver.id === selectedDriver.id ? nextDriver : driver)));
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

  async function importMeasurementFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      const trace = parseMeasurementTrace(file.name, await file.text(), measurements.length);
      if (!trace) {
        setStatus(text.requiredFieldsMissing);
        return;
      }
      setMeasurements((current) => [...current, trace]);
      setActiveTab(trace.tab);
      setStatus(text.measurements.imported(measurements.length + 1));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : text.importError);
    }
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
    setSelectedDriverId(project.selectedDriverId);
    setDesigns(project.designs);
    setFocusedDesignId(project.focusedDesignId);
    setActiveTab(project.activeTab);
    setCompareEnabled(project.compareEnabled);
    setCompareDriverIds(project.compareDriverIds);
    setMeasurements(project.measurements);
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
          acousticOptions,
          activeTab,
          compareDriverIds,
          compareEnabled,
          designs,
          drivers,
          focusedDesignId,
          language,
          libraryFilters,
          measurements,
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

  function exportReportHtml() {
    const svg = chartSvgRef.current;
    const report = createReportHtml({
      acousticOptions,
      chartSvg: svg ? serializeSvg(svg) : "",
      driver: selectedDriver,
      measurements,
      powerW,
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

  const chartProps = getChartProps(activeTab, chartDisplayResults, deferredSelectedDriver, focusedDesignId, text, powerW, measurementSeries);
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
          count={measurements.length}
          dragHandle={dragHandle}
          text={text}
          onClear={() => setMeasurements([])}
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
          <button type="button" className="icon-button" onClick={exportReportHtml} title={text.exportReport}>
            <FileText size={18} />
          </button>
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
          <div className="panel chart-panel">
            <div className="chart-header">
              <div>
                <h2>{chartProps.title}</h2>
                <span>
                  {chartSubtitle}
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
                  <button type="button" className="text-button" onClick={() => measurementInputRef.current?.click()} title={text.measurements.import}>
                    <Upload size={16} />
                    FRD/ZMA
                  </button>
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
            <label className="field">
              <span>{text.portShape}</span>
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
                  step="0.1"
                  onChange={(portWidthCm) => onChange({ portWidthCm })}
                />
                <NumberField
                  label={text.portHeight}
                  unit="cm"
                  value={design.portHeightCm ?? 3}
                  step="0.1"
                  onChange={(portHeightCm) => onChange({ portHeightCm })}
                />
              </>
            ) : (
              <NumberField
                label={text.portDiameter}
                unit="cm"
                value={design.portDiameterCm ?? 7}
                step="0.1"
                onChange={(portDiameterCm) => onChange({ portDiameterCm })}
              />
            )}
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
        <NumberField label={text.corrections.roomGain} unit="dB" value={options.roomGainDb} step="0.5" onChange={(roomGainDb) => update({ roomGainDb })} />
        <NumberField label={text.corrections.roomStart} unit="Hz" value={options.roomGainStartHz} step="5" onChange={(roomGainStartHz) => update({ roomGainStartHz })} />
        <NumberField label={text.corrections.baffleStep} unit="dB" value={options.baffleStepDb} step="0.5" onChange={(baffleStepDb) => update({ baffleStepDb })} />
        <NumberField label={text.corrections.baffleHz} unit="Hz" value={options.baffleStepHz} step="10" onChange={(baffleStepHz) => update({ baffleStepHz })} />
      </div>
    </section>
  );
}

function MeasurementPanel({
  count,
  dragHandle,
  text,
  onClear,
  onDragOver,
  onDrop,
}: {
  count: number;
  dragHandle?: ReactNode;
  text: UiText;
  onClear: () => void;
  onDragOver?: (event: ReactDragEvent<HTMLElement>) => void;
  onDrop?: (event: ReactDragEvent<HTMLElement>) => void;
}) {
  return (
    <section className="mini-panel measurement-panel movable-panel" onDragOver={onDragOver} onDrop={onDrop}>
      {dragHandle}
      <div className="mini-panel-head">
        <h3>{text.measurements.title}</h3>
        <span>{text.measurements.imported(count)}</span>
      </div>
      <button type="button" className="text-button" disabled={count === 0} onClick={onClear}>
        <RefreshCw size={16} />
        {text.measurements.clear}
      </button>
    </section>
  );
}

function DriverComparePanel({
  dragHandle,
  drivers,
  enabled,
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
        {drivers.map((driver) => (
          <label key={driver.id} className="compare-item">
            <input
              type="checkbox"
              checked={selectedIds.includes(driver.id)}
              onChange={() => onToggleDriver(driver.id)}
            />
            <span>{displayDriverName(driver, text)}</span>
          </label>
        ))}
      </div>
    </section>
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
                {result.metrics.maxPortMach !== undefined
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
            className={`series-line ${item.focused ? "focused" : ""} ${item.muted ? "muted" : ""} ${item.measurement ? "measurement" : ""}`}
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
  powerW: number,
  measurementSeries: Series[] = [],
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
      series: [...toSeriesList(results, "responseDb", focusedDesignId, text), ...measurementSeries],
    };
  }
  if (tab === "spl") {
    const points = [
      ...results.flatMap((result) => result.splDb),
      ...measurementSeries.flatMap((series) => series.points),
    ];
    const domain = splDomain(points.map((point) => point.y));
    const sensitivityLine = driver.sensitivityDb !== undefined
      ? driver.sensitivityDb + powerToDb(powerW)
      : 85;
    return {
      ...base,
      title: text.chartTitles.spl,
      yLabel: "dB SPL",
      yDomain: domain,
      referenceLines: [
        { y: sensitivityLine, label: `${fmt(sensitivityLine, 1)} dB` },
        { y: 100, label: "100" },
      ].filter((line) => line.y >= domain[0] && line.y <= domain[1]),
      series: [...toSeriesList(results, "splDb", focusedDesignId, text), ...measurementSeries],
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
    const points = [
      ...results.flatMap((result) => result.impedanceOhm),
      ...measurementSeries.flatMap((series) => series.points),
    ];
    const max = Math.max(...points.map((point) => point.y), driver.reOhm * 2);
    return {
      ...base,
      title: text.chartTitles.impedance,
      yLabel: "Ω",
      yDomain: [0, niceCeil(max * 1.1)],
      series: [...toSeriesList(results, "impedanceOhm", focusedDesignId, text), ...measurementSeries],
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

  const maxSplPe = note.match(/^Max SPL limited by Pe at ([\d.]+) Hz$/);
  if (maxSplPe) {
    return text.notes.maxSplLimitedByPe(maxSplPe[1]);
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
  clone.querySelectorAll(".plot-hitbox, .chart-cursor").forEach((node) => node.remove());
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

function parseMeasurementTrace(name: string, content: string, index: number): MeasurementTrace | null {
  const lower = name.toLowerCase();
  const tab: ChartTab = lower.endsWith(".zma") ? "impedance" : "response";
  const points = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("*") && !line.startsWith(";"))
    .map((line) => line.split(/[,\s;]+/).map(Number))
    .filter((columns) => columns.length >= 2 && Number.isFinite(columns[0]) && Number.isFinite(columns[1]))
    .map(([x, y]) => ({ x, y }))
    .filter((point) => point.x > 0);
  if (points.length < 2) {
    return null;
  }
  return {
    color: DESIGN_COLORS[(index + 6) % DESIGN_COLORS.length],
    id: newId("measurement"),
    name,
    points,
    tab,
  };
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

function createReportHtml({
  acousticOptions,
  chartSvg,
  driver,
  measurements,
  powerW,
  results,
  text,
  title,
  warnings,
}: {
  acousticOptions: AcousticOptions;
  chartSvg: string;
  driver: SpeakerDriver;
  measurements: MeasurementTrace[];
  powerW: number;
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
  return `<!doctype html>
<html lang="ru">
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
    <div><strong>${escapeHtml(text.power)}:</strong> ${fmt(powerW, 1)} W</div>
    <div><strong>${escapeHtml(text.corrections.title)}:</strong> room ${fmt(acousticOptions.roomGainDb, 1)} dB, baffle ${fmt(acousticOptions.baffleStepDb, 1)} dB</div>
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
  ${warnings.length ? `<section><h2>Warnings</h2><ul>${warningItems}</ul></section>` : ""}
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
  if (driver.qes !== undefined && driver.qms !== undefined && driver.qes > 0 && driver.qms > 0) {
    const expectedQts = (driver.qes * driver.qms) / (driver.qes + driver.qms);
    if (Math.abs(expectedQts - driver.qts) / Math.max(0.01, driver.qts) > 0.08) {
      issues.push("qtsFormulaMismatch");
    }
  }
  if (driver.mmsG !== undefined && driver.mmsG > 0 && driver.sdCm2 > 0 && driver.vasL > 0) {
    const cms = (driver.vasL / 1000) / (1.204 * 343 * 343 * Math.pow(driver.sdCm2 / 10000, 2));
    const expectedFs = 1 / (Math.PI * 2 * Math.sqrt((driver.mmsG / 1000) * cms));
    if (Number.isFinite(expectedFs) && Math.abs(expectedFs - driver.fsHz) / Math.max(1, driver.fsHz) > 0.18) {
      issues.push("fsMmsVasMismatch");
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
    acousticOptions: DEFAULT_ACOUSTIC_OPTIONS,
    activeTab: "response",
    compareDriverIds: [selectedDriver.id],
    compareEnabled: false,
    designs,
    drivers,
    focusedDesignId,
    language: loadLanguage(),
    libraryFilters: DEFAULT_LIBRARY_FILTERS,
    measurements: [],
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
      compareDriverIds: Array.isArray(parsed.compareDriverIds)
        ? parsed.compareDriverIds.filter((id): id is string => typeof id === "string" && drivers.some((driver) => driver.id === id))
        : [selectedDriverId],
      compareEnabled: parsed.compareEnabled === true,
      designs: normalizedDesigns,
      drivers,
      focusedDesignId,
      language: parsed.language === "en" ? "en" : "ru",
      libraryFilters: normalizeLibraryFilters(parsed.libraryFilters),
      measurements: Array.isArray(parsed.measurements)
        ? parsed.measurements.filter(isMeasurementTrace)
        : [],
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

function finiteOptional(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isMeasurementTrace(value: unknown): value is MeasurementTrace {
  return isPlainRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.color === "string" &&
    isChartTab(value.tab) &&
    Array.isArray(value.points) &&
    value.points.every(isPoint);
}

function isPoint(value: unknown): value is Point {
  return isPlainRecord(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y);
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

function applyDriverFieldValue(driver: SpeakerDriver, key: keyof SpeakerDriver, value: string): SpeakerDriver {
  if (key === "name") {
    return { ...driver, name: value };
  }
  if (key === "id" || key === "source") {
    return driver;
  }
  const parsed = Number.parseFloat(value);
  return { ...driver, [key]: Number.isFinite(parsed) ? parsed : undefined };
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

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export default App;
