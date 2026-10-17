# RustDiff 1.0.3

Tag: `v1.0.3`. Date: 2026-10-17.

Desktop-integration and editor-highlight fixes. No interface, contract or data
changes.

## Fixed

- **The window announced itself with the binary name, not with the app id.**
  GTK3 takes the Wayland app id from the process name (`rustdiff`), so the
  desktop could not tie the window to `com.digitalgex.RustDiff.desktop`: the
  title bar and the task bar fell back to a generic icon and the window was not
  grouped with its launcher. The program name is now set to the identifier
  before the first surface exists, and `StartupWMClass` in the desktop entry
  matches it on X11.

- **The editor highlighting drifted when the right document appends an array
  element that copies the left one.** A plain line-by-line diff picks the
  nearest similar block, so it paired the left element with the appended copy
  and painted the element that the differences table reported as *modified* as
  one big added block. The two editors now anchor their alignment on the paths
  of the semantic diff (JSON): the changed items are paired line by line and the
  added element is the only added block. XML and SQL keep the previous
  line-by-line behaviour.

- **The focused editor's ring was open on the side of the line numbers.** The
  ring was an `outline` on the CodeMirror editor, and CodeMirror's sticky gutter
  (which has its own stacking order) painted over its left side. The ring is now
  drawn by the editor container, which includes the gutter.

## Notes

- History and preferences are untouched: no migration and nothing to
  reconfigure.
- Flatpak, `.deb`, DMG and the per-user source build ship the same binary.
