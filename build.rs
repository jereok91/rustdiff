//! Build script — verifica que las librerias del sistema estan instaladas.
//!
//! RustDiff depende de GTK4, Libadwaita y GtkSourceView5 (librerias C).
//! Si alguna falta, este script detiene la compilacion con un mensaje
//! claro indicando el comando exacto para instalarla segun la distro.

fn main() {
    let mut missing: Vec<&str> = Vec::new();

    // ── Verificar cada libreria via pkg-config ──
    if pkg_config::probe_library("gtk4").is_err() {
        missing.push("gtk4");
    }
    if pkg_config::probe_library("libadwaita-1").is_err() {
        missing.push("libadwaita-1");
    }
    if pkg_config::probe_library("gtksourceview-5").is_err() {
        missing.push("gtksourceview-5");
    }

    if missing.is_empty() {
        return;
    }

    // ── Construir mensaje de error con instrucciones por distro ──
    let names = missing.join(", ");

    eprintln!();
    eprintln!("╔══════════════════════════════════════════════════════════════╗");
    eprintln!("║  ERROR: faltan librerias del sistema necesarias para        ║");
    eprintln!("║  compilar RustDiff.                                         ║");
    eprintln!("╚══════════════════════════════════════════════════════════════╝");
    eprintln!();
    eprintln!("  Librerias faltantes: {names}");
    eprintln!();
    eprintln!("  Instalalas segun tu distribucion:");
    eprintln!();
    eprintln!("  Arch / CachyOS / Manjaro:");
    eprintln!("    sudo pacman -S gtk4 libadwaita gtksourceview5");
    eprintln!();
    eprintln!("  Fedora:");
    eprintln!("    sudo dnf install gtk4-devel libadwaita-devel gtksourceview5-devel");
    eprintln!();
    eprintln!("  Ubuntu / Debian (24.04+):");
    eprintln!("    sudo apt install libgtk-4-dev libadwaita-1-dev libgtksourceview-5-dev");
    eprintln!();
    eprintln!("  openSUSE:");
    eprintln!("    sudo zypper install gtk4-devel libadwaita-devel gtksourceview5-devel");
    eprintln!();

    std::process::exit(1);
}
