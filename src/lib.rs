// Locales embebidos en tiempo de compilacion desde locales/*.yml.
// Genera el macro `t!` disponible en todo el crate para resolver strings
// traducidas segun el idioma activo (ver src/app.rs::setup_locale).
rust_i18n::i18n!("locales", fallback = "en");

// El nucleo (parser, diff_engine, graph, export) y la persistencia (storage,
// settings) viven en los crates del workspace `rustdiff-core` y
// `rustdiff-persist`: este paquete es solo la app GTK que los consume.
pub mod app;
pub mod ui;
