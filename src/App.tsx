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
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  ChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import {
  BoxDesign,
  BoxKind,
  DESIGN_COLORS,
  Point,
  PRESET_DRIVERS,
  SimulationResult,
  SpeakerDriver,
  createDefaultDesigns,
  createDesignFromTemplate,
  getDesignTemplates,
  parseDriversFromFile,
  simulateDesign,
} from "./lib/acoustics";

type ChartTab = "response" | "excursion" | "groupDelay" | "step" | "phase" | "impedance" | "port";
type Language = "ru" | "en";
type ScaleMode = "linear" | "log";
type ResizeTarget = "left" | "right";

interface Series {
  name: string;
  color: string;
  points: Point[];
  focused?: boolean;
  muted?: boolean;
}

interface ResizeState {
  target: ResizeTarget;
  startX: number;
  startWidth: number;
}

const DRIVER_STORAGE_KEY = "speaker-builder-drivers-v1";
const LANGUAGE_STORAGE_KEY = "speaker-builder-language-v1";
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
    duplicate: "Дублировать",
    excursion: "Ход",
    exportJson: "Экспорт JSON",
    importError: "Ошибка импорта",
    imported: (count: number) => `Импортировано: ${count}`,
    importJsonCsv: "Импорт JSON/CSV",
    inactivePrefix: "Неактивно - ",
    language: "Язык",
    metrics: "Метрики",
    model: "Модель",
    noActiveDesigns: "Нет активных конфигураций.",
    portDiameter: "Порт Ø",
    ports: "Порты",
    power: "Мощность",
    requiredFieldsMissing: "Файл не содержит обязательные поля Fs, Qts, Vas, Sd, Re.",
    reset: "Сбросить",
    resizeConfigPanel: "Изменить ширину панели конфигураций",
    resizeDriverPanel: "Изменить ширину панели динамиков",
    notes: {
      highQts: "Динамику с высоким Qts может лучше подойти закрытый или апериодический корпус",
      highVentAirSpeed: (mach: string) => `Высокая скорость воздуха в порту: Mach ${mach}`,
      invalidBoxVolume: "Некорректный объем корпуса",
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
    configs: "Configurations",
    copySuffix: "copy",
    delete: "Delete",
    design: "Design",
    designNames: {} satisfies Record<string, string>,
    driverNames: {} satisfies Record<string, string>,
    drivers: "Drivers",
    duplicate: "Duplicate",
    excursion: "Excursion",
    exportJson: "Export JSON",
    importError: "Import error",
    imported: (count: number) => `Imported: ${count}`,
    importJsonCsv: "Import JSON/CSV",
    inactivePrefix: "Inactive - ",
    language: "Language",
    metrics: "Metrics",
    model: "Model",
    noActiveDesigns: "No active configurations.",
    portDiameter: "Port Ø",
    ports: "Ports",
    power: "Power",
    requiredFieldsMissing: "File must contain Fs, Qts, Vas, Sd, and Re.",
    reset: "Reset",
    resizeConfigPanel: "Resize configuration panel",
    resizeDriverPanel: "Resize driver panel",
    notes: {
      highQts: "High Qts driver may prefer sealed or aperiodic loading",
      highVentAirSpeed: (mach: string) => `High vent air speed: Mach ${mach}`,
      invalidBoxVolume: "Invalid box volume",
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
  const [language, setLanguage] = useState<Language>(() => loadLanguage());
  const [drivers, setDrivers] = useState<SpeakerDriver[]>(() => loadDrivers());
  const [selectedDriverId, setSelectedDriverId] = useState(() => drivers[0]?.id ?? "");
  const selectedDriver = drivers.find((driver) => driver.id === selectedDriverId) ?? drivers[0];
  const [designs, setDesigns] = useState<BoxDesign[]>(() => createDefaultDesigns(selectedDriver));
  const [focusedDesignId, setFocusedDesignId] = useState("");
  const [activeTab, setActiveTab] = useState<ChartTab>("response");
  const [powerW, setPowerW] = useState(25);
  const [status, setStatus] = useState("");
  const [leftPanelWidth, setLeftPanelWidth] = useState(() =>
    loadPanelWidth(LEFT_PANEL_STORAGE_KEY, LEFT_PANEL_LIMITS),
  );
  const [rightPanelWidth, setRightPanelWidth] = useState(() =>
    loadPanelWidth(RIGHT_PANEL_STORAGE_KEY, RIGHT_PANEL_LIMITS),
  );
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const text = UI_TEXT[language];

  useEffect(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language;
    document.title = text.appTitle;
  }, [language, text.appTitle]);

  useEffect(() => {
    localStorage.setItem(DRIVER_STORAGE_KEY, JSON.stringify(drivers));
  }, [drivers]);

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
    if (!selectedDriver) {
      return;
    }
    const nextDesigns = createDefaultDesigns(selectedDriver);
    setDesigns(nextDesigns);
    setFocusedDesignId(nextDesigns.find((design) => design.enabled)?.id ?? nextDesigns[0]?.id ?? "");
  }, [selectedDriver?.id]);

  useEffect(() => {
    if (focusedDesignId && designs.some((design) => design.id === focusedDesignId)) {
      return;
    }
    setFocusedDesignId(designs.find((design) => design.enabled)?.id ?? designs[0]?.id ?? "");
  }, [designs, focusedDesignId]);

  const templates = useMemo(() => getDesignTemplates(selectedDriver), [selectedDriver]);
  const enabledResults = useMemo(
    () =>
      designs
        .filter((design) => design.enabled)
        .map((design) => simulateDesign(selectedDriver, design, { powerW })),
    [designs, powerW, selectedDriver],
  );
  const allWarnings = enabledResults.flatMap((result) =>
    result.metrics.notes.map((note) =>
      `${displayDesignName(result.design.name, text)}: ${translateNote(note, text)}`,
    ),
  );

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

  function addDriver() {
    const next: SpeakerDriver = {
      ...selectedDriver,
      id: newId("driver"),
      name: `${displayDriverName(selectedDriver, text)} ${text.copySuffix}`,
    };
    setDrivers((current) => [...current, next]);
    setSelectedDriverId(next.id);
  }

  function deleteDriver() {
    if (drivers.length <= 1) {
      return;
    }
    const nextDrivers = drivers.filter((driver) => driver.id !== selectedDriver.id);
    setDrivers(nextDrivers);
    setSelectedDriverId(nextDrivers[0].id);
  }

  async function importDrivers(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      const content = await file.text();
      const imported = parseDriversFromFile(file.name, content);
      if (imported.length === 0) {
        setStatus(text.requiredFieldsMissing);
        return;
      }
      setDrivers((current) => [...current, ...imported]);
      setSelectedDriverId(imported[0].id);
      setStatus(text.imported(imported.length));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : text.importError);
    }
  }

  function exportDrivers() {
    const blob = new Blob([JSON.stringify({ drivers }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "speaker-drivers.json";
    link.click();
    URL.revokeObjectURL(url);
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

  function focusDesign(id: string) {
    setFocusedDesignId(id);
    setDesigns((current) =>
      current.map((design) => (design.id === id ? { ...design, enabled: true } : design)),
    );
  }

  const chartProps = getChartProps(activeTab, enabledResults, selectedDriver, focusedDesignId, text);
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
          <button type="button" className="icon-button" onClick={exportDrivers} title={text.exportJson}>
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
              onChange={(event) => setSelectedDriverId(event.target.value)}
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
                <span>{displayDriverName(selectedDriver, text)}</span>
              </div>
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
            </div>

            <div className="chart-workbench">
              <div className="chart-stage">
                <LineChart {...chartProps} />
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
                    <span>{text.activeCount(enabledResults.length, designs.length)}</span>
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
                <span>{text.activeCount(enabledResults.length)}</span>
              </div>
              <Activity size={18} />
            </div>
            <MetricsTable
              boxLabels={text.boxLabels}
              focusedDesignId={focusedDesignId}
              results={enabledResults}
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
  xDomain,
  yDomain,
  xScale = "log",
  yLabel,
  referenceLines = [],
}: {
  title: string;
  series: Series[];
  xDomain: [number, number];
  yDomain: [number, number];
  xScale?: ScaleMode;
  yLabel: string;
  referenceLines?: Array<{ y: number; label: string }>;
}) {
  const width = 960;
  const height = 390;
  const margin = { top: 20, right: 24, bottom: 44, left: 58 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
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

  return (
    <div className="chart-box">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
        <rect className="plot-bg" x={margin.left} y={margin.top} width={innerWidth} height={innerHeight} />
        {xTicks.map((tick) => (
          <g key={`x-${tick}`}>
            <line className="grid-line" x1={scaleX(tick)} x2={scaleX(tick)} y1={margin.top} y2={height - margin.bottom} />
            <text className="axis-text" x={scaleX(tick)} y={height - 16} textAnchor="middle">
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
        <text className="axis-label" transform={`translate(18 ${height / 2}) rotate(-90)`} textAnchor="middle">
          {yLabel}
        </text>
        {series.map((item) => (
          <path
            key={item.name}
            className={`series-line ${item.focused ? "focused" : ""} ${item.muted ? "muted" : ""}`}
            d={pathForSeries(item.points, scaleX, scaleY, xDomain, yDomain)}
            stroke={item.color}
          />
        ))}
      </svg>
      <div className="legend">
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

function getChartProps(
  tab: ChartTab,
  results: SimulationResult[],
  driver: SpeakerDriver,
  focusedDesignId: string,
  text: UiText,
): Parameters<typeof LineChart>[0] {
  const base = {
    xDomain: [10, 500] as [number, number],
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

  return note;
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
