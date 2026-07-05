use eframe::egui;
use egui::{Color32, Pos2, Rect, Sense, Stroke, Vec2};
use serde::{Deserialize, Serialize};

const RHO: f64 = 1.204;
const SPEED_OF_SOUND: f64 = 343.0;
const TWO_PI: f64 = std::f64::consts::TAU;

#[derive(Clone, Copy, PartialEq, Eq)]
enum ChartKind {
    Response,
    Excursion,
    Impedance,
}

impl ChartKind {
    fn title(self) -> &'static str {
        match self {
            Self::Response => "Response",
            Self::Excursion => "Excursion",
            Self::Impedance => "Impedance",
        }
    }

    fn y_label(self) -> &'static str {
        match self {
            Self::Response => "dB",
            Self::Excursion => "mm",
            Self::Impedance => "Ohm",
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
enum BoxKind {
    Sealed,
    Vented,
    Passive,
    Aperiodic,
}

impl BoxKind {
    fn label(self) -> &'static str {
        match self {
            Self::Sealed => "Closed",
            Self::Vented => "Vented",
            Self::Passive => "Passive radiator",
            Self::Aperiodic => "Aperiodic",
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
struct Driver {
    name: String,
    fs_hz: f64,
    qts: f64,
    qes: f64,
    qms: f64,
    vas_l: f64,
    sd_cm2: f64,
    re_ohm: f64,
    le_mh: f64,
    xmax_mm: f64,
    sensitivity_db: f64,
    mms_g: f64,
    bl_tm: f64,
}

impl Default for Driver {
    fn default() -> Self {
        Self {
            name: "Usher 8945P".to_owned(),
            fs_hz: 34.012,
            qts: 0.335,
            qes: 0.388,
            qms: 2.441,
            vas_l: 37.1679,
            sd_cm2: 136.0,
            re_ohm: 5.8,
            le_mh: 0.237,
            xmax_mm: 6.0,
            sensitivity_db: 86.0,
            mms_g: 14.5948,
            bl_tm: 6.9338,
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
struct Design {
    name: String,
    kind: BoxKind,
    enabled: bool,
    vb_l: f64,
    fb_hz: f64,
    ql: f64,
    port_diameter_cm: f64,
    port_count: f64,
    pr_sd_cm2: f64,
    pr_mmp_g: f64,
    pr_qms: f64,
    pr_xmax_mm: f64,
    aperiodic_ra: f64,
    color: [u8; 3],
}

impl Design {
    fn color32(&self) -> Color32 {
        Color32::from_rgb(self.color[0], self.color[1], self.color[2])
    }
}

#[derive(Clone, Copy, Default)]
struct Complex {
    re: f64,
    im: f64,
}

impl Complex {
    fn new(re: f64, im: f64) -> Self {
        Self { re, im }
    }

    fn abs(self) -> f64 {
        self.re.hypot(self.im)
    }
}

impl std::ops::Add for Complex {
    type Output = Self;

    fn add(self, rhs: Self) -> Self {
        Self::new(self.re + rhs.re, self.im + rhs.im)
    }
}

impl std::ops::Sub for Complex {
    type Output = Self;

    fn sub(self, rhs: Self) -> Self {
        Self::new(self.re - rhs.re, self.im - rhs.im)
    }
}

impl std::ops::Mul for Complex {
    type Output = Self;

    fn mul(self, rhs: Self) -> Self {
        Self::new(
            self.re * rhs.re - self.im * rhs.im,
            self.re * rhs.im + self.im * rhs.re,
        )
    }
}

impl std::ops::Div for Complex {
    type Output = Self;

    fn div(self, rhs: Self) -> Self {
        let denominator = rhs.re * rhs.re + rhs.im * rhs.im;
        let denominator = denominator.max(1e-18);
        Self::new(
            (self.re * rhs.re + self.im * rhs.im) / denominator,
            (self.im * rhs.re - self.re * rhs.im) / denominator,
        )
    }
}

#[derive(Clone, Copy)]
struct DerivedDriver {
    sd_m2: f64,
    re_ohm: f64,
    le_h: f64,
    cms: f64,
    mms: f64,
    rms: f64,
    bl: f64,
}

#[derive(Clone, Copy)]
struct ResponseAtFrequency {
    acoustic: Complex,
    cone_velocity: Complex,
    input_impedance: Complex,
}

#[derive(Clone)]
struct Series {
    name: String,
    color: Color32,
    points: Vec<[f64; 2]>,
    focused: bool,
}

#[derive(Serialize, Deserialize)]
struct AppState {
    driver: Driver,
    designs: Vec<Design>,
    selected_design: usize,
    power_w: f64,
}

impl Default for AppState {
    fn default() -> Self {
        let driver = Driver::default();
        let sealed_bw = sealed_for_qtc(&driver, 0.707);
        let passive_vb = driver.vas_l * 0.42;
        let passive_fb = driver.fs_hz * 0.78;
        let pr_sd = driver.sd_cm2 * 1.5;
        let pr_mmp = passive_mass_for_target(passive_vb, passive_fb, pr_sd, 1.0);
        let designs = vec![
            Design {
                name: "Closed Bessel".to_owned(),
                kind: BoxKind::Sealed,
                enabled: true,
                vb_l: sealed_for_qtc(&driver, 0.577),
                fb_hz: 0.0,
                ql: 7.0,
                port_diameter_cm: 7.0,
                port_count: 1.0,
                pr_sd_cm2: pr_sd,
                pr_mmp_g: pr_mmp,
                pr_qms: 9.0,
                pr_xmax_mm: 10.8,
                aperiodic_ra: 48_000.0,
                color: [15, 118, 110],
            },
            Design {
                name: "Closed Butterworth".to_owned(),
                kind: BoxKind::Sealed,
                enabled: true,
                vb_l: sealed_bw,
                fb_hz: 0.0,
                ql: 7.0,
                port_diameter_cm: 7.0,
                port_count: 1.0,
                pr_sd_cm2: pr_sd,
                pr_mmp_g: pr_mmp,
                pr_qms: 9.0,
                pr_xmax_mm: 10.8,
                aperiodic_ra: 48_000.0,
                color: [194, 65, 12],
            },
            Design {
                name: "Vented QB3".to_owned(),
                kind: BoxKind::Vented,
                enabled: true,
                vb_l: driver.vas_l * 0.42,
                fb_hz: driver.fs_hz * 1.03,
                ql: 7.0,
                port_diameter_cm: 7.0,
                port_count: 1.0,
                pr_sd_cm2: pr_sd,
                pr_mmp_g: pr_mmp,
                pr_qms: 9.0,
                pr_xmax_mm: 10.8,
                aperiodic_ra: 48_000.0,
                color: [67, 56, 202],
            },
            Design {
                name: "Passive radiator".to_owned(),
                kind: BoxKind::Passive,
                enabled: true,
                vb_l: passive_vb,
                fb_hz: passive_fb,
                ql: 9.0,
                port_diameter_cm: 12.0,
                port_count: 1.0,
                pr_sd_cm2: pr_sd,
                pr_mmp_g: pr_mmp,
                pr_qms: 9.0,
                pr_xmax_mm: 10.8,
                aperiodic_ra: 48_000.0,
                color: [180, 83, 9],
            },
            Design {
                name: "Aperiodic".to_owned(),
                kind: BoxKind::Aperiodic,
                enabled: true,
                vb_l: sealed_bw * 0.68,
                fb_hz: 0.0,
                ql: 1.7,
                port_diameter_cm: 5.0,
                port_count: 1.0,
                pr_sd_cm2: pr_sd,
                pr_mmp_g: pr_mmp,
                pr_qms: 9.0,
                pr_xmax_mm: 10.8,
                aperiodic_ra: 48_000.0,
                color: [190, 18, 60],
            },
        ];
        Self {
            selected_design: 1,
            power_w: 1.0,
            designs,
            driver,
        }
    }
}

struct SpeakerBuilderApp {
    state: AppState,
    chart: ChartKind,
    frequency_max: f64,
    left_width: f32,
    right_width: f32,
}

impl SpeakerBuilderApp {
    fn new(cc: &eframe::CreationContext<'_>) -> Self {
        cc.egui_ctx.set_theme(egui::Theme::Light);
        let mut style = (*cc.egui_ctx.style_of(egui::Theme::Light)).clone();
        style.spacing.item_spacing = Vec2::new(8.0, 8.0);
        style.visuals.panel_fill = Color32::from_rgb(244, 247, 251);
        cc.egui_ctx.set_style_of(egui::Theme::Light, style);

        Self {
            state: AppState::default(),
            chart: ChartKind::Response,
            frequency_max: 500.0,
            left_width: 300.0,
            right_width: 340.0,
        }
    }
}

impl eframe::App for SpeakerBuilderApp {
    fn clear_color(&self, _visuals: &egui::Visuals) -> [f32; 4] {
        Color32::from_rgb(244, 247, 251).to_normalized_gamma_f32()
    }

    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        ui.painter()
            .rect_filled(ui.max_rect(), 0.0, Color32::from_rgb(244, 247, 251));

        let available_width = ui.available_width();
        let min_center_width = 420.0_f32.min((available_width * 0.55).max(260.0));
        let side_max = ((available_width - min_center_width - 32.0) / 2.0).max(220.0);
        self.left_width = self.left_width.clamp(220.0, side_max);
        self.right_width = self.right_width.clamp(240.0, side_max.max(240.0));

        panel_frame()
            .inner_margin(egui::Margin::symmetric(12, 8))
            .show(ui, |ui| {
                ui.horizontal_wrapped(|ui| {
                    ui.heading("SpeakerBuilder egui prototype");
                    ui.separator();
                    ui.label("Rust/WASM T/S enclosure workbench");
                    ui.separator();
                    ui.add(
                        egui::DragValue::new(&mut self.state.power_w)
                            .range(0.1..=10000.0)
                            .speed(0.1)
                            .suffix(" W"),
                    );
                    ui.separator();
                    for chart in [
                        ChartKind::Response,
                        ChartKind::Excursion,
                        ChartKind::Impedance,
                    ] {
                        ui.selectable_value(&mut self.chart, chart, chart.title());
                    }
                    ui.separator();
                    ui.add(
                        egui::Slider::new(&mut self.frequency_max, 100.0..=3000.0)
                            .logarithmic(true)
                            .text("Hz max"),
                    );
                });
            });
        ui.add_space(10.0);

        let body_height = ui.available_height();
        let center_width = (ui.available_width() - self.left_width - self.right_width - 16.0)
            .max(min_center_width);
        ui.horizontal(|ui| {
            ui.set_height(body_height);
            ui.allocate_ui_with_layout(
                Vec2::new(self.left_width, body_height),
                egui::Layout::top_down(egui::Align::Min),
                |ui| {
                    panel_frame().show(ui, |ui| {
                        egui::ScrollArea::vertical()
                            .id_salt("driver_panel_scroll")
                            .auto_shrink([false, false])
                            .show(ui, |ui| {
                                ui.set_width(self.left_width - 28.0);
                                driver_panel(ui, &mut self.state.driver);
                            });
                    });
                },
            );
            splitter(ui, &mut self.left_width, 1.0, 220.0..=side_max, body_height);

            ui.allocate_ui_with_layout(
                Vec2::new(center_width, body_height),
                egui::Layout::top_down(egui::Align::Min),
                |ui| {
                    panel_frame().show(ui, |ui| {
                        ui.heading(self.chart.title());
                        let series = build_series(&self.state, self.chart, self.frequency_max);
                        draw_chart(ui, self.chart, &series, self.frequency_max);
                    });
                },
            );

            splitter(
                ui,
                &mut self.right_width,
                -1.0,
                240.0..=side_max.max(240.0),
                body_height,
            );
            ui.allocate_ui_with_layout(
                Vec2::new(self.right_width, body_height),
                egui::Layout::top_down(egui::Align::Min),
                |ui| {
                    panel_frame().show(ui, |ui| {
                        egui::ScrollArea::vertical()
                            .id_salt("design_panel_scroll")
                            .auto_shrink([false, false])
                            .show(ui, |ui| {
                                ui.set_width(self.right_width - 28.0);
                                designs_panel(ui, &mut self.state);
                            });
                    });
                },
            );
        });
    }
}

fn panel_frame() -> egui::Frame {
    egui::Frame::default()
        .fill(Color32::WHITE)
        .stroke(Stroke::new(1.0, Color32::from_rgb(210, 220, 232)))
        .corner_radius(8)
        .inner_margin(egui::Margin::same(10))
}

fn driver_panel(ui: &mut egui::Ui, driver: &mut Driver) {
    ui.heading("Driver");
    ui.text_edit_singleline(&mut driver.name);
    driver_number(ui, "Fs", "Hz", &mut driver.fs_hz, 1.0..=300.0);
    driver_number(ui, "Qts", "", &mut driver.qts, 0.05..=2.0);
    driver_number(ui, "Qes", "", &mut driver.qes, 0.05..=5.0);
    driver_number(ui, "Qms", "", &mut driver.qms, 0.1..=30.0);
    driver_number(ui, "Vas", "L", &mut driver.vas_l, 0.1..=1000.0);
    driver_number(ui, "Sd", "cm2", &mut driver.sd_cm2, 1.0..=2000.0);
    driver_number(ui, "Re", "Ohm", &mut driver.re_ohm, 0.2..=32.0);
    driver_number(ui, "Le", "mH", &mut driver.le_mh, 0.0..=20.0);
    driver_number(ui, "Xmax", "mm", &mut driver.xmax_mm, 0.1..=100.0);
    driver_number(ui, "Mms", "g", &mut driver.mms_g, 0.1..=1000.0);
    driver_number(ui, "BL", "Tm", &mut driver.bl_tm, 0.1..=100.0);
}

fn designs_panel(ui: &mut egui::Ui, state: &mut AppState) {
    ui.heading("Configurations");
    for index in 0..state.designs.len() {
        let selected = state.selected_design == index;
        let design = &mut state.designs[index];
        egui::Frame::group(ui.style())
            .fill(if selected {
                Color32::from_rgb(235, 250, 248)
            } else {
                Color32::WHITE
            })
            .stroke(if selected {
                Stroke::new(1.5, Color32::from_rgb(15, 118, 110))
            } else {
                Stroke::new(1.0, Color32::from_rgb(210, 220, 232))
            })
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.checkbox(&mut design.enabled, "");
                    if ui.selectable_label(selected, &design.name).clicked() {
                        state.selected_design = index;
                    }
                });
                ui.horizontal(|ui| {
                    ui.label("Type");
                    egui::ComboBox::from_id_salt(("kind", index))
                        .selected_text(design.kind.label())
                        .show_ui(ui, |ui| {
                            for kind in [
                                BoxKind::Sealed,
                                BoxKind::Vented,
                                BoxKind::Passive,
                                BoxKind::Aperiodic,
                            ] {
                                ui.selectable_value(&mut design.kind, kind, kind.label());
                            }
                        });
                });
                design_number(ui, "Vb", "L", &mut design.vb_l, 0.1..=1000.0);
                match design.kind {
                    BoxKind::Sealed => {
                        ui.label(format!("Qtc {:.2}", sealed_qtc(&state.driver, design.vb_l)));
                    }
                    BoxKind::Vented => {
                        design_number(ui, "Fb", "Hz", &mut design.fb_hz, 5.0..=300.0);
                        design_number(ui, "Ql", "", &mut design.ql, 2.0..=30.0);
                        design_number(ui, "Port", "cm", &mut design.port_diameter_cm, 1.0..=30.0);
                        design_number(ui, "Ports", "", &mut design.port_count, 1.0..=8.0);
                    }
                    BoxKind::Passive => {
                        design_number(ui, "PR Sd", "cm2", &mut design.pr_sd_cm2, 1.0..=5000.0);
                        design_number(ui, "PR Mmp", "g", &mut design.pr_mmp_g, 1.0..=10000.0);
                        design_number(ui, "PR Qms", "", &mut design.pr_qms, 0.5..=50.0);
                        design_number(ui, "PR Xmax", "mm", &mut design.pr_xmax_mm, 0.1..=100.0);
                        design_number(ui, "PR count", "", &mut design.port_count, 1.0..=8.0);
                        ui.label(format!(
                            "PR Fb {:.1} Hz",
                            passive_tuning(
                                design.vb_l,
                                design.pr_sd_cm2,
                                design.pr_mmp_g,
                                design.port_count
                            )
                        ));
                    }
                    BoxKind::Aperiodic => {
                        design_number(
                            ui,
                            "Ra",
                            "Pa s/m3",
                            &mut design.aperiodic_ra,
                            1000.0..=200000.0,
                        );
                    }
                }
            });
        ui.add_space(6.0);
    }
}

fn splitter(
    ui: &mut egui::Ui,
    width: &mut f32,
    direction: f32,
    range: std::ops::RangeInclusive<f32>,
    height: f32,
) {
    let (rect, response) = ui.allocate_exact_size(Vec2::new(8.0, height), Sense::drag());
    if response.dragged() {
        *width = (*width + response.drag_delta().x * direction).clamp(*range.start(), *range.end());
        ui.ctx().request_repaint();
    }
    let color = if response.hovered() || response.dragged() {
        Color32::from_rgb(15, 118, 110)
    } else {
        Color32::from_rgb(210, 220, 232)
    };
    ui.painter().line_segment(
        [
            Pos2::new(rect.center().x, rect.top()),
            Pos2::new(rect.center().x, rect.bottom()),
        ],
        Stroke::new(2.0, color),
    );
}

fn driver_number(
    ui: &mut egui::Ui,
    label: &str,
    suffix: &str,
    value: &mut f64,
    range: std::ops::RangeInclusive<f64>,
) {
    ui.horizontal(|ui| {
        ui.label(label);
        ui.add(
            egui::DragValue::new(value)
                .range(range)
                .speed(0.1)
                .suffix(format!(" {suffix}")),
        );
    });
}

fn design_number(
    ui: &mut egui::Ui,
    label: &str,
    suffix: &str,
    value: &mut f64,
    range: std::ops::RangeInclusive<f64>,
) {
    ui.horizontal(|ui| {
        ui.label(label);
        ui.add(
            egui::DragValue::new(value)
                .range(range)
                .speed(0.2)
                .suffix(format!(" {suffix}")),
        );
    });
}

fn build_series(state: &AppState, chart: ChartKind, frequency_max: f64) -> Vec<Series> {
    let frequencies = logspace(10.0, frequency_max.max(100.0), 220);
    let derived = derive_driver(&state.driver);
    let reference = state
        .designs
        .iter()
        .find(|design| design.enabled)
        .map(|design| reference_magnitude(&derived, design, &frequencies))
        .unwrap_or(1.0);

    state
        .designs
        .iter()
        .enumerate()
        .filter(|(_, design)| design.enabled)
        .map(|(index, design)| {
            let mut points = Vec::with_capacity(frequencies.len());
            for &frequency in &frequencies {
                let response = response_at_frequency(&derived, design, frequency);
                let y = match chart {
                    ChartKind::Response => db(response.acoustic.abs() / reference),
                    ChartKind::Excursion => {
                        let velocity = response.cone_velocity.abs()
                            * drive_voltage(state.power_w, state.driver.re_ohm);
                        velocity * 1000.0 / (TWO_PI * frequency)
                    }
                    ChartKind::Impedance => response.input_impedance.abs(),
                };
                points.push([frequency, y]);
            }
            Series {
                name: design.name.clone(),
                color: design.color32(),
                points,
                focused: state.selected_design == index,
            }
        })
        .collect()
}

fn draw_chart(ui: &mut egui::Ui, chart: ChartKind, series: &[Series], frequency_max: f64) {
    let desired_size = ui.available_size().max(Vec2::new(500.0, 360.0));
    let (rect, _) = ui.allocate_exact_size(desired_size, Sense::hover());
    let painter = ui.painter_at(rect);
    let plot = Rect::from_min_max(
        rect.min + Vec2::new(58.0, 22.0),
        rect.max - Vec2::new(20.0, 92.0),
    );

    painter.rect_filled(rect, 8.0, Color32::WHITE);
    painter.rect_filled(plot, 0.0, Color32::from_rgb(248, 250, 252));
    painter.rect_stroke(
        plot,
        0.0,
        Stroke::new(1.0, Color32::from_rgb(135, 151, 171)),
        egui::StrokeKind::Inside,
    );

    let y_domain = y_domain(chart, series);
    let x_min = 10.0_f64;
    let x_max = frequency_max.max(100.0);

    for x in [
        10.0, 20.0, 30.0, 50.0, 80.0, 100.0, 200.0, 300.0, 500.0, 1000.0, 3000.0,
    ] {
        if x < x_min || x > x_max {
            continue;
        }
        let px = x_to_px(x, x_min, x_max, plot);
        painter.line_segment(
            [Pos2::new(px, plot.top()), Pos2::new(px, plot.bottom())],
            Stroke::new(1.0, Color32::from_rgb(225, 232, 241)),
        );
        painter.text(
            Pos2::new(px, plot.bottom() + 14.0),
            egui::Align2::CENTER_TOP,
            format_hz(x),
            egui::FontId::proportional(12.0),
            Color32::from_rgb(91, 111, 137),
        );
    }

    for i in 0..=6 {
        let t = i as f64 / 6.0;
        let y = y_domain.0 + (y_domain.1 - y_domain.0) * t;
        let py = y_to_px(y, y_domain, plot);
        painter.line_segment(
            [Pos2::new(plot.left(), py), Pos2::new(plot.right(), py)],
            Stroke::new(1.0, Color32::from_rgb(225, 232, 241)),
        );
        painter.text(
            Pos2::new(plot.left() - 10.0, py),
            egui::Align2::RIGHT_CENTER,
            format!("{y:.1}"),
            egui::FontId::proportional(12.0),
            Color32::from_rgb(91, 111, 137),
        );
    }

    for item in series {
        let stroke = if item.focused {
            Stroke::new(3.4, item.color)
        } else {
            Stroke::new(1.5, item.color.gamma_multiply(0.45))
        };
        let points: Vec<Pos2> = item
            .points
            .iter()
            .map(|point| {
                Pos2::new(
                    x_to_px(point[0], x_min, x_max, plot),
                    y_to_px(point[1], y_domain, plot),
                )
            })
            .collect();
        painter.add(egui::Shape::line(points, stroke));
    }

    painter.text(
        Pos2::new(plot.center().x, rect.bottom() - 18.0),
        egui::Align2::CENTER_CENTER,
        "Frequency, Hz",
        egui::FontId::proportional(13.0),
        Color32::from_rgb(91, 111, 137),
    );
    painter.text(
        Pos2::new(plot.left(), plot.top() - 8.0),
        egui::Align2::LEFT_BOTTOM,
        chart.y_label(),
        egui::FontId::proportional(13.0),
        Color32::from_rgb(91, 111, 137),
    );

    let mut legend_x = plot.left();
    let legend_y = rect.bottom() - 50.0;
    for item in series {
        painter.circle_filled(Pos2::new(legend_x + 6.0, legend_y), 5.0, item.color);
        painter.text(
            Pos2::new(legend_x + 18.0, legend_y),
            egui::Align2::LEFT_CENTER,
            &item.name,
            egui::FontId::proportional(if item.focused { 14.0 } else { 13.0 }),
            if item.focused {
                Color32::from_rgb(23, 32, 51)
            } else {
                Color32::from_rgb(120, 132, 150)
            },
        );
        legend_x += 18.0 + (item.name.len() as f32 * 7.5).min(190.0);
        if legend_x > plot.right() - 160.0 {
            break;
        }
    }
}

fn y_domain(chart: ChartKind, series: &[Series]) -> (f64, f64) {
    let values = series
        .iter()
        .flat_map(|series| series.points.iter().map(|point| point[1]));
    let (mut min, mut max) = values.fold((f64::INFINITY, f64::NEG_INFINITY), |(min, max), y| {
        (min.min(y), max.max(y))
    });
    if !min.is_finite() || !max.is_finite() || (max - min).abs() < 1e-6 {
        (min, max) = match chart {
            ChartKind::Response => (-36.0, 9.0),
            ChartKind::Excursion => (0.0, 10.0),
            ChartKind::Impedance => (0.0, 80.0),
        };
    }
    match chart {
        ChartKind::Response => (min.min(-36.0).floor(), max.max(6.0).ceil()),
        ChartKind::Excursion | ChartKind::Impedance => (0.0, (max * 1.15).max(1.0).ceil()),
    }
}

fn x_to_px(x: f64, x_min: f64, x_max: f64, plot: Rect) -> f32 {
    let t = (x / x_min).ln() / (x_max / x_min).ln();
    egui::lerp(plot.left()..=plot.right(), t as f32)
}

fn y_to_px(y: f64, domain: (f64, f64), plot: Rect) -> f32 {
    let t = ((y - domain.0) / (domain.1 - domain.0)).clamp(0.0, 1.0);
    egui::lerp(plot.bottom()..=plot.top(), t as f32)
}

fn format_hz(value: f64) -> String {
    if value >= 1000.0 {
        format!("{:.0}k", value / 1000.0)
    } else {
        format!("{value:.0}")
    }
}

fn derive_driver(driver: &Driver) -> DerivedDriver {
    let fs_hz = driver.fs_hz.max(1.0);
    let qts = driver.qts.clamp(0.05, 2.0);
    let qes = driver.qes.max(qts + 0.001);
    let qms = driver.qms.max(qts + 0.001);
    let vas_m3 = (driver.vas_l / 1000.0).max(0.001);
    let sd_m2 = (driver.sd_cm2 / 10000.0).max(0.001);
    let re_ohm = driver.re_ohm.max(0.2);
    let le_h = (driver.le_mh / 1000.0).max(0.0);
    let omega_s = TWO_PI * fs_hz;
    let cms = vas_m3 / (RHO * SPEED_OF_SOUND * SPEED_OF_SOUND * sd_m2 * sd_m2);
    let mms = if driver.mms_g > 0.0 {
        driver.mms_g / 1000.0
    } else {
        1.0 / (omega_s * omega_s * cms)
    };
    let rms = omega_s * mms / qms;
    let bl = if driver.bl_tm > 0.0 {
        driver.bl_tm
    } else {
        ((omega_s * mms * re_ohm) / qes).sqrt()
    };

    DerivedDriver {
        sd_m2,
        re_ohm,
        le_h,
        cms,
        mms,
        rms,
        bl,
    }
}

fn response_at_frequency(
    driver: &DerivedDriver,
    design: &Design,
    frequency: f64,
) -> ResponseAtFrequency {
    let omega = TWO_PI * frequency;
    let s = Complex::new(0.0, omega);
    let ze = Complex::new(driver.re_ohm, 0.0) + s * Complex::new(driver.le_h, 0.0);
    let zms = Complex::new(driver.rms, 0.0)
        + s * Complex::new(driver.mms, 0.0)
        + Complex::new(1.0, 0.0) / (s * Complex::new(driver.cms, 0.0));
    let (zload, z_acoustic, z_radiator) = enclosure_load(driver, design, frequency);
    let z_mechanical = zms + zload;
    let reflected = Complex::new(driver.bl * driver.bl, 0.0) / ze;
    let denominator = z_mechanical + reflected;
    let cone_velocity = (Complex::new(driver.bl, 0.0) / ze) / denominator;
    let input_impedance = ze + Complex::new(driver.bl * driver.bl, 0.0) / z_mechanical;
    let front_volume_velocity = Complex::new(driver.sd_m2, 0.0) * cone_velocity;

    if matches!(design.kind, BoxKind::Vented | BoxKind::Passive) {
        let box_inflow = Complex::new(-front_volume_velocity.re, -front_volume_velocity.im);
        let pressure = box_inflow * z_acoustic;
        let radiator_velocity = z_radiator.map(|z| pressure / z).unwrap_or_default();
        let total_volume_velocity = front_volume_velocity + radiator_velocity;
        return ResponseAtFrequency {
            acoustic: pressure_proxy(total_volume_velocity, frequency),
            cone_velocity,
            input_impedance,
        };
    }

    ResponseAtFrequency {
        acoustic: pressure_proxy(front_volume_velocity, frequency),
        cone_velocity,
        input_impedance,
    }
}

fn enclosure_load(
    driver: &DerivedDriver,
    design: &Design,
    frequency: f64,
) -> (Complex, Complex, Option<Complex>) {
    let omega = TWO_PI * frequency;
    let s = Complex::new(0.0, omega);
    let cab = box_compliance(design.vb_l);

    match design.kind {
        BoxKind::Vented => {
            let fb = design.fb_hz.max(5.0);
            let ql = design.ql.clamp(2.0, 30.0);
            let map = 1.0 / ((TWO_PI * fb).powi(2) * cab);
            let rap = (TWO_PI * fb * map) / ql;
            let z_port = Complex::new(rap, 0.0) + s * Complex::new(map, 0.0);
            let y_box = s * Complex::new(cab, 0.0);
            let y_port = Complex::new(1.0, 0.0) / z_port;
            let z_acoustic = Complex::new(1.0, 0.0) / (y_box + y_port);
            (
                Complex::new(driver.sd_m2 * driver.sd_m2, 0.0) * z_acoustic,
                z_acoustic,
                Some(z_port),
            )
        }
        BoxKind::Passive => {
            let z_pr = passive_radiator_impedance(design, cab, s);
            let y_box = s * Complex::new(cab, 0.0);
            let y_pr = Complex::new(1.0, 0.0) / z_pr;
            let z_acoustic = Complex::new(1.0, 0.0) / (y_box + y_pr);
            (
                Complex::new(driver.sd_m2 * driver.sd_m2, 0.0) * z_acoustic,
                z_acoustic,
                Some(z_pr),
            )
        }
        BoxKind::Aperiodic => {
            let y_box = s * Complex::new(cab, 0.0);
            let y_leak = Complex::new(1.0 / design.aperiodic_ra.max(100.0), 0.0);
            let z_acoustic = Complex::new(1.0, 0.0) / (y_box + y_leak);
            (
                Complex::new(driver.sd_m2 * driver.sd_m2, 0.0) * z_acoustic,
                z_acoustic,
                None,
            )
        }
        BoxKind::Sealed => {
            let y_box = s * Complex::new(cab, 0.0);
            let z_acoustic = Complex::new(1.0, 0.0) / y_box;
            (
                Complex::new(driver.sd_m2 * driver.sd_m2, 0.0) * z_acoustic,
                z_acoustic,
                None,
            )
        }
    }
}

fn passive_radiator_impedance(design: &Design, cab: f64, s: Complex) -> Complex {
    let count = design.port_count.max(1.0).round();
    let sd = (design.pr_sd_cm2 / 10000.0).max(0.001);
    let mmp = (design.pr_mmp_g / 1000.0).max(0.001);
    let acoustic_mass = mmp / (count * sd * sd);
    let fb = 1.0 / (TWO_PI * (acoustic_mass * cab).sqrt());
    let qms = design.pr_qms.clamp(0.5, 50.0);
    let resistance = TWO_PI * fb * acoustic_mass / qms;
    Complex::new(resistance, 0.0) + s * Complex::new(acoustic_mass, 0.0)
}

fn passive_tuning(vb_l: f64, sd_cm2: f64, mmp_g: f64, count: f64) -> f64 {
    let cab = box_compliance(vb_l);
    let sd = (sd_cm2 / 10000.0).max(0.001);
    let mmp = (mmp_g / 1000.0).max(0.001);
    let acoustic_mass = mmp / (count.max(1.0).round() * sd * sd);
    1.0 / (TWO_PI * (acoustic_mass * cab).sqrt())
}

fn passive_mass_for_target(vb_l: f64, fb_hz: f64, sd_cm2: f64, count: f64) -> f64 {
    let cab = box_compliance(vb_l);
    let sd = (sd_cm2 / 10000.0).max(0.001);
    let acoustic_mass = 1.0 / ((TWO_PI * fb_hz.max(5.0)).powi(2) * cab);
    (acoustic_mass * count.max(1.0).round() * sd * sd * 1000.0).max(1.0)
}

fn box_compliance(vb_l: f64) -> f64 {
    (vb_l / 1000.0).max(0.001) / (RHO * SPEED_OF_SOUND * SPEED_OF_SOUND)
}

fn pressure_proxy(volume_velocity: Complex, frequency: f64) -> Complex {
    Complex::new(0.0, TWO_PI * frequency) * volume_velocity
}

fn reference_magnitude(driver: &DerivedDriver, design: &Design, frequencies: &[f64]) -> f64 {
    let mut values: Vec<f64> = frequencies
        .iter()
        .copied()
        .filter(|frequency| (120.0..=260.0).contains(frequency))
        .map(|frequency| {
            response_at_frequency(driver, design, frequency)
                .acoustic
                .abs()
        })
        .filter(|value| *value > 0.0)
        .collect();
    if values.is_empty() {
        return 1e-12;
    }
    values.sort_by(|left, right| left.total_cmp(right));
    values[values.len() / 2].max(1e-12)
}

fn sealed_for_qtc(driver: &Driver, qtc: f64) -> f64 {
    let ratio = (qtc / driver.qts.max(0.05)).powi(2) - 1.0;
    if ratio <= 0.0 {
        driver.vas_l * 4.0
    } else {
        driver.vas_l / ratio
    }
}

fn sealed_qtc(driver: &Driver, vb_l: f64) -> f64 {
    driver.qts * (1.0 + driver.vas_l / vb_l.max(0.1)).sqrt()
}

fn logspace(start: f64, end: f64, count: usize) -> Vec<f64> {
    let log_start = start.ln();
    let log_end = end.ln();
    (0..count)
        .map(|index| {
            let t = index as f64 / (count.saturating_sub(1)).max(1) as f64;
            (log_start + (log_end - log_start) * t).exp()
        })
        .collect()
}

fn db(value: f64) -> f64 {
    20.0 * value.max(1e-12).log10()
}

fn drive_voltage(power_w: f64, re_ohm: f64) -> f64 {
    (power_w.max(0.1) * re_ohm.max(0.2)).sqrt()
}

#[cfg(not(target_arch = "wasm32"))]
fn main() -> eframe::Result {
    let native_options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1320.0, 820.0])
            .with_min_inner_size([960.0, 620.0]),
        ..Default::default()
    };
    eframe::run_native(
        "SpeakerBuilder egui prototype",
        native_options,
        Box::new(|cc| Ok(Box::new(SpeakerBuilderApp::new(cc)))),
    )
}

#[cfg(target_arch = "wasm32")]
fn main() {
    use eframe::wasm_bindgen::JsCast as _;

    let web_options = eframe::WebOptions::default();
    wasm_bindgen_futures::spawn_local(async {
        let document = web_sys::window()
            .and_then(|window| window.document())
            .expect("No document");
        let canvas = document
            .get_element_by_id("speaker_builder_egui_canvas")
            .expect("Missing canvas")
            .dyn_into::<web_sys::HtmlCanvasElement>()
            .expect("Canvas element has wrong type");

        let start_result = eframe::WebRunner::new()
            .start(
                canvas,
                web_options,
                Box::new(|cc| Ok(Box::new(SpeakerBuilderApp::new(cc)))),
            )
            .await;

        if let Some(loading_text) = document.get_element_by_id("loading_text") {
            loading_text.remove();
        }
        if let Err(error) = start_result {
            panic!("Failed to start eframe: {error:?}");
        }
    });
}
