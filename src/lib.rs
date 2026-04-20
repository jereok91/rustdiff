// Locales embebidos en tiempo de compilacion desde locales/*.yml.
// Genera el macro `t!` disponible en todo el crate para resolver strings
// traducidas segun el idioma activo (ver src/app.rs::setup_locale).
rust_i18n::i18n!("locales", fallback = "en");

pub mod app;
pub mod diff_engine;
pub mod export;
pub mod parser;
pub mod storage;
pub mod ui;
