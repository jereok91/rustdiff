//! Panel inferior que muestra la tabla de diferencias.
//!
//! Usa un `gtk4::ColumnView` con cuatro columnas:
//! [Tipo] [Ruta] [Valor Izquierdo] [Valor Derecho]
//!
//! Cada fila representa un `DiffItem`. Los colores de fondo
//! varían según el tipo de diferencia (Added/Removed/Changed).

use gtk4 as gtk;
use gtk4::subclass::prelude::ObjectSubclassIsExt;
use gtk::prelude::*;
use gtk::glib;
use std::cell::RefCell;
use std::rc::Rc;

use crate::diff_engine::{DiffItem, DiffKind, DiffResult};

// ─────────────────────────────────────────────
// Colores para las diferencias (RGBA)
// ─────────────────────────────────────────────

// Constantes de color para uso futuro en highlighting inline
pub const COLOR_ADDED: &str = "#2D7A2D";
pub const COLOR_REMOVED: &str = "#7A2D2D";
pub const COLOR_CHANGED: &str = "#7A7A2D";

// ─────────────────────────────────────────────
// GObject wrapper para DiffItem en el modelo de lista
// ─────────────────────────────────────────────

mod imp {
    use super::*;
    use gtk::glib;
    use gtk::subclass::prelude::*;
    use std::cell::RefCell;

    /// GObject que envuelve un `DiffItem` para usarlo dentro de `gio::ListStore`.
    #[derive(Default)]
    pub struct DiffItemObject {
        pub inner: RefCell<Option<DiffItem>>,
    }

    #[glib::object_subclass]
    impl ObjectSubclass for DiffItemObject {
        const NAME: &'static str = "RustDiffItem";
        type Type = super::DiffItemObject;
        type ParentType = glib::Object;
    }

    impl ObjectImpl for DiffItemObject {}
}

glib::wrapper! {
    /// Wrapper GObject para poder almacenar `DiffItem` en un `gio::ListStore`.
    pub struct DiffItemObject(ObjectSubclass<imp::DiffItemObject>);
}

impl DiffItemObject {
    pub fn new(item: DiffItem) -> Self {
        let obj: Self = glib::Object::builder().build();
        obj.imp().inner.replace(Some(item));
        obj
    }

    pub fn inner(&self) -> std::cell::Ref<'_, Option<DiffItem>> {
        self.imp().inner.borrow()
    }
}

// ─────────────────────────────────────────────
// Widget principal del panel de diferencias
// ─────────────────────────────────────────────

/// Panel inferior que muestra las diferencias en formato tabular.
pub struct DiffPanel {
    /// Contenedor raíz del panel (ScrolledWindow con el ColumnView dentro).
    pub widget: gtk::Box,
    /// Modelo de datos: lista de `DiffItemObject`.
    store: gtk::gio::ListStore,
    /// Modelo de selección (expuesto para conectar señales desde fuera).
    pub selection_model: gtk::SingleSelection,
    /// Etiqueta de resumen en la parte superior del panel.
    summary_label: gtk::Label,
    /// Filtros activos: (mostrar added, mostrar removed, mostrar changed).
    filters: Rc<RefCell<(bool, bool, bool)>>,
    /// Todos los items sin filtrar (para re-aplicar filtros).
    all_items: Rc<RefCell<Vec<DiffItem>>>,
}

impl DiffPanel {
    /// Construye el panel de diferencias completo.
    pub fn new() -> Self {
        let filters = Rc::new(RefCell::new((true, true, true)));
        let all_items: Rc<RefCell<Vec<DiffItem>>> = Rc::new(RefCell::new(Vec::new()));

        // ── Contenedor principal (vertical) ─────
        let container = gtk::Box::new(gtk::Orientation::Vertical, 0);
        container.add_css_class("diff-panel");

        // ── Barra de filtros + resumen ──────────
        let toolbar = gtk::Box::new(gtk::Orientation::Horizontal, 8);
        toolbar.set_margin_start(8);
        toolbar.set_margin_end(8);
        toolbar.set_margin_top(4);
        toolbar.set_margin_bottom(4);

        let summary_label = gtk::Label::new(Some("Sin diferencias"));
        summary_label.set_hexpand(true);
        summary_label.set_halign(gtk::Align::Start);
        summary_label.add_css_class("dim-label");

        // Botones toggle para filtrar tipos de diferencia
        let btn_added = gtk::ToggleButton::with_label("✚ Añadidos");
        btn_added.set_active(true);
        btn_added.add_css_class("success");

        let btn_removed = gtk::ToggleButton::with_label("✖ Eliminados");
        btn_removed.set_active(true);
        btn_removed.add_css_class("error");

        let btn_changed = gtk::ToggleButton::with_label("● Modificados");
        btn_changed.set_active(true);
        btn_changed.add_css_class("warning");

        toolbar.append(&summary_label);
        toolbar.append(&btn_added);
        toolbar.append(&btn_removed);
        toolbar.append(&btn_changed);

        container.append(&toolbar);

        // ── Modelo de datos ─────────────────────
        let store = gtk::gio::ListStore::new::<DiffItemObject>();

        // ── Modelo de selección ─────────────────
        let selection_model = gtk::SingleSelection::new(Some(store.clone()));

        // ── ColumnView ──────────────────────────
        let column_view = gtk::ColumnView::new(Some(selection_model.clone()));
        column_view.set_show_row_separators(true);
        column_view.set_show_column_separators(true);

        // Columna: Tipo
        let col_type = create_column("Tipo", 80, |item: &DiffItem| {
            let label = match item.kind {
                DiffKind::Added => "✚ ADDED",
                DiffKind::Removed => "✖ REMOVED",
                DiffKind::Changed => "● CHANGED",
            };
            label.to_string()
        });

        // Columna: Ruta
        let col_path = create_column("Ruta", 300, |item: &DiffItem| {
            item.path.clone()
        });

        // Columna: Valor Izquierdo
        let col_left = create_column("Izquierdo", 250, |item: &DiffItem| {
            item.left.clone().unwrap_or_default()
        });

        // Columna: Valor Derecho
        let col_right = create_column("Derecho", 250, |item: &DiffItem| {
            item.right.clone().unwrap_or_default()
        });

        column_view.append_column(&col_type);
        column_view.append_column(&col_path);
        column_view.append_column(&col_left);
        column_view.append_column(&col_right);

        // ── ScrolledWindow para la tabla ────────
        let scrolled = gtk::ScrolledWindow::builder()
            .hscrollbar_policy(gtk::PolicyType::Automatic)
            .vscrollbar_policy(gtk::PolicyType::Automatic)
            .vexpand(true)
            .min_content_height(150)
            .child(&column_view)
            .build();

        container.append(&scrolled);

        let panel = Self {
            widget: container,
            store,
            selection_model,
            summary_label,
            filters: filters.clone(),
            all_items: all_items.clone(),
        };

        // ── Conectar señales de filtros ─────────
        {
            let filters_c = filters.clone();
            let all_items_c = all_items.clone();
            let store_c = panel.store.clone();
            btn_added.connect_toggled(move |btn| {
                filters_c.borrow_mut().0 = btn.is_active();
                apply_filters(&store_c, &all_items_c.borrow(), &filters_c.borrow());
            });
        }
        {
            let filters_c = filters.clone();
            let all_items_c = all_items.clone();
            let store_c = panel.store.clone();
            btn_removed.connect_toggled(move |btn| {
                filters_c.borrow_mut().1 = btn.is_active();
                apply_filters(&store_c, &all_items_c.borrow(), &filters_c.borrow());
            });
        }
        {
            let filters_c = filters.clone();
            let all_items_c = all_items.clone();
            let store_c = panel.store.clone();
            btn_changed.connect_toggled(move |btn| {
                filters_c.borrow_mut().2 = btn.is_active();
                apply_filters(&store_c, &all_items_c.borrow(), &filters_c.borrow());
            });
        }

        panel
    }

    /// Actualiza el panel con un nuevo resultado de diferencias.
    pub fn update(&self, result: &DiffResult) {
        // Guardar todos los items para filtrado posterior
        let mut items = Vec::new();
        items.extend(result.added.iter().cloned());
        items.extend(result.removed.iter().cloned());
        items.extend(result.changed.iter().cloned());
        items.sort_by(|a, b| a.path.cmp(&b.path));

        *self.all_items.borrow_mut() = items;

        // Aplicar filtros actuales
        apply_filters(&self.store, &self.all_items.borrow(), &self.filters.borrow());

        // Actualizar resumen
        self.summary_label.set_text(&result.summary());
    }

    /// Limpia el panel (cuando se borra el contenido de los editores).
    pub fn clear(&self) {
        self.store.remove_all();
        self.all_items.borrow_mut().clear();
        self.summary_label.set_text("Sin diferencias");
    }
}

// ─────────────────────────────────────────────
// Funciones auxiliares
// ─────────────────────────────────────────────

/// Aplica los filtros activos al store, mostrando solo los tipos habilitados.
fn apply_filters(
    store: &gtk::gio::ListStore,
    items: &[DiffItem],
    filters: &(bool, bool, bool),
) {
    store.remove_all();
    let (show_added, show_removed, show_changed) = *filters;

    for item in items {
        let show = match item.kind {
            DiffKind::Added => show_added,
            DiffKind::Removed => show_removed,
            DiffKind::Changed => show_changed,
        };
        if show {
            store.append(&DiffItemObject::new(item.clone()));
        }
    }
}

/// Crea una columna para el `ColumnView` con un factory que extrae texto del `DiffItem`.
fn create_column(
    title: &str,
    fixed_width: i32,
    extractor: fn(&DiffItem) -> String,
) -> gtk::ColumnViewColumn {
    let factory = gtk::SignalListItemFactory::new();

    factory.connect_setup(|_, list_item| {
        let label = gtk::Label::new(None);
        label.set_halign(gtk::Align::Start);
        label.set_ellipsize(gtk::pango::EllipsizeMode::End);
        label.set_max_width_chars(80);
        list_item
            .downcast_ref::<gtk::ListItem>()
            .unwrap()
            .set_child(Some(&label));
    });

    factory.connect_bind(move |_, list_item| {
        let list_item = list_item.downcast_ref::<gtk::ListItem>().unwrap();
        let obj = list_item.item().and_downcast::<DiffItemObject>().unwrap();
        let label = list_item.child().and_downcast::<gtk::Label>().unwrap();

        let inner = obj.inner();
        if let Some(ref item) = *inner {
            label.set_text(&extractor(item));

            // Aplicar color de fondo según el tipo de diferencia
            label.remove_css_class("diff-added");
            label.remove_css_class("diff-removed");
            label.remove_css_class("diff-changed");
            match item.kind {
                DiffKind::Added => label.add_css_class("diff-added"),
                DiffKind::Removed => label.add_css_class("diff-removed"),
                DiffKind::Changed => label.add_css_class("diff-changed"),
            }
        }
    });

    let column = gtk::ColumnViewColumn::new(Some(title), Some(factory));
    column.set_fixed_width(fixed_width);
    column.set_resizable(true);
    column
}

/// Devuelve el CSS personalizado para los colores de diferencias.
pub fn diff_css() -> &'static str {
    r#"
    .diff-added {
        background-color: rgba(0, 200, 0, 0.2);
        color: #2D7A2D;
    }
    .diff-removed {
        background-color: rgba(200, 0, 0, 0.2);
        color: #7A2D2D;
    }
    .diff-changed {
        background-color: rgba(200, 200, 0, 0.2);
        color: #7A7A2D;
    }
    .diff-panel {
        border-top: 1px solid alpha(currentColor, 0.15);
    }
    .editor-panel {
        font-family: monospace;
    }
    "#
}
