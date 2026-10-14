//! Invariante del nucleo: `rustdiff-core` no puede depender de ninguna UI.
//!
//! Es la razon de ser de este crate: si el nucleo dejara de ser agnostico del
//! toolkit, la migracion a otro frontend volveria a arrastrar la logica de
//! comparacion consigo. El test falla tambien si no encuentra los modulos, para
//! que no pueda pasar por vacio.

use std::fs;
use std::path::{Path, PathBuf};

/// Tokens que delatan acoplamiento a una UI dentro del codigo.
///
/// Se revisan linea por linea saltando comentarios: este crate documenta en
/// prosa la division con la capa grafica, y nombrar el toolkit no es depender
/// de el. Lo que no se permite es usarlo.
const PROHIBIDO_EN_CODIGO: &[&str] = &[
    "gtk4",
    "gtk::",
    "libadwaita",
    "adw::",
    "sourceview",
    "cairo::",
    "sv::",
    "tauri::",
    "webkit",
];

/// Lo mismo, aplicado al manifiesto: una dependencia prohibida basta.
const PROHIBIDO_EN_MANIFIESTO: &[&str] = &["gtk4", "libadwaita", "sourceview", "cairo", "tauri"];

/// Cantidad de modulos del nucleo. Si baja de aca, el test avisa en vez de
/// recorrer una carpeta vacia y pasar sin revisar nada.
const MODULOS_ESPERADOS: usize = 4;

/// Una linea de comentario Rust no acopla nada: se ignora.
fn es_comentario_rust(linea: &str) -> bool {
    let limpia = linea.trim_start();
    limpia.starts_with("//") || limpia.starts_with("/*") || limpia.starts_with('*')
}

/// Idem para TOML: las lineas que empiezan con `#` son comentarios.
fn es_comentario_toml(linea: &str) -> bool {
    linea.trim_start().starts_with('#')
}

fn recolectar_rs(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            recolectar_rs(&path, out);
        } else if path.extension().is_some_and(|e| e == "rs") {
            out.push(path);
        }
    }
}

#[test]
fn el_nucleo_no_depende_de_ui() {
    let raiz = PathBuf::from(env!("CARGO_MANIFEST_DIR"));

    let mut fuentes = Vec::new();
    recolectar_rs(&raiz.join("src"), &mut fuentes);
    assert!(
        fuentes.len() >= MODULOS_ESPERADOS,
        "se esperaban al menos {MODULOS_ESPERADOS} modulos del nucleo en src/, se encontraron {}",
        fuentes.len()
    );

    for archivo in &fuentes {
        let texto = fs::read_to_string(archivo).expect("no se pudo leer el modulo del nucleo");
        for (indice, linea) in texto.lines().enumerate() {
            if es_comentario_rust(linea) {
                continue;
            }
            for token in PROHIBIDO_EN_CODIGO {
                assert!(
                    !linea.contains(token),
                    "{}:{} usa `{token}`: el nucleo no debe conocer ninguna UI",
                    archivo.display(),
                    indice + 1
                );
            }
        }
    }

    let manifiesto = fs::read_to_string(raiz.join("Cargo.toml")).expect("no se pudo leer Cargo.toml");
    for (indice, linea) in manifiesto.lines().enumerate() {
        if es_comentario_toml(linea) {
            continue;
        }
        for token in PROHIBIDO_EN_MANIFIESTO {
            assert!(
                !linea.contains(token),
                "Cargo.toml del nucleo, linea {}: declara `{token}`: no puede depender de una UI",
                indice + 1
            );
        }
    }
}
