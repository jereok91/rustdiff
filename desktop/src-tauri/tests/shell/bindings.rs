//! Drift del contrato generado (D6).
//!
//! `desktop/src/bindings.ts` se genera desde las firmas de los comandos. Este
//! test lo regenera en el directorio temporal del crate y lo compara con el
//! archivo commiteado: si el backend cambia y nadie regenera, falla acá y no en
//! la UI.
//!
//! Regenerar: `pnpm bindings` (o `RUSTDIFF_UPDATE_BINDINGS=1 cargo test
//! -p rustdiff-desktop --test bindings`).

use std::path::{Path, PathBuf};

use rustdiff_desktop::{bindings_path, export_bindings};

fn generated_path() -> PathBuf {
    Path::new(env!("CARGO_TARGET_TMPDIR")).join("bindings.generated.ts")
}

#[test]
fn los_bindings_commiteados_estan_al_dia() {
    let generated = generated_path();
    export_bindings(&generated).expect("no se pudieron generar los bindings TypeScript");

    // Modo regeneracion: pisa el archivo commiteado y termina.
    if std::env::var_os("RUSTDIFF_UPDATE_BINDINGS").is_some() {
        let committed = bindings_path();
        std::fs::copy(&generated, &committed).expect("no se pudieron actualizar los bindings");
        return;
    }

    let expected = std::fs::read_to_string(&generated).expect("no se pudo leer el archivo generado");
    let committed = bindings_path();
    let actual = std::fs::read_to_string(&committed)
        .unwrap_or_else(|error| panic!("falta {} ({error}); regenerar con `pnpm bindings`", committed.display()));

    assert_eq!(
        actual,
        expected,
        "{} quedó atrás respecto del contrato Rust; regenerar con `pnpm bindings`",
        committed.display()
    );
}
