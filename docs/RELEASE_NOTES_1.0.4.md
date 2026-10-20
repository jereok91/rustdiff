# RustDiff 1.0.4

Tag: `v1.0.4`. Date: 2026-10-20.

A feature release: the editors now recognise JSON that arrives with the quotes
escaped, and offer to unescape it. Plus the contribution rules and the `canary`
branch.

## Added

- **Escaped-JSON detection with an offer, never an automatic change.** When a
  document is JSON whose quotes carry a backslash — `{\"a\":1}`, what you get
  when JSON is serialised inside another string, as a log or a portal returns
  it — a notice appears above the editors with an **Unescape and compare**
  button.

  The notice only appears when the document does **not** already parse and the
  unescaped text does, so a valid document is never touched and no suggestion
  can change a document's meaning. Applying it replaces the editor content and
  compares again; dismissing it keeps it away for that text, and the suggestion
  is dropped if the document changed in the meantime.

  The unescape replaces `\"` and nothing else: leading and trailing whitespace
  is preserved. The detection and the validation live in `rustdiff-core`
  (`unescape_escaped_json`) behind the `unescape_json` command, so the
  interface still does not parse documents.

- **`CONTRIBUTING.md`**, in Spanish with an English summary of the rules that
  matter: Conventional Commits, tests mandatory before a pull request, one
  problem per pull request, and versions, tags and packaging reserved for the
  maintainer.

## Changed

- **`main` only holds released code.** Contributions branch from and target
  `canary`; the maintainer promotes `canary` to `main` and tags from there
  (`docs/RELEASING.md`).
- The CI runs on `canary` as well, so a pull request against it gets the same
  checks as one against `main`.

## Fixed

- `pnpm bindings` pointed at a test target that no longer exists (`bindings`
  instead of `shell`) and always failed; it regenerates
  `desktop/src/bindings.ts` again.

## Notes

- History, preferences and the existing comparison behaviour are untouched: no
  migration and nothing to reconfigure.
- Flatpak, `.deb`, DMG and the per-user source build ship the same binary.
