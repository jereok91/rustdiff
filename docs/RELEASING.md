# Releasing RustDiff

Everything downstream hangs off one thing: **pushing a `v*` tag**. Four
workflows fire on it in parallel, each publishing to a different channel.
This document is the checklist for getting the repository into a state
where that tag is correct.

## What a `v*` tag triggers

| Workflow | Channel | What it publishes |
| --- | --- | --- |
| `publish.yml` | crates.io | `cargo publish` of the `.crate` (uses the `include` list in `Cargo.toml`) |
| `release-deb-apt.yml` | Debian / APT | `.deb` for amd64 + arm64, attached to the GitHub release and pushed to the signed APT repo on `gh-pages` |
| `release-flathub.yml` | Flathub | Regenerates `cargo-sources.json`, bumps `tag`/`commit` in the **upstream** `flathub/com.digitalgex.RustDiff` repo and opens a PR there |
| `release-macos.yml` | macOS DMG + `rustdiff-app` cask | Per-arch self-contained `RustDiff.app` DMGs built on macOS runners, cask updated in the tap |
| `release-homebrew.yml` | Homebrew source formula | Bumps `url`/`sha256` of `Formula/rustdiff.rb` in `jereok91/homebrew-rustdiff` |

`install.sh` is not a workflow: it runs `cargo install rustdiff`, so it
follows crates.io automatically, plus the per-user desktop/icon files it
installs itself.

## Checklist

1. **Bump the version**
   - `Cargo.toml` → `version`
   - `Cargo.lock` → refresh with any `cargo build`
2. **Add the AppStream release entry** in
   `data/com.digitalgex.RustDiff.metainfo.xml` (`<release version=… date=…>`,
   newest first). Flathub rejects builds whose metainfo has no entry for
   the version being published.
3. **Update the user-facing docs**: `README.md` and `README.es.md`
   (features, shortcut table), plus `docs/RELEASE_NOTES_<version>.md`.
4. **Check the packaging file lists** if you added any runtime asset
   (icons, language specs, locales). Five places install files and they do
   *not* share a single list:
   - `Cargo.toml` → `include` (crates.io) and `[package.metadata.deb].assets` (.deb)
   - `com.digitalgex.RustDiff.yaml` and `flathub/com.digitalgex.RustDiff.yaml` → `build-commands`
   - `scripts/packaging/build-macos-app.sh` → DMG bundle
   - `install.sh` → per-user files for the `cargo install` path
   - `Formula/rustdiff.rb` in the tap → **separate repo, manual** (see below)
5. **Validate locally** (see next section).
6. **Commit, tag, push**:

   ```bash
   git add -A && git commit -m "chore: bump version to X.Y.Z"
   git tag vX.Y.Z
   git push origin main
   git push origin vX.Y.Z       # this is what starts every publish
   ```

7. **Sync the local Flathub mirror** afterwards, pointing at the tag's
   commit, and commit that separately:

   ```bash
   # flathub/com.digitalgex.RustDiff.yaml
   tag: vX.Y.Z
   commit: <sha of the bump commit, i.e. what the tag points at>
   ```

   This mirror is documentation only — the published Flathub build comes
   from the upstream `flathub/com.digitalgex.RustDiff` repo, which
   `release-flathub.yml` updates by PR. Changes to `build-commands` here
   still need a manual PR upstream to take effect.

## Local validation

```bash
cargo fmt --check && cargo clippy --all-targets && cargo test
cargo build --release

# crates.io: what would actually be published
cargo package --no-verify
tar tzf target/package/rustdiff-*.crate | less

# Debian
cargo install cargo-deb --locked   # once
cargo deb --no-build
ar x target/debian/rustdiff_*_amd64.deb && tar tf data.tar.xz

# AppStream + desktop entry (Flathub gates on these)
appstreamcli validate data/com.digitalgex.RustDiff.metainfo.xml
desktop-file-validate data/com.digitalgex.RustDiff.desktop

# Flatpak, end to end (needs org.gnome.{Platform,Sdk}//50 + rust-stable)
flatpak-builder --force-clean --disable-rofiles-fuse build-dir com.digitalgex.RustDiff.yaml
flatpak build --socket=wayland --socket=fallback-x11 --share=ipc --device=dri \
    --env=WAYLAND_DISPLAY="$WAYLAND_DISPLAY" build-dir rustdiff
```

macOS cannot be validated from Linux; `release-macos.yml` builds it on
macOS runners. `bash -n scripts/packaging/build-macos-app.sh` at least
catches syntax errors before the tag.

## Homebrew tap: the one manual step

`jereok91/homebrew-rustdiff` is a separate repository. The workflows only
rewrite `url`/`sha256` (formula) and the DMG URLs (cask) — they never touch
the `install` block. The source formula currently installs the binary, the
desktop file, the metainfo and the app icon, but **not** the bundled
symbolic icons or the language specs, so `brew install jereok91/rustdiff/rustdiff`
gets a graph button with a broken icon and no SQL highlighting. (The
`rustdiff-app` cask is unaffected: the DMG bundles everything.)

Fix, in `Formula/rustdiff.rb` inside `def install`, next to the existing
`share/` installs:

```ruby
    (share/"rustdiff/icons/symbolic/hicolor/scalable/actions").install
      Dir["data/icons/symbolic/hicolor/scalable/actions/*.svg"]
    (share/"rustdiff/language-specs").install Dir["data/language-specs/*.lang"]
```

Those land in `<prefix>/share/rustdiff/…`, which is exactly where
`register_bundled_icons` and `build_language_manager` look when the binary
lives in `<prefix>/bin` (`src/ui/main_window.rs`).

## Runtime resource search paths

Any resource RustDiff loads at runtime is looked up in the same four
places, in this order (`src/ui/main_window.rs`):

1. `data/…` — relative, for `cargo run` in a checkout
2. `/usr/share/rustdiff/…` — `.deb` and system installs
3. `/app/share/rustdiff/…` — Flatpak
4. `$RUSTDIFF_DATA_DIR/…` — exported by the macOS `.app` launcher
5. `<dir of binary>/../share/rustdiff/…` — Homebrew and other relocatable prefixes

Replicate this pattern for any new bundled resource instead of hardcoding
one path.
