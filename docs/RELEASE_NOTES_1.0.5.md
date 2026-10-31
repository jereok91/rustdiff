# RustDiff 1.0.5

Tag: `v1.0.5`. Date: 2026-10-31.

A design and release-infrastructure release: the exit prompt is rebuilt, the app
ships its real icon, and the project gains a release-candidate lane so a build
can be tested before it is published.

## Added

- **A release-candidate lane.** A `vX.Y.Z-rc.N` tag now builds and attaches the
  `.deb` (both arches), the per-arch DMGs and the frontend tarball to a GitHub
  **prerelease**, and builds an installable Flatpak bundle as a workflow
  artifact. It never publishes to the APT repository, never pushes the Homebrew
  cask and never opens a pull request on Flathub: every promotion job is gated on
  `!contains(github.ref_name, '-')`, and a promotion job also requires a tag
  *push*, so a manual dispatch cannot trigger it.

  `docs/RELEASING.md` documents the round and the promotion; `CONTRIBUTING.md`
  records that tags and version bumps belong to the maintainer.

- **`Ctrl`/`Cmd`+`S` in the exit prompt** saves the session to History, which the
  button's shortcut chip announces.

## Changed

- **The exit prompt is rebuilt** on the design system: a warning accent, an icon
  tile, an *Unsaved* badge, a strip with the pending changes and their state, the
  two exports grouped in one row, and a footer with the real shortcuts. The copy
  says what is true: the edits live in memory only, nothing recovers them
  automatically.

- **The app icons are regenerated** from `data/icons/com.digitalgex.RustDiff.svg`
  with the Tauri CLI, and the header shows the app icon where it used to show a
  generic glyph.

## Fixed

- **The exit prompt no longer puts "Close without saving" one Tab away from
  Cancel.** The first version of the redesign placed the destructive answer
  right after the auto-focused Cancel, so Tab then Enter discarded unsaved work.
  It is now the last answer in the tab order, and the test asserts the adjacency
  from Cancel instead of reading a total order that never simulated the keypress.

## Notes

- No migration and nothing to reconfigure: history, preferences and comparison
  behaviour are untouched.
- Flatpak, `.deb`, DMG and the per-user source build ship the same binary.
- If a desktop shell still shows a generic icon for RustDiff, the shell is
  resolving a cached entry: refreshing the icon cache (or restarting the panel)
  makes it pick up the installed icon set.
