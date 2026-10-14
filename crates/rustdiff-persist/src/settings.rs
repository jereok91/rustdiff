//! Preferencias persistentes del usuario.
//!
//! Se guardan como JSON en `~/.config/rustdiff/settings.json` (o el
//! equivalente XDG en cada SO). El formato es intencionalmente minimo
//! para que el archivo sea facil de editar a mano si hace falta.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Valor del campo `language` cuando se debe detectar del entorno.
pub const LANGUAGE_AUTO: &str = "auto";

/// Idiomas soportados explicitamente en la UI. Cualquier otro valor
/// (incluido `auto`) cae a la deteccion automatica via `LANG`.
pub const SUPPORTED_LANGUAGES: &[&str] = &["en", "es"];

/// Limites de la escala de fuente de la UI (1.0 = 100%). Acotan tanto
/// los atajos de zoom como valores editados a mano en el JSON, para que
/// un valor absurdo no deje la interfaz inusable.
pub const UI_SCALE_MIN: f64 = 0.6;
pub const UI_SCALE_MAX: f64 = 2.0;
pub const UI_SCALE_DEFAULT: f64 = 1.0;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    /// `"auto"`, `"en"` o `"es"`.
    #[serde(default = "default_language")]
    pub language: String,
    /// Escala de fuente global de la UI (1.0 = 100%).
    #[serde(default = "default_ui_scale")]
    pub ui_scale: f64,
}

fn default_language() -> String {
    LANGUAGE_AUTO.into()
}

fn default_ui_scale() -> f64 {
    UI_SCALE_DEFAULT
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            language: default_language(),
            ui_scale: default_ui_scale(),
        }
    }
}

impl Settings {
    /// Devuelve `ui_scale` acotada a `[UI_SCALE_MIN, UI_SCALE_MAX]`.
    /// Un valor no finito (NaN/inf escrito a mano) cae al default.
    pub fn clamped_ui_scale(&self) -> f64 {
        if self.ui_scale.is_finite() {
            self.ui_scale.clamp(UI_SCALE_MIN, UI_SCALE_MAX)
        } else {
            UI_SCALE_DEFAULT
        }
    }

    /// Lee el archivo de settings o devuelve defaults si no existe o esta mal.
    pub fn load() -> Self {
        let Some(path) = settings_path() else {
            return Self::default();
        };
        match std::fs::read_to_string(&path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_else(|e| {
                tracing::warn!("settings.json corrupto, usando defaults: {e}");
                Self::default()
            }),
            Err(_) => Self::default(),
        }
    }

    /// Persiste el archivo. Errores se loguean pero no se propagan.
    pub fn save(&self) {
        let Some(path) = settings_path() else {
            tracing::warn!("No hay directorio de configuracion disponible");
            return;
        };
        if let Some(parent) = path.parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                tracing::warn!("Error creando {:?}: {e}", parent);
                return;
            }
        }
        match serde_json::to_string_pretty(self) {
            Ok(json) => {
                if let Err(e) = std::fs::write(&path, json) {
                    tracing::warn!("Error escribiendo {:?}: {e}", path);
                }
            }
            Err(e) => tracing::warn!("Error serializando settings: {e}"),
        }
    }
}

fn settings_path() -> Option<PathBuf> {
    dirs::config_dir().map(|p| p.join("rustdiff").join("settings.json"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_es_auto() {
        let s = Settings::default();
        assert_eq!(s.language, LANGUAGE_AUTO);
        assert_eq!(s.ui_scale, UI_SCALE_DEFAULT);
    }

    #[test]
    fn serializa_y_deserializa() {
        let original = Settings {
            language: "es".into(),
            ui_scale: 1.3,
        };
        let json = serde_json::to_string(&original).unwrap();
        let parsed: Settings = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.language, "es");
        assert_eq!(parsed.ui_scale, 1.3);
    }

    #[test]
    fn json_incompleto_usa_defaults() {
        // Faltan los campos language y ui_scale
        let parsed: Settings = serde_json::from_str("{}").unwrap();
        assert_eq!(parsed.language, LANGUAGE_AUTO);
        assert_eq!(parsed.ui_scale, UI_SCALE_DEFAULT);
    }

    #[test]
    fn ui_scale_se_acota() {
        let with_scale = |ui_scale: f64| Settings {
            ui_scale,
            ..Default::default()
        };
        assert_eq!(with_scale(10.0).clamped_ui_scale(), UI_SCALE_MAX);
        assert_eq!(with_scale(0.1).clamped_ui_scale(), UI_SCALE_MIN);
        assert_eq!(with_scale(f64::NAN).clamped_ui_scale(), UI_SCALE_DEFAULT);
    }
}
