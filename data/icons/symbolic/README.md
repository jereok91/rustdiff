# Bundled symbolic icons

Fallback copies of the symbolic icons RustDiff uses in its header bar and
graph toolbar. They are only a *fallback*: GTK resolves an icon from the
user's icon theme first and reaches this directory (added as an extra icon
search path in `src/ui/main_window.rs`) only when the theme has no icon
under that name.

All files are fill-based (`<path fill="…">`, no `stroke`) because GTK only
recolors `fill` when rendering a `-symbolic` icon — stroke-based artwork
stays dark and becomes invisible on dark themes.

## Sources

| File | Origin | License |
| --- | --- | --- |
| `document-open-recent-symbolic.svg` | [GNOME/adwaita-icon-theme](https://github.com/GNOME/adwaita-icon-theme) | CC-BY-SA 3.0 / LGPL-3.0 |
| `format-justify-left-symbolic.svg` | [GNOME/adwaita-icon-theme](https://github.com/GNOME/adwaita-icon-theme) | CC-BY-SA 3.0 / LGPL-3.0 |
| `view-list-symbolic.svg` | [GNOME/adwaita-icon-theme](https://github.com/GNOME/adwaita-icon-theme) | CC-BY-SA 3.0 / LGPL-3.0 |
| `zoom-in-symbolic.svg` | [GNOME/adwaita-icon-theme](https://github.com/GNOME/adwaita-icon-theme) | CC-BY-SA 3.0 / LGPL-3.0 |
| `zoom-out-symbolic.svg` | [GNOME/adwaita-icon-theme](https://github.com/GNOME/adwaita-icon-theme) | CC-BY-SA 3.0 / LGPL-3.0 |
| `zoom-fit-best-symbolic.svg` | [GNOME/adwaita-icon-theme](https://github.com/GNOME/adwaita-icon-theme) | CC-BY-SA 3.0 / LGPL-3.0 |
| `rustdiff-graph-symbolic.svg` | [twbs/icons](https://github.com/twbs/icons) (`diagram-3-fill`) | MIT |

`rustdiff-graph-symbolic` uses an app-private name on purpose: no
freedesktop icon name describes a node graph, so a private name guarantees
the same artwork on every desktop instead of whatever a theme happens to
ship under a generic name.

## Packaging

Every `*.svg` here is shipped by wildcard: Flatpak
(`com.digitalgex.RustDiff.yaml`), Debian (`assets` in `Cargo.toml`), the
macOS bundle (`scripts/packaging/build-macos-app.sh`) and `install.sh`
(per-user, into `~/.local/share/icons/hicolor/scalable/actions/`). Adding a
file here needs no packaging change.
