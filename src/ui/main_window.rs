//! Ventana principal de RustDiff.
//!
//! Layout completo con historial lateral:
//! ┌──────────────────────────────────────────────────────┐
//! │  HeaderBar: [Abrir Izq] [Abrir Der] [Comparar]       │
//! │  [Formato▼] [Formatear] [Exportar▼] [Historial]      │
//! ├──────┬───────────────────┬────────────────────────────┤
//! │ Hist │  Panel Izquierdo  │  Panel Derecho              │
//! │ orial│  SourceView       │  SourceView                 │
//! │      ├───────────────────┴────────────────────────────┤
//! │      │  Panel de Diferencias (tabla scrollable)        │
//! ├──────┴────────────────────────────────────────────────┤
//! │  StatusBar: "X diferencias | JSON | Ctrl+S guardar"   │
//! └──────────────────────────────────────────────────────┘

use gtk4 as gtk;
use gtk::prelude::*;
use libadwaita as adw;
use sourceview5 as sv;
use sv::prelude::*;

use std::cell::RefCell;
use std::rc::Rc;
use std::time::Duration;

use crate::diff_engine::{diff_json, diff_xml, DiffResult};
use crate::export;
use crate::parser::{auto_detect_format, format_pretty, parse_json, parse_xml, Format};
use crate::storage::{DiffSummary, Storage};
use crate::ui::diff_panel::{diff_css, DiffItemObject, DiffPanel};
use crate::ui::highlighter;

// ─────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────

const DEBOUNCE_MS: u64 = 500;

// ─────────────────────────────────────────────
// Ventana principal
// ─────────────────────────────────────────────

pub struct MainWindow {
    pub window: adw::ApplicationWindow,
    left_view: sv::View,
    right_view: sv::View,
    diff_panel: Rc<DiffPanel>,
    status_label: gtk::Label,
    format_dropdown: gtk::DropDown,
    /// Último resultado de diff (para exportar y guardar sesión).
    last_diff: Rc<RefCell<Option<(DiffResult, Format)>>>,
    /// Conexión a la base de datos de historial.
    storage: Rc<RefCell<Option<Storage>>>,
    /// ListBox del panel de historial.
    history_list: gtk::ListBox,
    /// Panel lateral de historial (para toggle visibilidad).
    history_panel: gtk::Box,
}

impl MainWindow {
    pub fn new(app: &adw::Application) -> Self {
        load_css();

        // ── Inicializar storage ─────────────────
        let storage = match Storage::open_default() {
            Ok(s) => {
                tracing::info!("Base de datos de historial abierta");
                Some(s)
            }
            Err(e) => {
                tracing::warn!("No se pudo abrir historial: {e}");
                None
            }
        };

        // ── Editores SourceView ─────────────────
        let left_view = create_source_view();
        let right_view = create_source_view();

        // ── Panel de diferencias ────────────────
        let diff_panel = Rc::new(DiffPanel::new());

        // ── Barra de estado ─────────────────────
        let status_label = gtk::Label::new(Some(
            "Listo — Ctrl+O abrir | Ctrl+Enter comparar | Ctrl+S guardar sesión",
        ));
        status_label.set_halign(gtk::Align::Start);
        status_label.set_margin_start(8);
        status_label.set_margin_end(8);
        status_label.set_margin_top(4);
        status_label.set_margin_bottom(4);
        status_label.add_css_class("dim-label");

        // ── Dropdown de formato ─────────────────
        let formats = gtk::StringList::new(&["Auto-detectar", "JSON", "XML"]);
        let format_dropdown = gtk::DropDown::new(Some(formats), gtk::Expression::NONE);
        format_dropdown.set_selected(0);
        format_dropdown.set_tooltip_text(Some("Formato del documento"));

        // ── Botones de la HeaderBar ─────────────
        let btn_open_left = gtk::Button::with_label("Abrir Izq");
        btn_open_left.set_tooltip_text(Some("Abrir archivo en panel izquierdo (Ctrl+O)"));
        btn_open_left.add_css_class("flat");

        let btn_open_right = gtk::Button::with_label("Abrir Der");
        btn_open_right.set_tooltip_text(Some("Abrir archivo en panel derecho (Ctrl+Shift+O)"));
        btn_open_right.add_css_class("flat");

        let btn_compare = gtk::Button::with_label("Comparar");
        btn_compare.set_tooltip_text(Some("Comparar documentos (Ctrl+Enter)"));
        btn_compare.add_css_class("suggested-action");

        let btn_format = gtk::Button::with_label("Formatear");
        btn_format.set_tooltip_text(Some("Pretty-print ambos documentos (Ctrl+Shift+F)"));
        btn_format.add_css_class("flat");

        // ── Botón Exportar con menú ─────────────
        let export_menu = gtk::gio::Menu::new();
        export_menu.append(Some("Exportar como .txt"), Some("win.export-txt"));
        export_menu.append(Some("Exportar como .html"), Some("win.export-html"));

        let btn_export = gtk::MenuButton::new();
        btn_export.set_label("Exportar");
        btn_export.set_menu_model(Some(&export_menu));
        btn_export.set_tooltip_text(Some("Exportar resultado (Ctrl+E)"));
        btn_export.add_css_class("flat");

        // ── Botón Historial toggle ──────────────
        let btn_history = gtk::ToggleButton::with_label("Historial");
        btn_history.set_tooltip_text(Some("Mostrar/ocultar historial de sesiones (Ctrl+H)"));
        btn_history.add_css_class("flat");

        // ── HeaderBar ───────────────────────────
        let header = adw::HeaderBar::new();
        header.pack_start(&btn_open_left);
        header.pack_start(&btn_open_right);
        header.pack_start(&format_dropdown);
        header.pack_end(&btn_compare);
        header.pack_end(&btn_format);
        header.pack_end(&btn_export);
        header.pack_end(&btn_history);

        // ── Panel de historial (lateral izq) ────
        let history_list = gtk::ListBox::new();
        history_list.set_selection_mode(gtk::SelectionMode::Single);
        history_list.add_css_class("navigation-sidebar");

        let history_scroll = gtk::ScrolledWindow::builder()
            .hscrollbar_policy(gtk::PolicyType::Never)
            .vscrollbar_policy(gtk::PolicyType::Automatic)
            .vexpand(true)
            .min_content_width(200)
            .child(&history_list)
            .build();

        let history_header = gtk::Label::new(Some("Sesiones guardadas"));
        history_header.add_css_class("heading");
        history_header.set_margin_top(8);
        history_header.set_margin_bottom(4);

        let history_panel = gtk::Box::new(gtk::Orientation::Vertical, 0);
        history_panel.set_width_request(220);
        history_panel.append(&history_header);
        history_panel.append(&history_scroll);
        history_panel.add_css_class("sidebar");
        history_panel.set_visible(false); // Oculto por defecto

        // ── Scroll wrappers para los editores ───
        let left_scroll = gtk::ScrolledWindow::builder()
            .hscrollbar_policy(gtk::PolicyType::Automatic)
            .vscrollbar_policy(gtk::PolicyType::Automatic)
            .vexpand(true)
            .hexpand(true)
            .child(&left_view)
            .build();

        let right_scroll = gtk::ScrolledWindow::builder()
            .hscrollbar_policy(gtk::PolicyType::Automatic)
            .vscrollbar_policy(gtk::PolicyType::Automatic)
            .vexpand(true)
            .hexpand(true)
            .child(&right_view)
            .build();

        // ── Labels de panel ─────────────────────
        let left_box = gtk::Box::new(gtk::Orientation::Vertical, 0);
        let left_label = gtk::Label::new(Some("Documento Izquierdo"));
        left_label.add_css_class("heading");
        left_label.set_margin_top(4);
        left_label.set_margin_bottom(4);
        left_box.append(&left_label);
        left_box.append(&left_scroll);

        let right_box = gtk::Box::new(gtk::Orientation::Vertical, 0);
        let right_label = gtk::Label::new(Some("Documento Derecho"));
        right_label.add_css_class("heading");
        right_label.set_margin_top(4);
        right_label.set_margin_bottom(4);
        right_box.append(&right_label);
        right_box.append(&right_scroll);

        // ── Split horizontal editores 50/50 ─────
        let editors_paned = gtk::Paned::new(gtk::Orientation::Horizontal);
        editors_paned.set_start_child(Some(&left_box));
        editors_paned.set_end_child(Some(&right_box));
        editors_paned.set_resize_start_child(true);
        editors_paned.set_resize_end_child(true);
        editors_paned.set_shrink_start_child(false);
        editors_paned.set_shrink_end_child(false);
        editors_paned.set_vexpand(true);

        // ── Split vertical: editores arriba, diff abajo
        let main_paned = gtk::Paned::new(gtk::Orientation::Vertical);
        main_paned.set_start_child(Some(&editors_paned));
        main_paned.set_end_child(Some(&diff_panel.widget));
        main_paned.set_resize_start_child(true);
        main_paned.set_resize_end_child(true);
        main_paned.set_shrink_start_child(false);
        main_paned.set_shrink_end_child(false);
        main_paned.set_position(450);

        // ── Layout con historial lateral ────────
        let content_with_sidebar = gtk::Box::new(gtk::Orientation::Horizontal, 0);
        content_with_sidebar.append(&history_panel);
        content_with_sidebar.append(&main_paned);

        // ── Layout vertical: header + contenido + status
        let toolbar_view = adw::ToolbarView::new();
        toolbar_view.add_top_bar(&header);
        toolbar_view.set_content(Some(&content_with_sidebar));

        let outer_box = gtk::Box::new(gtk::Orientation::Vertical, 0);
        outer_box.append(&toolbar_view);
        outer_box.append(&status_label);

        // ── Ventana principal ───────────────────
        let window = adw::ApplicationWindow::builder()
            .application(app)
            .title("RustDiff — Comparador Semántico")
            .default_width(1200)
            .default_height(800)
            .content(&outer_box)
            .build();

        let main_win = Self {
            window,
            left_view,
            right_view,
            diff_panel,
            status_label,
            format_dropdown,
            last_diff: Rc::new(RefCell::new(None)),
            storage: Rc::new(RefCell::new(storage)),
            history_list,
            history_panel,
        };

        // ── Conectar señales ────────────────────
        main_win.connect_compare_button(&btn_compare);
        main_win.connect_format_button(&btn_format);
        main_win.connect_open_buttons(&btn_open_left, &btn_open_right);
        main_win.connect_debounced_diff();
        main_win.connect_keyboard_shortcuts();
        main_win.connect_row_selection();
        main_win.connect_history_toggle(&btn_history);
        main_win.connect_history_selection();
        main_win.setup_export_actions();
        main_win.refresh_history_list();

        main_win
    }

    pub fn present(&self) {
        self.window.present();
    }

    pub fn load_files_from_paths(&self, left_path: &str, right_path: &str) {
        if let Ok(content) = std::fs::read_to_string(left_path) {
            self.left_view.buffer().set_text(&content);
        } else {
            tracing::warn!("No se pudo leer: {left_path}");
        }
        if let Ok(content) = std::fs::read_to_string(right_path) {
            self.right_view.buffer().set_text(&content);
        } else {
            tracing::warn!("No se pudo leer: {right_path}");
        }
    }

    // ─────────────────────────────────────────
    // Señales de botones
    // ─────────────────────────────────────────

    fn connect_compare_button(&self, btn: &gtk::Button) {
        let left = self.left_view.clone();
        let right = self.right_view.clone();
        let panel = self.diff_panel.clone();
        let status = self.status_label.clone();
        let dropdown = self.format_dropdown.clone();
        let last_diff = self.last_diff.clone();

        btn.connect_clicked(move |_| {
            execute_diff(&left, &right, &panel, &status, &dropdown, &last_diff);
        });
    }

    fn connect_format_button(&self, btn: &gtk::Button) {
        let left = self.left_view.clone();
        let right = self.right_view.clone();
        let status = self.status_label.clone();
        let dropdown = self.format_dropdown.clone();

        btn.connect_clicked(move |_| {
            format_both_panels(&left, &right, &status, &dropdown);
        });
    }

    fn connect_open_buttons(&self, btn_left: &gtk::Button, btn_right: &gtk::Button) {
        {
            let view = self.left_view.clone();
            let win = self.window.clone();
            btn_left.connect_clicked(move |_| {
                open_file_dialog(&win, &view);
            });
        }
        {
            let view = self.right_view.clone();
            let win = self.window.clone();
            btn_right.connect_clicked(move |_| {
                open_file_dialog(&win, &view);
            });
        }
    }

    // ─────────────────────────────────────────
    // Historial
    // ─────────────────────────────────────────

    fn connect_history_toggle(&self, btn: &gtk::ToggleButton) {
        let panel = self.history_panel.clone();
        btn.connect_toggled(move |b| {
            panel.set_visible(b.is_active());
        });
    }

    fn connect_history_selection(&self) {
        let left = self.left_view.clone();
        let right = self.right_view.clone();
        let storage = self.storage.clone();
        let status = self.status_label.clone();

        self.history_list.connect_row_activated(move |_, row| {
            let idx = row.index();
            if idx < 0 {
                return;
            }
            let store = storage.borrow();
            let Some(ref db) = *store else { return };

            match db.load_sessions(20) {
                Ok(sessions) => {
                    if let Some(session) = sessions.get(idx as usize) {
                        left.buffer().set_text(&session.left_content);
                        right.buffer().set_text(&session.right_content);
                        status.set_text(&format!(
                            "Sesión #{} restaurada — {}",
                            session.id,
                            session.diff_summary.short_text()
                        ));
                    }
                }
                Err(e) => {
                    status.set_text(&format!("Error cargando sesión: {e}"));
                }
            }
        });
    }

    /// Recarga la lista del historial desde la base de datos.
    fn refresh_history_list(&self) {
        // Limpiar lista actual
        while let Some(row) = self.history_list.last_child() {
            self.history_list.remove(&row);
        }

        let store = self.storage.borrow();
        let Some(ref db) = *store else { return };

        match db.load_sessions(20) {
            Ok(sessions) => {
                for session in &sessions {
                    let label_text = format!(
                        "#{} {} {}\n{}",
                        session.id,
                        session.format,
                        session.diff_summary.short_text(),
                        &session.created_at,
                    );
                    let label = gtk::Label::new(Some(&label_text));
                    label.set_halign(gtk::Align::Start);
                    label.set_margin_top(4);
                    label.set_margin_bottom(4);
                    label.set_margin_start(8);
                    label.set_margin_end(8);
                    self.history_list.append(&label);
                }
            }
            Err(e) => {
                tracing::warn!("Error cargando historial: {e}");
            }
        }
    }

    // ─────────────────────────────────────────
    // Exportación
    // ─────────────────────────────────────────

    fn setup_export_actions(&self) {
        // Acción: exportar TXT
        let action_txt = gtk::gio::SimpleAction::new("export-txt", None);
        {
            let win = self.window.clone();
            let left = self.left_view.clone();
            let right = self.right_view.clone();
            let last_diff = self.last_diff.clone();
            let status = self.status_label.clone();
            action_txt.connect_activate(move |_, _| {
                export_to_file(&win, &left, &right, &last_diff, &status, ExportFormat::Txt);
            });
        }
        self.window.add_action(&action_txt);

        // Acción: exportar HTML
        let action_html = gtk::gio::SimpleAction::new("export-html", None);
        {
            let win = self.window.clone();
            let left = self.left_view.clone();
            let right = self.right_view.clone();
            let last_diff = self.last_diff.clone();
            let status = self.status_label.clone();
            action_html.connect_activate(move |_, _| {
                export_to_file(&win, &left, &right, &last_diff, &status, ExportFormat::Html);
            });
        }
        self.window.add_action(&action_html);
    }

    // ─────────────────────────────────────────
    // Debounce y selección de fila
    // ─────────────────────────────────────────

    fn connect_debounced_diff(&self) {
        let left_buf = self.left_view.buffer();
        let right_buf = self.right_view.buffer();
        let timeout_id: Rc<RefCell<Option<gtk::glib::SourceId>>> = Rc::new(RefCell::new(None));

        let left_view = self.left_view.clone();
        let right_view = self.right_view.clone();
        let diff_panel = self.diff_panel.clone();
        let status_label = self.status_label.clone();
        let format_dropdown = self.format_dropdown.clone();
        let last_diff = self.last_diff.clone();

        let schedule_diff = {
            let timeout_id = timeout_id.clone();
            move || {
                if let Some(id) = timeout_id.borrow_mut().take() {
                    id.remove();
                }

                let lv = left_view.clone();
                let rv = right_view.clone();
                let dp = diff_panel.clone();
                let sl = status_label.clone();
                let dd = format_dropdown.clone();
                let ld = last_diff.clone();
                let tid = timeout_id.clone();

                let source_id = gtk::glib::timeout_add_local_once(
                    Duration::from_millis(DEBOUNCE_MS),
                    move || {
                        tid.borrow_mut().take();
                        execute_diff(&lv, &rv, &dp, &sl, &dd, &ld);
                    },
                );

                *timeout_id.borrow_mut() = Some(source_id);
            }
        };

        let schedule_left = schedule_diff.clone();
        left_buf.connect_changed(move |_| {
            schedule_left();
        });
        right_buf.connect_changed(move |_| {
            schedule_diff();
        });
    }

    fn connect_row_selection(&self) {
        let left_view = self.left_view.clone();
        let right_view = self.right_view.clone();
        let selection = self.diff_panel.selection_model.clone();

        selection.connect_selection_changed(move |model, _, _| {
            let selected = model.selected();
            if let Some(obj) = model.item(selected) {
                if let Some(diff_obj) = obj.downcast_ref::<DiffItemObject>() {
                    let inner = diff_obj.inner();
                    if let Some(ref item) = *inner {
                        highlighter::highlight_and_scroll_to_item(
                            &left_view, &right_view, item,
                        );
                    }
                }
            }
        });
    }

    // ─────────────────────────────────────────
    // Atajos de teclado
    // ─────────────────────────────────────────

    fn connect_keyboard_shortcuts(&self) {
        let controller = gtk::EventControllerKey::new();

        let left = self.left_view.clone();
        let right = self.right_view.clone();
        let win = self.window.clone();
        let panel = self.diff_panel.clone();
        let status = self.status_label.clone();
        let dropdown = self.format_dropdown.clone();
        let last_diff = self.last_diff.clone();
        let storage = self.storage.clone();
        let history_list = self.history_list.clone();
        let history_panel = self.history_panel.clone();

        controller.connect_key_pressed(move |_, key, _, modifier| {
            let ctrl = modifier.contains(gtk::gdk::ModifierType::CONTROL_MASK);
            let shift = modifier.contains(gtk::gdk::ModifierType::SHIFT_MASK);

            if !ctrl {
                return gtk::glib::Propagation::Proceed;
            }

            match (key, shift) {
                // Ctrl+O → abrir archivo izquierdo
                (gtk::gdk::Key::o, false) => {
                    open_file_dialog(&win, &left);
                    gtk::glib::Propagation::Stop
                }
                // Ctrl+Shift+O → abrir archivo derecho
                (gtk::gdk::Key::O, true) | (gtk::gdk::Key::o, true) => {
                    open_file_dialog(&win, &right);
                    gtk::glib::Propagation::Stop
                }
                // Ctrl+Enter → forzar comparación
                (gtk::gdk::Key::Return, false) => {
                    execute_diff(&left, &right, &panel, &status, &dropdown, &last_diff);
                    gtk::glib::Propagation::Stop
                }
                // Ctrl+S → guardar sesión
                (gtk::gdk::Key::s, false) => {
                    save_session_from_shortcut(
                        &left, &right, &last_diff, &storage, &status,
                        &history_list, &history_panel,
                    );
                    gtk::glib::Propagation::Stop
                }
                // Ctrl+E → exportar como txt (rápido)
                (gtk::gdk::Key::e, false) => {
                    export_to_file(
                        &win, &left, &right, &last_diff, &status,
                        ExportFormat::Txt,
                    );
                    gtk::glib::Propagation::Stop
                }
                // Ctrl+Shift+F → formatear
                (gtk::gdk::Key::F, true) | (gtk::gdk::Key::f, true) => {
                    format_both_panels(&left, &right, &status, &dropdown);
                    gtk::glib::Propagation::Stop
                }
                // Ctrl+H → toggle historial
                (gtk::gdk::Key::h, false) => {
                    history_panel.set_visible(!history_panel.is_visible());
                    gtk::glib::Propagation::Stop
                }
                _ => gtk::glib::Propagation::Proceed,
            }
        });

        self.window.add_controller(controller);
    }
}

// ─────────────────────────────────────────────
// Funciones auxiliares (fuera de impl)
// ─────────────────────────────────────────────

/// Ejecuta la comparación completa: parsea → diff → resalta → actualiza panel.
fn execute_diff(
    left_view: &sv::View,
    right_view: &sv::View,
    panel: &DiffPanel,
    status: &gtk::Label,
    dropdown: &gtk::DropDown,
    last_diff: &Rc<RefCell<Option<(DiffResult, Format)>>>,
) {
    let left_text = get_buffer_text(left_view);
    let right_text = get_buffer_text(right_view);

    if left_text.trim().is_empty() || right_text.trim().is_empty() {
        panel.clear();
        highlighter::clear_highlights(&left_view.buffer());
        highlighter::clear_highlights(&right_view.buffer());
        *last_diff.borrow_mut() = None;
        status.set_text("Introduce texto en ambos paneles para comparar");
        return;
    }

    let format = match dropdown.selected() {
        1 => Some(Format::Json),
        2 => Some(Format::Xml),
        _ => auto_detect_format(&left_text).ok(),
    };

    let result: Result<(DiffResult, Format), String> = match format {
        Some(Format::Json) => {
            match (parse_json(&left_text), parse_json(&right_text)) {
                (Ok(lv), Ok(rv)) => Ok((diff_json(&lv, &rv), Format::Json)),
                (Err(e), _) => Err(format!("Error en documento izquierdo: {e}")),
                (_, Err(e)) => Err(format!("Error en documento derecho: {e}")),
            }
        }
        Some(Format::Xml) => {
            match (parse_xml(&left_text), parse_xml(&right_text)) {
                (Ok(lv), Ok(rv)) => Ok((diff_xml(&lv, &rv), Format::Xml)),
                (Err(e), _) => Err(format!("Error en documento izquierdo: {e}")),
                (_, Err(e)) => Err(format!("Error en documento derecho: {e}")),
            }
        }
        None => Err("No se pudo detectar el formato. Selecciona JSON o XML manualmente.".into()),
    };

    match result {
        Ok((diff, fmt)) => {
            status.set_text(&format!("{} | {fmt}", diff.summary()));
            panel.update(&diff);
            highlighter::apply_highlights(left_view, right_view, &left_text, &right_text, &diff);
            *last_diff.borrow_mut() = Some((diff, fmt));
        }
        Err(msg) => {
            status.set_text(&msg);
            panel.clear();
            highlighter::clear_highlights(&left_view.buffer());
            highlighter::clear_highlights(&right_view.buffer());
            *last_diff.borrow_mut() = None;
        }
    }
}

/// Formatea ambos paneles con pretty-print.
fn format_both_panels(
    left: &sv::View,
    right: &sv::View,
    status: &gtk::Label,
    dropdown: &gtk::DropDown,
) {
    let left_text = get_buffer_text(left);
    let right_text = get_buffer_text(right);

    let format = match dropdown.selected() {
        1 => Some(Format::Json),
        2 => Some(Format::Xml),
        _ => auto_detect_format(&left_text).ok(),
    };

    let Some(fmt) = format else {
        status.set_text("No se pudo detectar el formato para formatear");
        return;
    };

    if !left_text.trim().is_empty() {
        match format_pretty(&left_text, fmt) {
            Ok(pretty) => left.buffer().set_text(&pretty),
            Err(e) => {
                status.set_text(&format!("Error formateando izquierdo: {e}"));
                return;
            }
        }
    }

    if !right_text.trim().is_empty() {
        match format_pretty(&right_text, fmt) {
            Ok(pretty) => right.buffer().set_text(&pretty),
            Err(e) => {
                status.set_text(&format!("Error formateando derecho: {e}"));
                return;
            }
        }
    }

    status.set_text(&format!("Documentos formateados como {fmt}"));
}

/// Guarda sesión desde atajo de teclado (Ctrl+S).
fn save_session_from_shortcut(
    left: &sv::View,
    right: &sv::View,
    last_diff: &Rc<RefCell<Option<(DiffResult, Format)>>>,
    storage: &Rc<RefCell<Option<Storage>>>,
    status: &gtk::Label,
    history_list: &gtk::ListBox,
    history_panel: &gtk::Box,
) {
    let diff_data = last_diff.borrow();
    let Some((ref result, fmt)) = *diff_data else {
        status.set_text("No hay comparación para guardar. Compara primero.");
        return;
    };

    let left_text = get_buffer_text(left);
    let right_text = get_buffer_text(right);
    let summary = DiffSummary::from_diff_result(result);

    let store = storage.borrow();
    let Some(ref db) = *store else {
        status.set_text("Historial no disponible");
        return;
    };

    match db.save_session(&left_text, &right_text, fmt, &summary) {
        Ok(id) => {
            status.set_text(&format!("Sesión #{id} guardada en historial"));
            // Refrescar lista
            while let Some(row) = history_list.last_child() {
                history_list.remove(&row);
            }
            if let Ok(sessions) = db.load_sessions(20) {
                for session in &sessions {
                    let label_text = format!(
                        "#{} {} {}\n{}",
                        session.id,
                        session.format,
                        session.diff_summary.short_text(),
                        &session.created_at,
                    );
                    let label = gtk::Label::new(Some(&label_text));
                    label.set_halign(gtk::Align::Start);
                    label.set_margin_top(4);
                    label.set_margin_bottom(4);
                    label.set_margin_start(8);
                    label.set_margin_end(8);
                    history_list.append(&label);
                }
            }
            // Mostrar el panel si está oculto
            history_panel.set_visible(true);
        }
        Err(e) => {
            status.set_text(&format!("Error guardando: {e}"));
        }
    }
}

// ─────────────────────────────────────────────
// Exportación
// ─────────────────────────────────────────────

#[derive(Clone, Copy)]
enum ExportFormat {
    Txt,
    Html,
}

fn export_to_file(
    window: &adw::ApplicationWindow,
    left: &sv::View,
    right: &sv::View,
    last_diff: &Rc<RefCell<Option<(DiffResult, Format)>>>,
    status: &gtk::Label,
    export_fmt: ExportFormat,
) {
    let diff_data = last_diff.borrow();
    let Some((ref result, fmt)) = *diff_data else {
        status.set_text("No hay comparación para exportar. Compara primero.");
        return;
    };

    let left_text = get_buffer_text(left);
    let right_text = get_buffer_text(right);

    let (content, extension, mime) = match export_fmt {
        ExportFormat::Txt => (
            export::export_txt(result, fmt),
            "txt",
            "text/plain",
        ),
        ExportFormat::Html => (
            export::export_html(result, fmt, &left_text, &right_text),
            "html",
            "text/html",
        ),
    };

    // Diálogo para guardar archivo
    let dialog = gtk::FileDialog::builder()
        .title("Exportar resultado")
        .modal(true)
        .initial_name(format!("rustdiff-report.{extension}"))
        .build();

    let filter = gtk::FileFilter::new();
    filter.set_name(Some(&format!("Archivos .{extension}")));
    filter.add_mime_type(mime);
    filter.add_pattern(&format!("*.{extension}"));

    let filters = gtk::gio::ListStore::new::<gtk::FileFilter>();
    filters.append(&filter);
    dialog.set_filters(Some(&filters));

    let status = status.clone();
    dialog.save(Some(window), gtk::gio::Cancellable::NONE, move |result| {
        match result {
            Ok(file) => {
                if let Some(path) = file.path() {
                    match std::fs::write(&path, &content) {
                        Ok(()) => {
                            status.set_text(&format!(
                                "Exportado a {}",
                                path.display()
                            ));
                        }
                        Err(e) => {
                            status.set_text(&format!("Error escribiendo archivo: {e}"));
                        }
                    }
                }
            }
            Err(_) => {
                // Usuario canceló el diálogo
            }
        }
    });
}

// ─────────────────────────────────────────────
// SourceView y utilidades
// ─────────────────────────────────────────────

/// Crea un editor SourceView con syntax highlighting adaptativo al tema.
fn create_source_view() -> sv::View {
    let buffer = sv::Buffer::new(None);

    // Configurar language por defecto
    let manager = sv::LanguageManager::default();
    if let Some(lang) = manager.language("json") {
        buffer.set_language(Some(&lang));
    }

    // Esquema de colores adaptativo al tema del sistema:
    // Adwaita sigue automáticamente dark/light del sistema operativo.
    let scheme_manager = sv::StyleSchemeManager::default();
    let scheme_name = if adw::StyleManager::default().is_dark() {
        "Adwaita-dark"
    } else {
        "Adwaita"
    };
    if let Some(scheme) = scheme_manager.scheme(scheme_name) {
        buffer.set_style_scheme(Some(&scheme));
    }

    let view = sv::View::with_buffer(&buffer);
    view.set_show_line_numbers(true);
    view.set_highlight_current_line(true);
    view.set_tab_width(2);
    view.set_insert_spaces_instead_of_tabs(true);
    view.set_auto_indent(true);
    view.set_monospace(true);
    view.set_wrap_mode(gtk::WrapMode::WordChar);
    view.set_top_margin(4);
    view.set_bottom_margin(4);
    view.set_left_margin(4);
    view.set_right_margin(4);
    view.add_css_class("editor-panel");

    // Reaccionar a cambios de tema oscuro/claro del sistema
    let buf_clone = view.buffer();
    adw::StyleManager::default().connect_dark_notify(move |sm| {
        let new_scheme = if sm.is_dark() { "Adwaita-dark" } else { "Adwaita" };
        let mgr = sv::StyleSchemeManager::default();
        if let Some(scheme) = mgr.scheme(new_scheme) {
            if let Some(sv_buf) = buf_clone.downcast_ref::<sv::Buffer>() {
                sv_buf.set_style_scheme(Some(&scheme));
            }
        }
    });

    view
}

fn get_buffer_text(view: &sv::View) -> String {
    let buffer = view.buffer();
    let start = buffer.start_iter();
    let end = buffer.end_iter();
    buffer.text(&start, &end, false).to_string()
}

fn load_css() {
    let provider = gtk::CssProvider::new();
    provider.load_from_string(diff_css());

    gtk::style_context_add_provider_for_display(
        &gtk::gdk::Display::default().expect("No se pudo obtener el display"),
        &provider,
        gtk::STYLE_PROVIDER_PRIORITY_APPLICATION,
    );
}

fn open_file_dialog(window: &adw::ApplicationWindow, view: &sv::View) {
    let dialog = gtk::FileDialog::builder()
        .title("Abrir archivo")
        .modal(true)
        .build();

    let filter = gtk::FileFilter::new();
    filter.set_name(Some("JSON y XML"));
    filter.add_pattern("*.json");
    filter.add_pattern("*.xml");
    filter.add_mime_type("application/json");
    filter.add_mime_type("application/xml");
    filter.add_mime_type("text/xml");

    let filter_all = gtk::FileFilter::new();
    filter_all.set_name(Some("Todos los archivos"));
    filter_all.add_pattern("*");

    let filters = gtk::gio::ListStore::new::<gtk::FileFilter>();
    filters.append(&filter);
    filters.append(&filter_all);
    dialog.set_filters(Some(&filters));

    let view = view.clone();
    dialog.open(Some(window), gtk::gio::Cancellable::NONE, move |result| {
        if let Ok(file) = result {
            if let Some(path) = file.path() {
                match std::fs::read_to_string(&path) {
                    Ok(content) => {
                        view.buffer().set_text(&content);

                        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                            let manager = sv::LanguageManager::default();
                            let lang_id = match ext {
                                "json" => Some("json"),
                                "xml" => Some("xml"),
                                _ => None,
                            };
                            if let Some(id) = lang_id {
                                if let Some(lang) = manager.language(id) {
                                    let buf = view.buffer();
                                    if let Some(sv_buf) = buf.downcast_ref::<sv::Buffer>() {
                                        sv_buf.set_language(Some(&lang));
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        tracing::error!("Error leyendo archivo: {e}");
                    }
                }
            }
        }
    });
}
