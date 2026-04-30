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

use adw::prelude::*;
use gtk4 as gtk;
use libadwaita as adw;
use rust_i18n::t;
use sourceview5 as sv;
use sv::prelude::*;

use std::cell::{Cell, RefCell};
use std::rc::Rc;
use std::time::Duration;

use crate::diff_engine::{DiffResult, diff_json, diff_xml};
use crate::export;
use crate::parser::{Format, auto_detect_format, format_pretty, parse_json, parse_xml};
use crate::storage::{DiffSummary, Storage};
use crate::ui::diff_panel::{DiffItemObject, DiffPanel, diff_css};
use crate::ui::highlighter;

/// Indica qué editor tiene el foco actualmente.
#[derive(Clone, Copy, PartialEq)]
enum FocusedEditor {
    Left,
    Right,
}

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
    /// Overlay para toasts (mensajes no bloqueantes).
    toast_overlay: adw::ToastOverlay,
    /// Campo de búsqueda en el historial.
    history_search_entry: gtk::SearchEntry,
    /// Botón "Cargar más" en el historial.
    history_load_more_btn: gtk::Button,
    /// Cantidad de sesiones visibles actualmente en el historial.
    history_visible_count: Cell<usize>,
    /// Pantalla de bienvenida (visible inicialmente).
    welcome_screen: gtk::Box,
    /// Contenedor principal de editores (oculto inicialmente).
    editors_container: gtk::Box,
    /// Barra de búsqueda (Ctrl+F).
    search_revealer: gtk::Revealer,
    search_entry: gtk::SearchEntry,
    focused_editor: Rc<Cell<FocusedEditor>>,
    /// Paned de editores (para mostrar/ocultar el derecho).
    editors_paned: gtk::Paned,
    /// Caja del editor derecho (para reinsertar en el paned).
    right_editor_box: gtk::Box,
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

        // Zoom con Ctrl + rueda del ratón
        setup_editor_zoom(&left_view, &right_view);

        // ── Panel de diferencias ────────────────
        let diff_panel = Rc::new(DiffPanel::new());

        // ── Barra de estado ─────────────────────
        let status_label = gtk::Label::new(Some(&t!("app.status_ready")));
        status_label.set_halign(gtk::Align::Start);
        status_label.set_margin_start(8);
        status_label.set_margin_end(8);
        status_label.set_margin_top(4);
        status_label.set_margin_bottom(4);
        status_label.add_css_class("dim-label");

        // ── Dropdown de formato ─────────────────
        let auto_label = t!("header.format_auto");
        let formats = gtk::StringList::new(&[&auto_label, "JSON", "XML"]);
        let format_dropdown = gtk::DropDown::new(Some(formats), gtk::Expression::NONE);
        format_dropdown.set_selected(0);
        format_dropdown.set_tooltip_text(Some(&t!("header.format_dropdown_tooltip")));

        // ── Botones de la HeaderBar ─────────────
        let btn_open_left = gtk::Button::with_label(&t!("header.open_left"));
        btn_open_left.set_tooltip_text(Some(&t!("header.open_left_tooltip")));
        btn_open_left.add_css_class("flat");

        let btn_open_right = gtk::Button::with_label(&t!("header.open_right"));
        btn_open_right.set_tooltip_text(Some(&t!("header.open_right_tooltip")));
        btn_open_right.add_css_class("flat");
        btn_open_right.set_visible(false);

        let btn_enable_comparison = gtk::Button::with_label(&t!("header.enable_comparison"));
        btn_enable_comparison.set_tooltip_text(Some(&t!("header.enable_comparison_tooltip")));
        btn_enable_comparison.add_css_class("suggested-action");

        let btn_compare = gtk::Button::with_label(&t!("header.compare"));
        btn_compare.set_tooltip_text(Some(&t!("header.compare_tooltip")));
        btn_compare.add_css_class("suggested-action");
        btn_compare.set_visible(false);

        let btn_format = gtk::Button::with_label(&t!("header.format"));
        btn_format.set_tooltip_text(Some(&t!("header.format_tooltip")));
        btn_format.add_css_class("flat");

        // ── Botón Historial toggle ──────────────
        let btn_history = gtk::ToggleButton::with_label(&t!("header.history"));
        btn_history.set_tooltip_text(Some(&t!("header.history_tooltip")));
        btn_history.add_css_class("flat");

        // ── Menú principal (hamburger) ──────────
        // Agrupa acciones secundarias: Formatear, Exportar, Idioma.
        // Los atajos se muestran automaticamente porque se registran
        // con `gtk::Application::set_accels_for_action` mas abajo.
        let primary_menu = gtk::gio::Menu::new();

        // Seccion 1: accion "Formatear" (tambien accesible via boton).
        let format_section = gtk::gio::Menu::new();
        format_section.append(
            Some(&t!("menu.format_documents")),
            Some("win.format-documents"),
        );
        primary_menu.append_section(None, &format_section);

        // Seccion 2: Exportar (.txt, .html)
        let export_section = gtk::gio::Menu::new();
        export_section.append(Some(&t!("menu.export_txt")), Some("win.export-txt"));
        export_section.append(Some(&t!("menu.export_html")), Some("win.export-html"));
        primary_menu.append_section(None, &export_section);

        // Seccion 3: Idioma (submenu con seleccion radio).
        let language_submenu = gtk::gio::Menu::new();
        language_submenu.append(Some(&t!("menu.language_auto")), Some("win.language::auto"));
        language_submenu.append(Some(&t!("menu.language_en")), Some("win.language::en"));
        language_submenu.append(Some(&t!("menu.language_es")), Some("win.language::es"));
        let language_section = gtk::gio::Menu::new();
        language_section.append_submenu(Some(&t!("menu.language")), &language_submenu);
        primary_menu.append_section(None, &language_section);

        let btn_menu = gtk::MenuButton::new();
        btn_menu.set_icon_name("open-menu-symbolic");
        btn_menu.set_menu_model(Some(&primary_menu));
        btn_menu.set_tooltip_text(Some(&t!("menu.tooltip")));
        btn_menu.add_css_class("flat");

        // ── HeaderBar ───────────────────────────
        // Layout: [Open Izq] [Open Der] [Formato▼]  ...  [History] [Format] [Compare] [☰]
        let header = adw::HeaderBar::new();
        header.pack_start(&btn_open_left);
        header.pack_start(&btn_open_right);
        header.pack_start(&format_dropdown);
        header.pack_end(&btn_menu);
        header.pack_end(&btn_compare);
        header.pack_end(&btn_enable_comparison);
        header.pack_end(&btn_format);
        header.pack_end(&btn_history);

        // ── Pantalla de bienvenida (Welcome) ───
        let (welcome_screen, welcome_btn_doc, welcome_btn_new, welcome_btn_history) = build_welcome_screen();

        // ── Barra de búsqueda (Ctrl+F) ──────────
        let search_entry = gtk::SearchEntry::new();
        search_entry.set_hexpand(true);
        search_entry.set_width_request(200);

        let search_box = gtk::Box::new(gtk::Orientation::Horizontal, 4);
        search_box.set_margin_start(8);
        search_box.set_margin_end(8);
        search_box.set_margin_top(4);
        search_box.set_margin_bottom(4);

        let search_revealer = gtk::Revealer::new();
        search_revealer.set_child(Some(&search_box));
        search_revealer.set_reveal_child(false);
        search_revealer.set_transition_type(gtk::RevealerTransitionType::SlideDown);

        // ── Foco de editor (para búsqueda Ctrl+F) ─
        let focused_editor = Rc::new(Cell::new(FocusedEditor::Left));

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

        let history_title = gtk::Label::new(Some(&t!("history.title")));
        history_title.add_css_class("heading");
        history_title.set_halign(gtk::Align::Start);
        history_title.set_hexpand(true);
        history_title.set_margin_start(8);

        let btn_clear_history = gtk::Button::from_icon_name("user-trash-symbolic");
        btn_clear_history.set_tooltip_text(Some(&t!("history.clear_tooltip")));
        btn_clear_history.add_css_class("flat");
        btn_clear_history.set_valign(gtk::Align::Center);

        let history_header = gtk::Box::new(gtk::Orientation::Horizontal, 4);
        history_header.set_margin_top(6);
        history_header.set_margin_bottom(4);
        history_header.set_margin_end(4);
        history_header.append(&history_title);
        history_header.append(&btn_clear_history);

        let history_search_entry = gtk::SearchEntry::new();
        history_search_entry.set_placeholder_text(Some(&t!("history.search_placeholder")));
        history_search_entry.set_margin_start(8);
        history_search_entry.set_margin_end(8);
        history_search_entry.set_margin_top(4);
        history_search_entry.set_margin_bottom(4);

        let history_load_more_btn = gtk::Button::with_label(&t!("history.load_more"));
        history_load_more_btn.set_halign(gtk::Align::Center);
        history_load_more_btn.set_margin_top(8);
        history_load_more_btn.set_margin_bottom(8);
        history_load_more_btn.set_margin_start(8);
        history_load_more_btn.set_margin_end(8);
        history_load_more_btn.set_visible(false);

        let history_panel = gtk::Box::new(gtk::Orientation::Vertical, 0);
        history_panel.set_width_request(240);
        history_panel.append(&history_header);
        history_panel.append(&history_search_entry);
        history_panel.append(&history_scroll);
        history_panel.append(&history_load_more_btn);
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
        let left_label = gtk::Label::new(Some(&t!("editor.left_label")));
        left_label.add_css_class("heading");
        left_label.set_margin_top(4);
        left_label.set_margin_bottom(4);
        left_box.append(&left_label);
        left_box.append(&left_scroll);

        let right_box = gtk::Box::new(gtk::Orientation::Vertical, 0);
        let right_label = gtk::Label::new(Some(&t!("editor.right_label")));
        right_label.add_css_class("heading");
        right_label.set_margin_top(4);
        right_label.set_margin_bottom(4);
        right_box.append(&right_label);
        right_box.append(&right_scroll);

        // ── Split horizontal editores 50/50 ─────
        let editors_paned = gtk::Paned::new(gtk::Orientation::Horizontal);
        editors_paned.set_start_child(Some(&left_box));
        // Editor derecho oculto inicialmente
        editors_paned.set_end_child(None::<&gtk::Box>);
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
        // La posición del paned determina el tamaño del panel superior (editores).
        // Valor alto = editores grandes, diff panel pequeño (abajo).
        main_paned.set_position(650);

        // ── Layout con historial lateral ────────
        let content_with_sidebar = gtk::Box::new(gtk::Orientation::Horizontal, 0);
        content_with_sidebar.append(&history_panel);

        // Contenedor de editores + barra de búsqueda
        let editors_container = gtk::Box::new(gtk::Orientation::Vertical, 0);
        editors_container.append(&search_revealer);
        editors_container.append(&main_paned);
        // Inicialmente oculto hasta que se cargue contenido
        editors_container.set_visible(false);

        content_with_sidebar.append(&editors_container);

        // Stack para alternar entre bienvenida y editores
        let main_stack = gtk::Stack::new();
        main_stack.add_named(&welcome_screen, Some("welcome"));
        main_stack.add_named(&content_with_sidebar, Some("editors"));
        main_stack.set_visible_child_name("welcome");

        // ── ToastOverlay para notificaciones no bloqueantes ─
        let toast_overlay = adw::ToastOverlay::new();
        toast_overlay.set_child(Some(&main_stack));

        // ── Layout vertical: header + contenido + status
        let toolbar_view = adw::ToolbarView::new();
        toolbar_view.add_top_bar(&header);
        toolbar_view.set_content(Some(&toast_overlay));

        let outer_box = gtk::Box::new(gtk::Orientation::Vertical, 0);
        outer_box.append(&toolbar_view);
        outer_box.append(&status_label);

        // ── Ventana principal ───────────────────
        let window = adw::ApplicationWindow::builder()
            .application(app)
            .title(&*t!("app.title"))
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
            toast_overlay,
            welcome_screen,
            editors_container,
            search_revealer,
            search_entry,
            focused_editor,
            editors_paned,
            right_editor_box: right_box,
            history_search_entry,
            history_load_more_btn,
            history_visible_count: Cell::new(3),
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
        main_win.connect_clear_history_button(&btn_clear_history);
        main_win.setup_export_actions();
        main_win.setup_format_action();
        main_win.setup_language_action();
        main_win.register_menu_accels(app);
        main_win.refresh_history_list();

        // ── Nuevas conexiones ─────────────────
        main_win.connect_welcome_screen(&welcome_btn_doc, &welcome_btn_new, &welcome_btn_history);
        main_win.connect_enable_comparison(&btn_enable_comparison, &btn_compare, &btn_open_right);
        main_win.connect_search_bar();
        main_win.connect_history_search();
        main_win.connect_history_load_more();
        main_win.connect_close_request();
        main_win.connect_editor_focus();

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
            let name = row.widget_name();
            let id: i64 = name.parse().unwrap_or(-1);
            if id <= 0 {
                return;
            }
            let store = storage.borrow();
            let Some(ref db) = *store else { return };

            match db.get_session(id) {
                Ok(session) => {
                    left.buffer().set_text(&session.left_content);
                    right.buffer().set_text(&session.right_content);
                    status.set_text(&t!(
                        "history.status_restored",
                        id = session.id,
                        summary = session.diff_summary.short_text()
                    ));
                }
                Err(e) => {
                    status.set_text(&t!("history.status_load_error", error = e.to_string()));
                }
            }
        });
    }

    /// Recarga la lista del historial desde la base de datos.
    fn refresh_history_list(&self) {
        self.history_visible_count.set(3);
        self.load_history_page();
    }

    fn load_history_page(&self) {
        let count = self.history_visible_count.get();
        let query = self.history_search_entry.text().to_string();
        load_history_page_widget(
            &self.history_list,
            &self.history_load_more_btn,
            &self.storage,
            count,
            &query,
        );
    }

    fn connect_clear_history_button(&self, btn: &gtk::Button) {
        let window = self.window.clone();
        let storage = self.storage.clone();
        let history_list = self.history_list.clone();
        let status = self.status_label.clone();

        btn.connect_clicked(move |_| {
            // Si no hay sesiones, solo avisar
            {
                let store = storage.borrow();
                if let Some(ref db) = *store {
                    if db.count_sessions().unwrap_or(0) == 0 {
                        status.set_text(&t!("history.status_already_empty"));
                        return;
                    }
                } else {
                    status.set_text(&t!("history.status_unavailable"));
                    return;
                }
            }

            let dialog = adw::AlertDialog::new(
                Some(&t!("history.clear_dialog_title")),
                Some(&t!("history.clear_dialog_body")),
            );
            dialog.add_response("cancel", &t!("history.cancel"));
            dialog.add_response("delete", &t!("history.clear_confirm"));
            dialog.set_response_appearance("delete", adw::ResponseAppearance::Destructive);
            dialog.set_default_response(Some("cancel"));
            dialog.set_close_response("cancel");

            let storage_cl = storage.clone();
            let list_cl = history_list.clone();
            let status_cl = status.clone();
            dialog.connect_response(None, move |dlg, response| {
                if response == "delete" {
                    let borradas = {
                        let store = storage_cl.borrow();
                        match store.as_ref().map(|db| db.clear_all_sessions()) {
                            Some(Ok(n)) => Some(n),
                            Some(Err(e)) => {
                                tracing::warn!("Error borrando historial: {e}");
                                None
                            }
                            None => None,
                        }
                    };
                    load_history_page_widget(&list_cl, &gtk::Button::new(), &storage_cl, 3, "");
                    if let Some(n) = borradas {
                        status_cl.set_text(&t!("history.status_cleared", count = n));
                    } else {
                        status_cl.set_text(&t!("history.status_clear_failed"));
                    }
                }
                dlg.close();
            });

            dialog.present(Some(&window));
        });
    }

    // ─────────────────────────────────────────
    // Exportación
    // ─────────────────────────────────────────

    /// Accion `win.format-documents` usada por el menu principal.
    /// La misma funcion que ya usa el boton "Format" de la header bar.
    fn setup_format_action(&self) {
        let action = gtk::gio::SimpleAction::new("format-documents", None);
        let left = self.left_view.clone();
        let right = self.right_view.clone();
        let status = self.status_label.clone();
        let dropdown = self.format_dropdown.clone();
        action.connect_activate(move |_, _| {
            format_both_panels(&left, &right, &status, &dropdown);
        });
        self.window.add_action(&action);
    }

    /// Accion stateful `win.language` que alimenta el submenu radio
    /// (Auto / English / Español). Persiste la seleccion en
    /// `~/.config/rustdiff/settings.json` y muestra un toast pidiendo
    /// reinicio porque los `&str` de la UI ya se construyeron.
    fn setup_language_action(&self) {
        use gtk::glib::{Variant, VariantTy, variant::ToVariant};

        let initial = crate::settings::Settings::load().language;
        let action = gtk::gio::SimpleAction::new_stateful(
            "language",
            Some(VariantTy::STRING),
            &initial.to_variant(),
        );

        let toast_overlay = self.toast_overlay.clone();
        action.connect_activate(move |action, parameter: Option<&Variant>| {
            let Some(new_lang) = parameter.and_then(|p| p.get::<String>()) else {
                return;
            };
            action.set_state(&new_lang.to_variant());

            let mut settings = crate::settings::Settings::load();
            if settings.language == new_lang {
                return;
            }
            settings.language = new_lang;
            settings.save();

            let toast = adw::Toast::new(&t!("toast.language_changed"));
            toast.set_timeout(5);
            toast_overlay.add_toast(toast);
        });
        self.window.add_action(&action);
    }

    /// Registra en `gtk::Application` los atajos que deben mostrarse en
    /// el menu (Adwaita los renderiza automaticamente al lado del label).
    fn register_menu_accels(&self, app: &adw::Application) {
        app.set_accels_for_action("win.format-documents", &["<Control><Shift>F"]);
        app.set_accels_for_action("win.export-txt", &["<Control>E"]);
    }

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
                        highlighter::highlight_and_scroll_to_item(&left_view, &right_view, item);
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
        let search_revealer = self.search_revealer.clone();
        let search_entry = self.search_entry.clone();

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
                        &left,
                        &right,
                        &last_diff,
                        &storage,
                        &status,
                        &history_list,
                        &history_panel,
                    );
                    gtk::glib::Propagation::Stop
                }
                // Ctrl+E y Ctrl+Shift+F se registran via
                // `gtk::Application::set_accels_for_action` para que
                // aparezcan en el menu principal. No los duplicamos aqui.

                // Ctrl+H → toggle historial
                (gtk::gdk::Key::h, false) => {
                    history_panel.set_visible(!history_panel.is_visible());
                    gtk::glib::Propagation::Stop
                }
                // Ctrl+F → mostrar barra de búsqueda
                (gtk::gdk::Key::f, false) => {
                    search_revealer.set_reveal_child(!search_revealer.reveals_child());
                    if search_revealer.reveals_child() {
                        search_entry.grab_focus();
                    }
                    gtk::glib::Propagation::Stop
                }
                _ => gtk::glib::Propagation::Proceed,
            }
        });

        self.window.add_controller(controller);
    }

    // ─────────────────────────────────────────
    // Pantalla de bienvenida
    // ─────────────────────────────────────────

    fn connect_welcome_screen(&self, btn_doc: &gtk::Button, btn_new: &gtk::Button, btn_history: &gtk::Button) {
        let win = self.window.clone();
        let welcome = self.welcome_screen.clone();
        let editors = self.editors_container.clone();
        let left_view = self.left_view.clone();
        let status = self.status_label.clone();
        let history_panel = self.history_panel.clone();

        let transition_to_editors = {
            let welcome = welcome.clone();
            let editors = editors.clone();
            let status = status.clone();
            move || {
                welcome.set_visible(false);
                editors.set_visible(true);
                if let Some(parent) = welcome.parent() {
                    if let Some(stack) = parent.downcast_ref::<gtk::Stack>() {
                        stack.set_visible_child_name("editors");
                    }
                }
                status.set_text(&t!("app.status_ready"));
            }
        };

        {
            let win = win.clone();
            let left_view = left_view.clone();
            let transition = transition_to_editors.clone();
            btn_doc.connect_clicked(move |_| {
                open_file_dialog(&win, &left_view);
                transition();
            });
        }
        {
            let transition = transition_to_editors.clone();
            btn_new.connect_clicked(move |_| {
                transition();
            });
        }
        {
            let transition = transition_to_editors.clone();
            let history_panel = history_panel.clone();
            btn_history.connect_clicked(move |_| {
                transition();
                history_panel.set_visible(true);
            });
        }
    }

    // ─────────────────────────────────────────
    // Habilitar comparación (segundo editor)
    // ─────────────────────────────────────────

    fn connect_enable_comparison(&self, btn: &gtk::Button, btn_compare: &gtk::Button, btn_open_right: &gtk::Button) {
        let editors_paned = self.editors_paned.clone();
        let right_editor_box = self.right_editor_box.clone();
        let status = self.status_label.clone();
        let btn_for_closure = btn.clone();
        let btn_compare = btn_compare.clone();
        let btn_open_right = btn_open_right.clone();

        btn.connect_clicked(move |_| {
            editors_paned.set_end_child(Some(&right_editor_box));
            btn_for_closure.set_visible(false);
            btn_compare.set_visible(true);
            btn_open_right.set_visible(true);
            status.set_text(&t!("compare.need_input"));
        });
    }

    // ─────────────────────────────────────────
    // Historial: paginación y búsqueda
    // ─────────────────────────────────────────

    fn connect_history_search(&self) {
        let history_list = self.history_list.clone();
        let load_more_btn = self.history_load_more_btn.clone();
        let storage = self.storage.clone();
        let count = self.history_visible_count.clone();
        let search_entry = self.history_search_entry.clone();

        search_entry.connect_search_changed(move |entry| {
            let query = entry.text().to_string();
            count.set(3);
            load_history_page_widget(&history_list, &load_more_btn, &storage, 3, &query);
        });
    }

    fn connect_history_load_more(&self) {
        let history_list = self.history_list.clone();
        let load_more_btn = self.history_load_more_btn.clone();
        let storage = self.storage.clone();
        let count = self.history_visible_count.clone();
        let search_entry = self.history_search_entry.clone();
        let btn = self.history_load_more_btn.clone();

        btn.connect_clicked(move |_| {
            let new_count = count.get() + 3;
            count.set(new_count);
            let query = search_entry.text().to_string();
            load_history_page_widget(&history_list, &load_more_btn, &storage, new_count, &query);
        });
    }

    // ─────────────────────────────────────────
    // Búsqueda (Ctrl+F)
    // ─────────────────────────────────────────

    fn connect_search_bar(&self) {
        let search_revealer = self.search_revealer.clone();
        let search_entry = self.search_entry.clone();
        let left_view = self.left_view.clone();
        let right_view = self.right_view.clone();
        let focused = self.focused_editor.clone();
        let current_query = Rc::new(RefCell::new(String::new()));

        // Layout: [Prev] [Entry] [Next]
        let search_box = gtk::Box::new(gtk::Orientation::Horizontal, 4);
        search_box.set_margin_start(8);
        search_box.set_margin_end(8);
        search_box.set_margin_top(4);
        search_box.set_margin_bottom(4);

        let btn_prev = gtk::Button::from_icon_name("go-up-symbolic");
        let btn_next = gtk::Button::from_icon_name("go-down-symbolic");
        btn_prev.add_css_class("flat");
        btn_next.add_css_class("flat");
        btn_prev.set_tooltip_text(Some(&t!("search.prev")));
        btn_next.set_tooltip_text(Some(&t!("search.next")));

        search_box.append(&btn_prev);
        search_box.append(&search_entry);
        search_box.append(&btn_next);
        search_revealer.set_child(Some(&search_box));

        let query_for_entry = current_query.clone();
        search_entry.connect_search_changed(move |entry| {
            *query_for_entry.borrow_mut() = entry.text().to_string();
        });

        // Función auxiliar: buscar siguiente
        let search_next = {
            let query = current_query.clone();
            let focused = focused.clone();
            let left_view = left_view.clone();
            let right_view = right_view.clone();
            move || {
                let q = query.borrow().clone();
                if q.is_empty() {
                    return;
                }
                let view = match focused.get() {
                    FocusedEditor::Left => &left_view,
                    FocusedEditor::Right => &right_view,
                };
                let buf = view.buffer();
                let iter = if let Some((_, end)) = buf.selection_bounds() {
                    end
                } else {
                    buf.iter_at_offset(buf.cursor_position())
                };

                if let Some((ms, me)) = iter.forward_search(
                    &q,
                    gtk::TextSearchFlags::CASE_INSENSITIVE,
                    None,
                ) {
                    buf.select_range(&ms, &me);
                    let mut scroll = ms;
                    view.scroll_to_iter(&mut scroll, 0.25, false, 0.5, 0.5);
                } else {
                    let start = buf.start_iter();
                    if let Some((ms, me)) = start.forward_search(
                        &q,
                        gtk::TextSearchFlags::CASE_INSENSITIVE,
                        None,
                    ) {
                        buf.select_range(&ms, &me);
                        let mut scroll = ms;
                        view.scroll_to_iter(&mut scroll, 0.25, false, 0.5, 0.5);
                    }
                }
            }
        };

        // Función auxiliar: buscar anterior
        let search_prev = {
            let query = current_query.clone();
            let focused = focused.clone();
            let left_view = left_view.clone();
            let right_view = right_view.clone();
            move || {
                let q = query.borrow().clone();
                if q.is_empty() {
                    return;
                }
                let view = match focused.get() {
                    FocusedEditor::Left => &left_view,
                    FocusedEditor::Right => &right_view,
                };
                let buf = view.buffer();
                let iter = if let Some((start, _)) = buf.selection_bounds() {
                    start
                } else {
                    buf.iter_at_offset(buf.cursor_position())
                };

                if let Some((ms, me)) = iter.backward_search(
                    &q,
                    gtk::TextSearchFlags::CASE_INSENSITIVE,
                    None,
                ) {
                    buf.select_range(&ms, &me);
                    let mut scroll = ms;
                    view.scroll_to_iter(&mut scroll, 0.25, false, 0.5, 0.5);
                } else {
                    let end = buf.end_iter();
                    if let Some((ms, me)) = end.backward_search(
                        &q,
                        gtk::TextSearchFlags::CASE_INSENSITIVE,
                        None,
                    ) {
                        buf.select_range(&ms, &me);
                        let mut scroll = ms;
                        view.scroll_to_iter(&mut scroll, 0.25, false, 0.5, 0.5);
                    }
                }
            }
        };

        // Conectar botones y Enter
        btn_next.connect_clicked(move |_| search_next());
        btn_prev.connect_clicked(move |_| search_prev());

        // Enter en el campo de búsqueda = buscar siguiente
        {
            let query = current_query.clone();
            let focused = focused.clone();
            let left_view = left_view.clone();
            let right_view = right_view.clone();
            search_entry.connect_activate(move |_| {
                let q = query.borrow().clone();
                if q.is_empty() {
                    return;
                }
                let view = match focused.get() {
                    FocusedEditor::Left => &left_view,
                    FocusedEditor::Right => &right_view,
                };
                let buf = view.buffer();
                let iter = if let Some((_, end)) = buf.selection_bounds() {
                    end
                } else {
                    buf.iter_at_offset(buf.cursor_position())
                };

                if let Some((ms, me)) = iter.forward_search(
                    &q,
                    gtk::TextSearchFlags::CASE_INSENSITIVE,
                    None,
                ) {
                    buf.select_range(&ms, &me);
                    let mut scroll = ms;
                    view.scroll_to_iter(&mut scroll, 0.25, false, 0.5, 0.5);
                } else {
                    let start = buf.start_iter();
                    if let Some((ms, me)) = start.forward_search(
                        &q,
                        gtk::TextSearchFlags::CASE_INSENSITIVE,
                        None,
                    ) {
                        buf.select_range(&ms, &me);
                        let mut scroll = ms;
                        view.scroll_to_iter(&mut scroll, 0.25, false, 0.5, 0.5);
                    }
                }
            });
        }
    }

    fn connect_editor_focus(&self) {
        let focused_left = self.focused_editor.clone();
        let focus_left = gtk::EventControllerFocus::new();
        focus_left.connect_enter(move |_| {
            focused_left.set(FocusedEditor::Left);
        });
        self.left_view.add_controller(focus_left);

        let focused_right = self.focused_editor.clone();
        let focus_right = gtk::EventControllerFocus::new();
        focus_right.connect_enter(move |_| {
            focused_right.set(FocusedEditor::Right);
        });
        self.right_view.add_controller(focus_right);
    }

    // ─────────────────────────────────────────
    // Diálogo al salir / guardar
    // ─────────────────────────────────────────

    fn connect_close_request(&self) {
        let win = self.window.clone();
        let left = self.left_view.clone();
        let right = self.right_view.clone();
        let last_diff = self.last_diff.clone();
        let storage = self.storage.clone();
        let status = self.status_label.clone();
        let history_list = self.history_list.clone();
        let history_panel = self.history_panel.clone();
        let should_close = Rc::new(Cell::new(false));

        win.connect_close_request(move |win_ref| {
            if should_close.get() {
                return gtk::glib::Propagation::Proceed;
            }

            let has_content = {
                let l = get_buffer_text(&left);
                let r = get_buffer_text(&right);
                !l.trim().is_empty() || !r.trim().is_empty()
            };

            if !has_content {
                return gtk::glib::Propagation::Proceed;
            }

            let dialog = adw::AlertDialog::new(
                Some(&t!("exit.dialog_title")),
                Some(&t!("exit.dialog_body")),
            );
            dialog.add_response("cancel", &t!("exit.cancel"));
            dialog.add_response("save_history", &t!("exit.save_history"));
            dialog.add_response("export_txt", &t!("exit.export_txt"));
            dialog.add_response("export_html", &t!("exit.export_html"));
            dialog.add_response("close", &t!("exit.close_without_saving"));
            dialog.set_response_appearance("close", adw::ResponseAppearance::Destructive);
            dialog.set_default_response(Some("cancel"));
            dialog.set_close_response("cancel");

            let window = win_ref.clone();
            let window_for_response = window.clone();
            let should_close = should_close.clone();
            let left = left.clone();
            let right = right.clone();
            let last_diff = last_diff.clone();
            let storage = storage.clone();
            let status = status.clone();
            let history_list = history_list.clone();
            let history_panel = history_panel.clone();

            dialog.connect_response(None, move |dlg, response| {
                match response {
                    "save_history" => {
                        save_session_from_shortcut(
                            &left, &right, &last_diff, &storage, &status, &history_list, &history_panel
                        );
                        should_close.set(true);
                        window_for_response.close();
                    }
                    "export_txt" => {
                        export_to_file(&window_for_response, &left, &right, &last_diff, &status, ExportFormat::Txt);
                        should_close.set(true);
                        window_for_response.close();
                    }
                    "export_html" => {
                        export_to_file(&window_for_response, &left, &right, &last_diff, &status, ExportFormat::Html);
                        should_close.set(true);
                        window_for_response.close();
                    }
                    "close" => {
                        should_close.set(true);
                        window_for_response.close();
                    }
                    _ => {}
                }
                dlg.close();
            });

            dialog.present(Some(&window));
            gtk::glib::Propagation::Stop
        });
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
        status.set_text(&t!("compare.need_input"));
        return;
    }

    let format = match dropdown.selected() {
        1 => Some(Format::Json),
        2 => Some(Format::Xml),
        _ => auto_detect_format(&left_text).ok(),
    };

    let result: Result<(DiffResult, Format), String> = match format {
        Some(Format::Json) => match (parse_json(&left_text), parse_json(&right_text)) {
            (Ok(lv), Ok(rv)) => Ok((diff_json(&lv, &rv), Format::Json)),
            (Err(e), _) => Err(format!("Error en documento izquierdo: {e}")),
            (_, Err(e)) => Err(format!("Error en documento derecho: {e}")),
        },
        Some(Format::Xml) => match (parse_xml(&left_text), parse_xml(&right_text)) {
            (Ok(lv), Ok(rv)) => Ok((diff_xml(&lv, &rv), Format::Xml)),
            (Err(e), _) => Err(format!("Error en documento izquierdo: {e}")),
            (_, Err(e)) => Err(format!("Error en documento derecho: {e}")),
        },
        None => Err(t!("compare.detect_failed_hint").to_string()),
    };

    match result {
        Ok((diff, fmt)) => {
            status.set_text(&t!(
                "compare.summary_format",
                summary = diff.summary(),
                fmt = fmt.to_string()
            ));
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
        status.set_text(&t!("format.detect_failed"));
        return;
    };

    if !left_text.trim().is_empty() {
        match format_pretty(&left_text, fmt) {
            Ok(pretty) => left.buffer().set_text(&pretty),
            Err(e) => {
                status.set_text(&t!("format.format_error_left", error = e.to_string()));
                return;
            }
        }
    }

    if !right_text.trim().is_empty() {
        match format_pretty(&right_text, fmt) {
            Ok(pretty) => right.buffer().set_text(&pretty),
            Err(e) => {
                status.set_text(&t!("format.format_error_right", error = e.to_string()));
                return;
            }
        }
    }

    status.set_text(&t!("format.formatted_ok", fmt = fmt.to_string()));
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
        status.set_text(&t!("history.no_comparison"));
        return;
    };

    let left_text = get_buffer_text(left);
    let right_text = get_buffer_text(right);
    let summary = DiffSummary::from_diff_result(result);

    let store = storage.borrow();
    let Some(ref db) = *store else {
        status.set_text(&t!("history.status_unavailable"));
        return;
    };

    let result = db.save_session(&left_text, &right_text, fmt, &summary);
    drop(store); // liberar el borrow antes de refrescar la lista

    match result {
        Ok(id) => {
            status.set_text(&t!("history.status_saved", id = id));
            load_history_page_widget(history_list, &gtk::Button::new(), storage, 3, "");
            // Mostrar el panel si está oculto
            history_panel.set_visible(true);
        }
        Err(e) => {
            status.set_text(&t!("history.status_save_error", error = e.to_string()));
        }
    }
}

// ─────────────────────────────────────────────
// Renderizado del historial
// ─────────────────────────────────────────────

/// Vacía y reconstruye la `ListBox` del historial con paginación y búsqueda.
fn load_history_page_widget(
    history_list: &gtk::ListBox,
    load_more_btn: &gtk::Button,
    storage: &Rc<RefCell<Option<Storage>>>,
    limit: usize,
    query: &str,
) {
    while let Some(row) = history_list.last_child() {
        history_list.remove(&row);
    }

    let sessions = {
        let store = storage.borrow();
        match store.as_ref() {
            Some(db) => {
                let result = if query.trim().is_empty() {
                    db.load_sessions_offset(0, limit)
                } else {
                    db.search_sessions(query, limit)
                };
                match result {
                    Ok(s) => s,
                    Err(e) => {
                        tracing::warn!("Error cargando historial: {e}");
                        return;
                    }
                }
            }
            None => return,
        }
    };

    if sessions.is_empty() {
        let empty = gtk::Label::new(Some(&t!("history.empty")));
        empty.add_css_class("dim-label");
        empty.set_margin_top(12);
        empty.set_margin_bottom(12);
        empty.set_margin_start(8);
        empty.set_margin_end(8);
        history_list.append(&empty);
        if let Some(row) = history_list.last_child() {
            if let Some(listrow) = row.downcast_ref::<gtk::ListBoxRow>() {
                listrow.set_selectable(false);
                listrow.set_activatable(false);
            }
        }
        load_more_btn.set_visible(false);
        return;
    }

    for session in &sessions {
        let row_widget = build_history_row(session, history_list, storage);
        history_list.append(&row_widget);
    }

    // Mostrar "Cargar más" solo si podría haber más resultados
    load_more_btn.set_visible(sessions.len() == limit);
}

/// Construye una fila del historial con etiqueta + botón de borrado individual.
fn build_history_row(
    session: &crate::storage::Session,
    history_list: &gtk::ListBox,
    storage: &Rc<RefCell<Option<Storage>>>,
) -> gtk::ListBoxRow {
    let box_widget = gtk::Box::new(gtk::Orientation::Horizontal, 4);
    box_widget.set_margin_start(8);
    box_widget.set_margin_end(4);
    box_widget.set_margin_top(2);
    box_widget.set_margin_bottom(2);

    let label_text = format!(
        "#{} {} {}\n{}",
        session.id,
        session.format,
        session.diff_summary.short_text(),
        &session.created_at,
    );
    let label = gtk::Label::new(Some(&label_text));
    label.set_halign(gtk::Align::Start);
    label.set_xalign(0.0);
    label.set_hexpand(true);

    let delete_btn = gtk::Button::from_icon_name("edit-delete-symbolic");
    delete_btn.set_tooltip_text(Some(&t!("history.delete_tooltip")));
    delete_btn.add_css_class("flat");
    delete_btn.set_valign(gtk::Align::Center);

    let id = session.id;
    let storage_cl = storage.clone();
    let list_cl = history_list.clone();
    delete_btn.connect_clicked(move |_| {
        {
            let store = storage_cl.borrow();
            if let Some(ref db) = *store {
                if let Err(e) = db.delete_session(id) {
                    tracing::warn!("Error eliminando sesión {id}: {e}");
                    return;
                }
            } else {
                return;
            }
        }
        load_history_page_widget(&list_cl, &gtk::Button::new(), &storage_cl, 3, "");
    });

    box_widget.append(&label);
    box_widget.append(&delete_btn);

    let row = gtk::ListBoxRow::new();
    row.set_child(Some(&box_widget));
    row.set_widget_name(&session.id.to_string());
    row
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
        status.set_text(&t!("export.none"));
        return;
    };

    let left_text = get_buffer_text(left);
    let right_text = get_buffer_text(right);

    let (content, extension, mime) = match export_fmt {
        ExportFormat::Txt => (export::export_txt(result, fmt), "txt", "text/plain"),
        ExportFormat::Html => (
            export::export_html(result, fmt, &left_text, &right_text),
            "html",
            "text/html",
        ),
    };

    // Diálogo para guardar archivo
    let dialog = gtk::FileDialog::builder()
        .title(&*t!("export.dialog_title"))
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
                            status.set_text(&t!(
                                "export.write_success",
                                path = path.display().to_string()
                            ));
                        }
                        Err(e) => {
                            status.set_text(&t!("export.write_error", error = e.to_string()));
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
    view.add_css_class("rustdiff-editor");

    // Reaccionar a cambios de tema oscuro/claro del sistema
    let buf_clone = view.buffer();
    adw::StyleManager::default().connect_dark_notify(move |sm| {
        let new_scheme = if sm.is_dark() {
            "Adwaita-dark"
        } else {
            "Adwaita"
        };
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
        .title(&*t!("export.open_dialog_title"))
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

// ─────────────────────────────────────────────
// Zoom con Ctrl + rueda del ratón
// ─────────────────────────────────────────────

const ZOOM_DEFAULT_PT: f64 = 11.0;
const ZOOM_MIN_PT: f64 = 6.0;
const ZOOM_MAX_PT: f64 = 40.0;
const ZOOM_STEP_PT: f64 = 1.0;

/// Conecta un `EventControllerScroll` a ambos editores para ajustar el
/// tamaño de fuente cuando el usuario mantiene `Ctrl` y mueve la rueda.
/// El tamaño se aplica vía un `CssProvider` compartido — así ambos
/// editores se escalan a la vez.
fn setup_editor_zoom(left: &sv::View, right: &sv::View) {
    let zoom = Rc::new(Cell::new(ZOOM_DEFAULT_PT));
    let provider = gtk::CssProvider::new();
    provider.load_from_string(&zoom_css(ZOOM_DEFAULT_PT));

    if let Some(display) = gtk::gdk::Display::default() {
        gtk::style_context_add_provider_for_display(
            &display,
            &provider,
            gtk::STYLE_PROVIDER_PRIORITY_APPLICATION + 10,
        );
    }

    for view in [left, right] {
        let controller = gtk::EventControllerScroll::new(gtk::EventControllerScrollFlags::VERTICAL);
        let zoom = zoom.clone();
        let provider = provider.clone();
        controller.connect_scroll(move |ctrl, _dx, dy| {
            let modifier = ctrl
                .current_event()
                .map(|e| e.modifier_state())
                .unwrap_or_else(gtk::gdk::ModifierType::empty);
            if !modifier.contains(gtk::gdk::ModifierType::CONTROL_MASK) {
                return gtk::glib::Propagation::Proceed;
            }

            let mut pt = zoom.get();
            if dy < 0.0 {
                pt = (pt + ZOOM_STEP_PT).min(ZOOM_MAX_PT);
            } else if dy > 0.0 {
                pt = (pt - ZOOM_STEP_PT).max(ZOOM_MIN_PT);
            } else {
                return gtk::glib::Propagation::Proceed;
            }
            zoom.set(pt);
            provider.load_from_string(&zoom_css(pt));
            gtk::glib::Propagation::Stop
        });
        view.add_controller(controller);
    }
}

/// Construye la pantalla de bienvenida que se muestra al iniciar.
fn build_welcome_screen() -> (gtk::Box, gtk::Button, gtk::Button, gtk::Button) {
    let container = gtk::Box::new(gtk::Orientation::Vertical, 16);
    container.set_valign(gtk::Align::Center);
    container.set_halign(gtk::Align::Center);
    container.set_margin_top(40);
    container.set_margin_bottom(40);

    let title = gtk::Label::new(Some("RustDiff"));
    title.add_css_class("title-1");
    title.set_margin_bottom(4);

    let subtitle = gtk::Label::new(Some(&t!("welcome.subtitle")));
    subtitle.add_css_class("body");
    subtitle.set_margin_bottom(24);

    let btn_doc = gtk::Button::with_label(&t!("welcome.open_document"));
    btn_doc.add_css_class("suggested-action");
    btn_doc.set_halign(gtk::Align::Center);
    btn_doc.set_width_request(220);

    let btn_new = gtk::Button::with_label(&t!("welcome.new_comparison"));
    btn_new.set_halign(gtk::Align::Center);
    btn_new.set_width_request(220);

    let btn_history = gtk::Button::with_label(&t!("welcome.view_history"));
    btn_history.add_css_class("flat");
    btn_history.set_halign(gtk::Align::Center);

    container.append(&title);
    container.append(&subtitle);
    container.append(&btn_doc);
    container.append(&btn_new);
    container.append(&btn_history);

    (container, btn_doc, btn_new, btn_history)
}

fn zoom_css(pt: f64) -> String {
    format!(".rustdiff-editor, .rustdiff-editor text {{ font-size: {pt:.1}pt; }}")
}
