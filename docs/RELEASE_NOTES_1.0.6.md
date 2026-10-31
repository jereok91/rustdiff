# RustDiff 1.0.6

Tag: `v1.0.6`. Date: 2026-10-31.

A polish release: the app has its own icon at last, the screenshots show the
interface as it is today, and two desktop annoyances are gone.

## Changed

- **A new app icon.** An emerald brace, an orange angle bracket and a violet
  not-equal sign on a transparent background replace the old document-pair
  artwork. It is generated from a single SVG into everything that ships an icon:
  the Tauri icon set (PNG sizes, `icns`, `ico`), the hicolor PNG set Flatpak and
  AppStream consume, the scalable SVG the `.deb` installs, and the copy the
  in-app header and welcome screen use. The header brand now shows it.

- **The screenshots were recaptured.** They had drifted: the header carried the
  previous icon and they still included the compositor's own title bar. The set
  now covers JSON, XML and SQL comparisons, the node graph of a JSON and of an
  XML document, the difference table with its filters, and the session history.
  All of them are taken from a borderless window that fills the frame, so only
  the app shows, and every document in them is invented.

- **`README` explains macOS Gatekeeper.** The builds are ad-hoc signed, so
  macOS refuses the first launch as an unidentified developer. The installation
  section now says why, how to allow it once (System Settings → Privacy &
  Security → Open Anyway, or `xattr -cr /Applications/RustDiff.app`), that from
  macOS 15 the right-click bypass no longer works, and that it applies to the
  Homebrew cask too.

## Fixed

- **The WebView's own context menu no longer reloads the app.** Right-clicking
  opened WebKitGTK's menu — Back, Forward, Stop, Reload — and Reload discarded
  everything held in memory: unsaved editors and the comparison in progress.
  The menu is the default action of the DOM `contextmenu` event, so the app
  cancels it.

- **The interface no longer scrolls underneath itself.** Scrolling the
  differences to the end chained the wheel to the viewport, moved the whole
  layout and exposed the empty background, taking focus away from the app.
  `body` hid its overflow but `html` did not; both do now, and the page refuses
  scroll chaining and paints its own background.

## Notes

- No migration and nothing to reconfigure: history, preferences and comparison
  behaviour are untouched.
- Flatpak, `.deb`, DMG and the per-user source build ship the same binary.
- If a file manager or the desktop still shows the previous icon, it is a
  thumbnail or icon cache, not the package: refreshing it picks up the new one.
