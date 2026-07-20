//! Vista de grafo estilo JSON Crack, renderizada nativamente con cairo.
//!
//! Muestra el documento del editor izquierdo como un árbol de tarjetas
//! `clave: valor` conectadas por curvas bezier (ver `crate::graph` para el
//! modelo y el layout, que son lógica pura). Este módulo solo dibuja e
//! interactúa: pan (arrastre), zoom (Ctrl+rueda y botones), zoom-to-fit,
//! búsqueda de nodos y selección con popover de detalle.

use gtk::cairo;
use gtk::prelude::*;
use gtk4 as gtk;
use libadwaita as adw;
use rust_i18n::t;

use std::cell::RefCell;
use std::rc::Rc;

use crate::graph::{Graph, GraphNode, LayoutConfig, NodeId, ValueKind, bounds};

// ─────────────────────────────────────────────
// Constantes de renderizado
// ─────────────────────────────────────────────

/// Tamaño de fuente (px) del texto de los nodos, en coordenadas de mundo.
const FONT_SIZE: f64 = 12.0;
/// Aire vertical extra por fila sobre la altura de la fuente.
const ROW_EXTRA: f64 = 6.0;
/// Radio de las esquinas redondeadas de los nodos.
const CORNER_RADIUS: f64 = 6.0;
/// Límites y paso del zoom.
const ZOOM_MIN: f64 = 0.05;
const ZOOM_MAX: f64 = 4.0;
const ZOOM_BTN_FACTOR: f64 = 1.2;
/// Píxeles de pan por "tick" de rueda sin Ctrl.
const SCROLL_PAN_STEP: f64 = 50.0;
/// Por debajo de este zoom no se dibuja texto (nivel de detalle).
const LOD_TEXT_ZOOM: f64 = 0.3;
/// Por debajo de este zoom no se dibujan etiquetas de arista.
const LOD_EDGE_LABEL_ZOOM: f64 = 0.45;

// ─────────────────────────────────────────────
// Paleta (claro / oscuro, colores GNOME)
// ─────────────────────────────────────────────

/// Colores del canvas para un tema concreto.
struct Palette {
    background: (f64, f64, f64),
    node_fill: (f64, f64, f64),
    node_border: (f64, f64, f64),
    node_selected: (f64, f64, f64),
    node_match: (f64, f64, f64),
    edge: (f64, f64, f64),
    key: (f64, f64, f64),
    string: (f64, f64, f64),
    number: (f64, f64, f64),
    boolean: (f64, f64, f64),
    null: (f64, f64, f64),
    reference: (f64, f64, f64),
    text: (f64, f64, f64),
}

/// Convierte `0xRRGGBB` a componentes cairo (0.0–1.0).
fn rgb(hex: u32) -> (f64, f64, f64) {
    (
        ((hex >> 16) & 0xFF) as f64 / 255.0,
        ((hex >> 8) & 0xFF) as f64 / 255.0,
        (hex & 0xFF) as f64 / 255.0,
    )
}

fn palette(dark: bool) -> Palette {
    if dark {
        Palette {
            background: rgb(0x242424),
            node_fill: rgb(0x303030),
            node_border: rgb(0x4a4a4a),
            node_selected: rgb(0x3584e4),
            node_match: rgb(0xe5a50a),
            edge: rgb(0x5e5c64),
            key: rgb(0x9a9996),
            string: rgb(0x8ff0a4),
            number: rgb(0x99c1f1),
            boolean: rgb(0xdc8add),
            null: rgb(0xffbe6f),
            reference: rgb(0x77767b),
            text: rgb(0xdeddda),
        }
    } else {
        Palette {
            background: rgb(0xfafafa),
            node_fill: rgb(0xffffff),
            node_border: rgb(0xd3d2d4),
            node_selected: rgb(0x3584e4),
            node_match: rgb(0xe5a50a),
            edge: rgb(0xb8b6bc),
            key: rgb(0x77767b),
            string: rgb(0x26a269),
            number: rgb(0x1c71d8),
            boolean: rgb(0x813d9c),
            null: rgb(0xe66100),
            reference: rgb(0x9a9996),
            text: rgb(0x3d3846),
        }
    }
}

impl Palette {
    fn value_color(&self, kind: ValueKind) -> (f64, f64, f64) {
        match kind {
            ValueKind::String => self.string,
            ValueKind::Number => self.number,
            ValueKind::Bool => self.boolean,
            ValueKind::Null => self.null,
            ValueKind::ObjectRef | ValueKind::ArrayRef => self.reference,
            ValueKind::Text => self.text,
        }
    }
}

// ─────────────────────────────────────────────
// Estado interno del canvas
// ─────────────────────────────────────────────

struct ViewState {
    graph: Graph,
    zoom: f64,
    pan: (f64, f64),
    /// Pan al comenzar el arrastre (para acumular el offset del gesto).
    drag_start_pan: (f64, f64),
    /// Última posición conocida del puntero (ancla del zoom con rueda).
    pointer: (f64, f64),
    selected: Option<NodeId>,
    matches: Vec<NodeId>,
    match_idx: usize,
    query: String,
    dark: bool,
    /// Pendiente de aplicar zoom-to-fit en el próximo draw (cuando el
    /// DrawingArea aún no tenía tamaño asignado al llegar el grafo).
    fit_pending: bool,
}

impl ViewState {
    /// Recalcula los nodos que coinciden con la búsqueda actual.
    fn recompute_matches(&mut self) {
        self.matches.clear();
        self.match_idx = 0;
        let query = self.query.trim().to_lowercase();
        if query.is_empty() {
            return;
        }
        for node in &self.graph.nodes {
            let hit = node.label.to_lowercase().contains(&query)
                || node
                    .rows
                    .iter()
                    .any(|r| r.key.to_lowercase().contains(&query) || r.value.to_lowercase().contains(&query));
            if hit {
                self.matches.push(node.id);
            }
        }
    }
}

// ─────────────────────────────────────────────
// Widget
// ─────────────────────────────────────────────

/// Panel de vista de grafo (convención de `DiffPanel`: struct plano con
/// `widget` raíz público, construido con `new()` y alimentado con `update()`).
pub struct GraphView {
    /// Contenedor raíz: toolbar + stack (canvas | estado vacío).
    pub widget: gtk::Box,
    drawing_area: gtk::DrawingArea,
    inner_stack: gtk::Stack,
    empty_page: adw::StatusPage,
    detail_popover: gtk::Popover,
    detail_label: gtk::Label,
    state: Rc<RefCell<ViewState>>,
    /// Configuración de layout con las métricas reales de la fuente.
    layout_cfg: LayoutConfig,
}

impl Default for GraphView {
    fn default() -> Self {
        Self::new()
    }
}

impl GraphView {
    pub fn new() -> Self {
        let state = Rc::new(RefCell::new(ViewState {
            graph: Graph::default(),
            zoom: 1.0,
            pan: (0.0, 0.0),
            drag_start_pan: (0.0, 0.0),
            pointer: (0.0, 0.0),
            selected: None,
            matches: Vec::new(),
            match_idx: 0,
            query: String::new(),
            dark: adw::StyleManager::default().is_dark(),
            fit_pending: false,
        }));

        let layout_cfg = LayoutConfig {
            metrics: measure_font_metrics(),
            ..LayoutConfig::default()
        };

        // ── Canvas ──────────────────────────────
        let drawing_area = gtk::DrawingArea::new();
        drawing_area.set_hexpand(true);
        drawing_area.set_vexpand(true);
        drawing_area.set_focusable(true);

        // ── Popover de detalle de nodo ──────────
        let detail_label = gtk::Label::new(None);
        detail_label.set_selectable(true);
        detail_label.set_wrap(true);
        detail_label.set_max_width_chars(60);
        detail_label.set_margin_top(8);
        detail_label.set_margin_bottom(8);
        detail_label.set_margin_start(8);
        detail_label.set_margin_end(8);
        detail_label.add_css_class("monospace");

        let detail_popover = gtk::Popover::new();
        detail_popover.set_parent(&drawing_area);
        detail_popover.set_child(Some(&detail_label));
        detail_popover.set_autohide(true);

        // ── Toolbar: búsqueda + zoom ────────────
        let search_entry = gtk::SearchEntry::new();
        search_entry.set_placeholder_text(Some(&t!("graph.search_placeholder")));
        search_entry.set_hexpand(true);

        let btn_zoom_out = gtk::Button::from_icon_name("zoom-out-symbolic");
        btn_zoom_out.set_tooltip_text(Some(&t!("graph.zoom_out_tooltip")));
        btn_zoom_out.add_css_class("flat");

        let btn_zoom_in = gtk::Button::from_icon_name("zoom-in-symbolic");
        btn_zoom_in.set_tooltip_text(Some(&t!("graph.zoom_in_tooltip")));
        btn_zoom_in.add_css_class("flat");

        let btn_zoom_fit = gtk::Button::from_icon_name("zoom-fit-best-symbolic");
        btn_zoom_fit.set_tooltip_text(Some(&t!("graph.zoom_fit_tooltip")));
        btn_zoom_fit.add_css_class("flat");

        let toolbar = gtk::Box::new(gtk::Orientation::Horizontal, 4);
        toolbar.add_css_class("graph-toolbar");
        toolbar.append(&search_entry);
        toolbar.append(&btn_zoom_out);
        toolbar.append(&btn_zoom_in);
        toolbar.append(&btn_zoom_fit);

        // ── Estado vacío (formato no soportado, editor vacío) ─
        let empty_page = adw::StatusPage::new();
        empty_page.set_icon_name(Some("network-workgroup-symbolic"));
        empty_page.set_title(&t!("graph.empty_title"));
        empty_page.set_description(Some(&t!("graph.empty_desc")));

        let inner_stack = gtk::Stack::new();
        inner_stack.add_named(&drawing_area, Some("canvas"));
        inner_stack.add_named(&empty_page, Some("empty"));
        inner_stack.set_visible_child_name("empty");

        let container = gtk::Box::new(gtk::Orientation::Vertical, 0);
        container.add_css_class("graph-panel");
        container.append(&toolbar);
        container.append(&inner_stack);

        let view = Self {
            widget: container,
            drawing_area,
            inner_stack,
            empty_page,
            detail_popover,
            detail_label,
            state,
            layout_cfg,
        };

        view.setup_draw_func();
        view.setup_pan_gesture();
        view.setup_scroll_zoom();
        view.setup_click_selection();
        view.setup_search(&search_entry);
        view.setup_zoom_buttons(&btn_zoom_out, &btn_zoom_in, &btn_zoom_fit);
        view.setup_dark_mode_watch();

        view
    }

    /// Configuración de layout con las métricas reales del canvas; el
    /// llamador debe usarla con `graph::layout` antes de `update()` para
    /// que el dibujo y el layout compartan la misma geometría.
    pub fn layout_config(&self) -> LayoutConfig {
        self.layout_cfg
    }

    /// Muestra un grafo ya posicionado. Conserva pan/zoom del usuario si ya
    /// había un grafo visible (edición en vivo); si no, aplica zoom-to-fit.
    pub fn update(&self, graph: Graph) {
        {
            let mut s = self.state.borrow_mut();
            let first_graph = s.graph.nodes.is_empty();
            s.selected = None;
            s.graph = graph;
            s.recompute_matches();
            if first_graph {
                s.fit_pending = true;
            }
        }
        self.detail_popover.popdown();
        self.inner_stack.set_visible_child_name("canvas");
        self.drawing_area.queue_draw();
    }

    /// Muestra el estado vacío con el mensaje dado y descarta el grafo.
    pub fn show_empty(&self, title: &str, description: &str) {
        self.clear();
        self.empty_page.set_title(title);
        self.empty_page.set_description(Some(description));
    }

    /// Descarta el grafo actual y vuelve al estado vacío por defecto.
    pub fn clear(&self) {
        {
            let mut s = self.state.borrow_mut();
            s.graph = Graph::default();
            s.selected = None;
            s.matches.clear();
            s.zoom = 1.0;
            s.pan = (0.0, 0.0);
        }
        self.detail_popover.popdown();
        self.inner_stack.set_visible_child_name("empty");
    }

    /// Ajusta zoom y pan para encuadrar el grafo completo en el canvas.
    pub fn zoom_to_fit(&self) {
        let width = self.drawing_area.width() as f64;
        let height = self.drawing_area.height() as f64;
        apply_fit(&mut self.state.borrow_mut(), width, height);
        self.drawing_area.queue_draw();
    }

    // ─────────────────────────────────────────
    // Interacción
    // ─────────────────────────────────────────

    fn setup_draw_func(&self) {
        let state = self.state.clone();
        let cfg = self.layout_cfg;
        self.drawing_area.set_draw_func(move |_, cr, width, height| {
            let mut s = state.borrow_mut();
            if s.fit_pending && width > 0 {
                apply_fit(&mut s, width as f64, height as f64);
                s.fit_pending = false;
            }
            draw_graph(&s, &cfg, cr, width as f64, height as f64);
        });
    }

    /// Pan con arrastre (cualquier botón del ratón).
    fn setup_pan_gesture(&self) {
        let drag = gtk::GestureDrag::new();
        drag.set_button(0); // cualquier botón

        {
            let state = self.state.clone();
            drag.connect_drag_begin(move |_, _, _| {
                let mut s = state.borrow_mut();
                s.drag_start_pan = s.pan;
            });
        }
        {
            let state = self.state.clone();
            let area = self.drawing_area.clone();
            drag.connect_drag_update(move |_, dx, dy| {
                let mut s = state.borrow_mut();
                s.pan = (s.drag_start_pan.0 + dx, s.drag_start_pan.1 + dy);
                drop(s);
                area.queue_draw();
            });
        }
        self.drawing_area.add_controller(drag);
    }

    /// Rueda: Ctrl = zoom anclado al puntero; sin Ctrl = pan (Shift = horizontal).
    fn setup_scroll_zoom(&self) {
        // Rastrear el puntero para anclar el zoom en su posición.
        let motion = gtk::EventControllerMotion::new();
        {
            let state = self.state.clone();
            motion.connect_motion(move |_, x, y| {
                state.borrow_mut().pointer = (x, y);
            });
        }
        self.drawing_area.add_controller(motion);

        let scroll = gtk::EventControllerScroll::new(gtk::EventControllerScrollFlags::BOTH_AXES);
        let state = self.state.clone();
        let area = self.drawing_area.clone();
        scroll.connect_scroll(move |ctrl, dx, dy| {
            let modifier = ctrl
                .current_event()
                .map(|e| e.modifier_state())
                .unwrap_or_else(gtk::gdk::ModifierType::empty);

            let mut s = state.borrow_mut();
            if modifier.contains(gtk::gdk::ModifierType::CONTROL_MASK) {
                // Zoom manteniendo fijo el punto del mundo bajo el puntero.
                let factor = ZOOM_BTN_FACTOR.powf(-dy);
                let new_zoom = (s.zoom * factor).clamp(ZOOM_MIN, ZOOM_MAX);
                let applied = new_zoom / s.zoom;
                let (px, py) = s.pointer;
                s.pan = (px - (px - s.pan.0) * applied, py - (py - s.pan.1) * applied);
                s.zoom = new_zoom;
            } else if modifier.contains(gtk::gdk::ModifierType::SHIFT_MASK) {
                // Shift+rueda vertical = pan horizontal.
                s.pan.0 -= (dx + dy) * SCROLL_PAN_STEP;
            } else {
                s.pan.0 -= dx * SCROLL_PAN_STEP;
                s.pan.1 -= dy * SCROLL_PAN_STEP;
            }
            drop(s);
            area.queue_draw();
            gtk::glib::Propagation::Stop
        });
        self.drawing_area.add_controller(scroll);
    }

    /// Click primario: selecciona el nodo bajo el puntero y abre el popover.
    fn setup_click_selection(&self) {
        let click = gtk::GestureClick::new();
        click.set_button(gtk::gdk::BUTTON_PRIMARY);

        let state = self.state.clone();
        let area = self.drawing_area.clone();
        let popover = self.detail_popover.clone();
        let label = self.detail_label.clone();
        click.connect_pressed(move |_, _, x, y| {
            let detail = {
                let mut s = state.borrow_mut();
                let wx = (x - s.pan.0) / s.zoom;
                let wy = (y - s.pan.1) / s.zoom;
                let hit = s
                    .graph
                    .nodes
                    .iter()
                    .rev()
                    .find(|n| wx >= n.x && wx <= n.x + n.width && wy >= n.y && wy <= n.y + n.height)
                    .map(|n| (n.id, node_detail_text(n)));
                s.selected = hit.as_ref().map(|(id, _)| *id);
                hit.map(|(_, text)| text)
            };

            match detail {
                Some(text) => {
                    label.set_text(&text);
                    popover.set_pointing_to(Some(&gtk::gdk::Rectangle::new(x as i32, y as i32, 1, 1)));
                    popover.popup();
                }
                None => popover.popdown(),
            }
            area.queue_draw();
        });
        self.drawing_area.add_controller(click);
    }

    /// Búsqueda: resalta coincidencias; Enter cicla y centra; Esc limpia.
    fn setup_search(&self, entry: &gtk::SearchEntry) {
        {
            let state = self.state.clone();
            let area = self.drawing_area.clone();
            entry.connect_search_changed(move |e| {
                let mut s = state.borrow_mut();
                s.query = e.text().to_string();
                s.recompute_matches();
                if let Some(&first) = s.matches.first() {
                    center_on_node(&mut s, first, area.width() as f64, area.height() as f64);
                }
                drop(s);
                area.queue_draw();
            });
        }
        {
            let state = self.state.clone();
            let area = self.drawing_area.clone();
            entry.connect_activate(move |_| {
                let mut s = state.borrow_mut();
                if s.matches.is_empty() {
                    return;
                }
                s.match_idx = (s.match_idx + 1) % s.matches.len();
                let id = s.matches[s.match_idx];
                center_on_node(&mut s, id, area.width() as f64, area.height() as f64);
                drop(s);
                area.queue_draw();
            });
        }
        {
            let state = self.state.clone();
            let area = self.drawing_area.clone();
            entry.connect_stop_search(move |e| {
                e.set_text("");
                let mut s = state.borrow_mut();
                s.query.clear();
                s.recompute_matches();
                drop(s);
                area.queue_draw();
            });
        }
    }

    fn setup_zoom_buttons(&self, btn_out: &gtk::Button, btn_in: &gtk::Button, btn_fit: &gtk::Button) {
        for (btn, factor) in [(btn_out, 1.0 / ZOOM_BTN_FACTOR), (btn_in, ZOOM_BTN_FACTOR)] {
            let state = self.state.clone();
            let area = self.drawing_area.clone();
            btn.connect_clicked(move |_| {
                let mut s = state.borrow_mut();
                let new_zoom = (s.zoom * factor).clamp(ZOOM_MIN, ZOOM_MAX);
                let applied = new_zoom / s.zoom;
                // Anclar en el centro del canvas.
                let (cx, cy) = (area.width() as f64 / 2.0, area.height() as f64 / 2.0);
                s.pan = (cx - (cx - s.pan.0) * applied, cy - (cy - s.pan.1) * applied);
                s.zoom = new_zoom;
                drop(s);
                area.queue_draw();
            });
        }
        {
            let state = self.state.clone();
            let area = self.drawing_area.clone();
            btn_fit.connect_clicked(move |_| {
                apply_fit(&mut state.borrow_mut(), area.width() as f64, area.height() as f64);
                area.queue_draw();
            });
        }
    }

    /// Cambia la paleta en vivo cuando el sistema alterna claro/oscuro.
    fn setup_dark_mode_watch(&self) {
        let state = self.state.clone();
        let area = self.drawing_area.clone();
        adw::StyleManager::default().connect_dark_notify(move |sm| {
            state.borrow_mut().dark = sm.is_dark();
            area.queue_draw();
        });
    }
}

// ─────────────────────────────────────────────
// Funciones auxiliares (sin estado)
// ─────────────────────────────────────────────

/// Mide el ancho de carácter y alto de fila de la fuente monoespaciada
/// usando una superficie cairo de 1×1 (fuera del draw path).
fn measure_font_metrics() -> crate::graph::FontMetrics {
    let fallback = crate::graph::FontMetrics {
        char_width: 7.2,
        row_height: FONT_SIZE + ROW_EXTRA,
    };
    let Ok(surface) = cairo::ImageSurface::create(cairo::Format::ARgb32, 1, 1) else {
        return fallback;
    };
    let Ok(cr) = cairo::Context::new(&surface) else {
        return fallback;
    };
    select_node_font(&cr);
    let char_width = cr
        .text_extents("M")
        .map(|e| e.x_advance())
        .unwrap_or(fallback.char_width);
    let row_height = cr
        .font_extents()
        .map(|e| e.height() + ROW_EXTRA)
        .unwrap_or(fallback.row_height);
    crate::graph::FontMetrics { char_width, row_height }
}

fn select_node_font(cr: &cairo::Context) {
    cr.select_font_face("monospace", cairo::FontSlant::Normal, cairo::FontWeight::Normal);
    cr.set_font_size(FONT_SIZE);
}

/// Zoom-to-fit: encuadra el bounding box del grafo con un 10% de margen.
fn apply_fit(s: &mut ViewState, width: f64, height: f64) {
    let (min_x, min_y, max_x, max_y) = bounds(&s.graph);
    let (bw, bh) = (max_x - min_x, max_y - min_y);
    if bw <= 0.0 || bh <= 0.0 || width <= 0.0 || height <= 0.0 {
        s.zoom = 1.0;
        s.pan = (0.0, 0.0);
        return;
    }
    s.zoom = (0.9 * (width / bw).min(height / bh)).clamp(ZOOM_MIN, 1.5);
    let (cx, cy) = ((min_x + max_x) / 2.0, (min_y + max_y) / 2.0);
    s.pan = (width / 2.0 - cx * s.zoom, height / 2.0 - cy * s.zoom);
}

/// Centra el canvas en un nodo (usado por la búsqueda).
fn center_on_node(s: &mut ViewState, id: NodeId, width: f64, height: f64) {
    let Some(node) = s.graph.nodes.get(id) else { return };
    let (cx, cy) = (node.x + node.width / 2.0, node.y + node.height / 2.0);
    s.pan = (width / 2.0 - cx * s.zoom, height / 2.0 - cy * s.zoom);
}

/// Texto plano del popover de detalle: label del nodo + todas sus filas.
fn node_detail_text(node: &GraphNode) -> String {
    let mut out = String::new();
    if !node.label.is_empty() {
        out.push_str(&node.label);
        out.push('\n');
    }
    for row in &node.rows {
        if row.key.is_empty() {
            out.push_str(&row.value);
        } else {
            out.push_str(&format!("{}: {}", row.key, row.value));
        }
        out.push('\n');
    }
    out.trim_end().to_string()
}

/// Traza un rectángulo redondeado como path actual del contexto.
fn rounded_rect(cr: &cairo::Context, x: f64, y: f64, w: f64, h: f64, r: f64) {
    let r = r.min(w / 2.0).min(h / 2.0);
    cr.new_sub_path();
    cr.arc(x + w - r, y + r, r, -std::f64::consts::FRAC_PI_2, 0.0);
    cr.arc(x + w - r, y + h - r, r, 0.0, std::f64::consts::FRAC_PI_2);
    cr.arc(x + r, y + h - r, r, std::f64::consts::FRAC_PI_2, std::f64::consts::PI);
    cr.arc(x + r, y + r, r, std::f64::consts::PI, 1.5 * std::f64::consts::PI);
    cr.close_path();
}

fn set_color(cr: &cairo::Context, (r, g, b): (f64, f64, f64)) {
    cr.set_source_rgb(r, g, b);
}

/// Dibuja el grafo completo: fondo, aristas y nodos, con culling del
/// viewport y nivel de detalle según el zoom.
fn draw_graph(s: &ViewState, cfg: &LayoutConfig, cr: &cairo::Context, width: f64, height: f64) {
    let colors = palette(s.dark);

    set_color(cr, colors.background);
    let _ = cr.paint();

    if s.graph.nodes.is_empty() {
        return;
    }

    cr.save().ok();
    cr.translate(s.pan.0, s.pan.1);
    cr.scale(s.zoom, s.zoom);
    select_node_font(cr);

    // Viewport en coordenadas de mundo (para culling).
    let vx0 = -s.pan.0 / s.zoom;
    let vy0 = -s.pan.1 / s.zoom;
    let vx1 = vx0 + width / s.zoom;
    let vy1 = vy0 + height / s.zoom;

    draw_edges(s, cfg, cr, &colors, (vx0, vy0, vx1, vy1));
    draw_nodes(s, cfg, cr, &colors, (vx0, vy0, vx1, vy1));

    cr.restore().ok();
}

/// Punto de anclaje de una arista en el borde derecho del padre: centro de
/// la fila de referencia si existe, o centro vertical del nodo.
fn edge_anchor_y(node: &GraphNode, from_row: Option<usize>, cfg: &LayoutConfig) -> f64 {
    match from_row {
        Some(row) if row < node.rows.len() => node.y + cfg.node_padding + (row as f64 + 0.5) * cfg.metrics.row_height,
        _ => node.y + node.height / 2.0,
    }
}

fn draw_edges(
    s: &ViewState,
    cfg: &LayoutConfig,
    cr: &cairo::Context,
    colors: &Palette,
    viewport: (f64, f64, f64, f64),
) {
    let (vx0, vy0, vx1, vy1) = viewport;
    cr.set_line_width((1.2 / s.zoom).clamp(0.6, 2.5));

    for edge in &s.graph.edges {
        let from = &s.graph.nodes[edge.from];
        let to = &s.graph.nodes[edge.to];
        let x1 = from.x + from.width;
        let y1 = edge_anchor_y(from, edge.from_row, cfg);
        let x2 = to.x;
        let y2 = to.y + to.height / 2.0;

        // Culling por bounding box de la curva.
        if x1.max(x2) < vx0 || x1.min(x2) > vx1 || y1.max(y2) < vy0 || y1.min(y2) > vy1 {
            continue;
        }

        let cx = (x1 + x2) / 2.0;
        set_color(cr, colors.edge);
        cr.move_to(x1, y1);
        cr.curve_to(cx, y1, cx, y2, x2, y2);
        let _ = cr.stroke();

        // Etiqueta de la arista en el punto medio de la curva.
        if s.zoom >= LOD_EDGE_LABEL_ZOOM && !edge.label.is_empty() {
            set_color(cr, colors.key);
            if let Ok(ext) = cr.text_extents(&edge.label) {
                cr.move_to(cx - ext.width() / 2.0, (y1 + y2) / 2.0 - 4.0);
                let _ = cr.show_text(&edge.label);
            }
        }
    }
}

fn draw_nodes(
    s: &ViewState,
    cfg: &LayoutConfig,
    cr: &cairo::Context,
    colors: &Palette,
    viewport: (f64, f64, f64, f64),
) {
    let (vx0, vy0, vx1, vy1) = viewport;

    for node in &s.graph.nodes {
        // Culling: saltar nodos completamente fuera del viewport.
        if node.x + node.width < vx0 || node.x > vx1 || node.y + node.height < vy0 || node.y > vy1 {
            continue;
        }

        let selected = s.selected == Some(node.id);
        let matched = s.matches.contains(&node.id);

        rounded_rect(cr, node.x, node.y, node.width, node.height, CORNER_RADIUS);
        set_color(cr, colors.node_fill);
        let _ = cr.fill_preserve();
        if selected {
            set_color(cr, colors.node_selected);
            cr.set_line_width(2.0 / s.zoom.max(0.5));
        } else if matched {
            set_color(cr, colors.node_match);
            cr.set_line_width(2.0 / s.zoom.max(0.5));
        } else {
            set_color(cr, colors.node_border);
            cr.set_line_width(1.0);
        }
        let _ = cr.stroke();

        // Nivel de detalle: sin texto cuando el zoom es muy pequeño.
        if s.zoom < LOD_TEXT_ZOOM {
            continue;
        }

        // Filas, recortadas al rectángulo del nodo.
        cr.save().ok();
        rounded_rect(cr, node.x, node.y, node.width, node.height, CORNER_RADIUS);
        cr.clip();
        for (i, row) in node.rows.iter().enumerate() {
            let baseline = node.y + cfg.node_padding + (i as f64 + 0.78) * cfg.metrics.row_height;
            let mut x = node.x + cfg.node_padding;
            if !row.key.is_empty() {
                set_color(cr, colors.key);
                cr.move_to(x, baseline);
                let _ = cr.show_text(&format!("{}:", row.key));
                x += (row.key.chars().count() + 2) as f64 * cfg.metrics.char_width;
            }
            set_color(cr, colors.value_color(row.kind));
            cr.move_to(x, baseline);
            let _ = cr.show_text(&row.value);
        }
        cr.restore().ok();
    }
}

/// CSS propio de la vista de grafo (se concatena en `load_css`).
pub fn graph_css() -> &'static str {
    r#"
    .graph-toolbar {
        padding: 4px 8px;
        border-bottom: 1px solid alpha(currentColor, 0.15);
    }
    "#
}
