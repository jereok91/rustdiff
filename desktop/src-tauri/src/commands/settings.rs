//! Preferencias del usuario (idioma y escala de texto).
//!
//! La ruta sigue siendo la de `rustdiff-persist` (`~/.config/rustdiff/settings.json`).
//! Lo que agrega el comando es la normalización: lo que se guarda y lo que se
//! lee ya vienen acotados, así el frontend nunca recibe un valor inusable.

use std::path::{Path, PathBuf};

use rustdiff_persist::settings::{LANGUAGE_AUTO, SUPPORTED_LANGUAGES, Settings, settings_path};

use crate::error::CommandError;

/// Ruta efectiva del archivo de preferencias.
fn default_path() -> Result<PathBuf, CommandError> {
    settings_path().ok_or_else(|| CommandError::io("could not determine the config directory"))
}

/// Deja solo valores válidos: idioma soportado (o `auto`) y escala acotada a
/// `[UI_SCALE_MIN, UI_SCALE_MAX]`.
pub fn normalize(mut settings: Settings) -> Settings {
    let language = settings.language.trim().to_string();
    settings.language = if language == LANGUAGE_AUTO || SUPPORTED_LANGUAGES.contains(&language.as_str()) {
        language
    } else {
        LANGUAGE_AUTO.to_string()
    };
    settings.ui_scale = settings.clamped_ui_scale();
    settings
}

/// Lee las preferencias desde una ruta arbitraria (los tests no tocan `$HOME`).
pub fn settings_get_from(path: &Path) -> Settings {
    normalize(Settings::load_from(path))
}

/// Persiste las preferencias en una ruta arbitraria y devuelve las efectivas.
pub fn settings_save_to(path: &Path, settings: Settings) -> Result<Settings, CommandError> {
    let normalized = normalize(settings);
    normalized
        .save_to(path)
        .map_err(|e| CommandError::from_io(e, format!("could not write `{}`", path.display())))?;
    Ok(normalized)
}

/// Preferencias guardadas, normalizadas.
#[tauri::command]
#[specta::specta]
pub fn settings_get() -> Result<Settings, CommandError> {
    Ok(settings_get_from(&default_path()?))
}

/// Guarda las preferencias y devuelve las efectivas (ya normalizadas).
#[tauri::command]
#[specta::specta]
pub fn settings_save(settings: Settings) -> Result<Settings, CommandError> {
    settings_save_to(&default_path()?, settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn la_escala_y_el_idioma_se_normalizan() {
        let normalized = normalize(Settings {
            language: "fr".into(),
            ui_scale: 99.0,
        });
        assert_eq!(normalized.language, LANGUAGE_AUTO);
        assert_eq!(normalized.ui_scale, rustdiff_persist::settings::UI_SCALE_MAX);

        let kept = normalize(Settings {
            language: " es ".into(),
            ui_scale: 1.2,
        });
        assert_eq!(kept.language, "es");
        assert_eq!(kept.ui_scale, 1.2);
    }

    #[test]
    fn un_archivo_ausente_devuelve_defaults() {
        let settings = settings_get_from(Path::new("/no/existe/settings.json"));
        assert_eq!(settings.language, LANGUAGE_AUTO);
        assert_eq!(settings.ui_scale, rustdiff_persist::settings::UI_SCALE_DEFAULT);
    }
}
