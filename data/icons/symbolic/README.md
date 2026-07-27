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

Every `-symbolic` name referenced from `src/` has a copy here, so no
channel can end up showing GTK's broken-image placeholder. All files come
from [GNOME/adwaita-icon-theme](https://github.com/GNOME/adwaita-icon-theme)
(CC-BY-SA 3.0 / LGPL-3.0) except where noted.

| File | Used by |
| --- | --- |
| `document-open-recent-symbolic.svg` | History toggle |
| `edit-delete-symbolic.svg` | Delete a history entry |
| `format-justify-left-symbolic.svg` | Format documents |
| `go-down-symbolic.svg`, `go-up-symbolic.svg` | Search bar next/previous |
| `open-menu-symbolic.svg` | Main menu |
| `user-trash-symbolic.svg` | Clear history |
| `view-list-symbolic.svg` | Differences panel toggle |
| `zoom-in-symbolic.svg`, `zoom-out-symbolic.svg`, `zoom-fit-best-symbolic.svg` | Graph toolbar |
| `rustdiff-graph-symbolic.svg` — [twbs/icons](https://github.com/twbs/icons) `diagram-3-fill`, MIT | Graph view toggle and empty state |

`rustdiff-graph-symbolic` uses an app-private name on purpose: no
freedesktop icon name describes a node graph, so a private name guarantees
the same artwork on every desktop instead of whatever a theme happens to
ship under a generic name.

Keep this in sync: if you use a new icon name in `src/`, drop its SVG here
too. This check catches drift:

```bash
grep -rho '"[a-z0-9-]*-symbolic"' src/ | tr -d '"' | sort -u > /tmp/used
ls data/icons/symbolic/hicolor/scalable/actions/*.svg | xargs -n1 basename -s .svg | sort > /tmp/bundled
diff /tmp/used /tmp/bundled
```

## Packaging

Every `*.svg` here is shipped by wildcard: Flatpak
(`com.digitalgex.RustDiff.yaml`), Debian (`assets` in `Cargo.toml`), the
macOS bundle (`scripts/packaging/build-macos-app.sh`) and `install.sh`
(per-user, into `~/.local/share/icons/hicolor/scalable/actions/`). Adding a
file here needs no packaging change.
