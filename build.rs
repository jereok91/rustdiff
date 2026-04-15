//! Build script — verifica que las librerias del sistema estan instaladas.
//!
//! RustDiff depende de GTK4, Libadwaita y GtkSourceView5 (librerias C).
//! Si alguna falta, este script detiene la compilacion con un mensaje
//! claro indicando el comando exacto para instalarla segun el SO.

fn main() {
    let mut missing: Vec<&str> = Vec::new();

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

    let names = missing.join(", ");

    eprintln!();
    eprintln!("╔══════════════════════════════════════════════════════════════╗");
    eprintln!("║  ERROR: faltan librerias del sistema para compilar RustDiff ║");
    eprintln!("╚══════════════════════════════════════════════════════════════╝");
    eprintln!();
    eprintln!("  Faltantes: {names}");
    eprintln!();

    if cfg!(target_os = "macos") {
        eprintln!("  macOS (Homebrew):");
        eprintln!("    brew install pkgconf gtk4 libadwaita gtksourceview5");
        eprintln!();
        eprintln!("  NOTA: GTK4 + Libadwaita en macOS es experimental.");
        eprintln!("  RustDiff esta optimizado para Linux (GNOME).");
    } else {
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
    }

    eprintln!();
    std::process::exit(1);
}
