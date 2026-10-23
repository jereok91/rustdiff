# Releasing RustDiff

Everything downstream hangs off one thing: **pushing a `v*` tag**. Three
workflows fire on it in parallel, each publishing to a different channel.
This document is the checklist for getting the repository into a state
where that tag is correct.

**Current version: 1.0.4.** Since 1.0.0 the app is
the Tauri shell in `desktop/` + `desktop/src-tauri/`. crates.io and the
Homebrew source formula are retired (see the bottom of this page).

## What a `v*` tag triggers

| Workflow | Channel | What it publishes |
| --- | --- | --- |
| `release-deb-apt.yml` | Debian / APT | `.deb` for amd64 + arm64 (`pnpm tauri build --bundles deb` via `scripts/packaging/build-deb.sh`), attached to the GitHub release and pushed to the signed APT repo on `gh-pages` |
| `release-flathub.yml` | Flathub | Builds and attaches `rustdiff-frontend-<version>.tar.gz` (the frontend bundle), regenerates `cargo-sources.json`, bumps `tag`/`commit` and the frontend `url`/`sha256` in the **upstream** `flathub/com.digitalgex.RustDiff` repo and opens a PR there |
| `release-macos.yml` | macOS DMG + `rustdiff-app` cask | Per-arch DMGs (`pnpm tauri build --bundles app` on macOS runners, then `hdiutil create`: Tauri's `bundle_dmg.sh` needs Finder/AppleScript, which headless runners lack), renamed to `RustDiff-<version>-macos-<arch>.dmg`, cask updated in the tap |

`install.sh` is not a workflow: on Debian/Ubuntu it downloads the `.deb` of
the latest release, elsewhere it builds the checkout/`main` from source.

## Release candidates

An RC builds the same artifacts a final release does and attaches them to a
GitHub **prerelease**, without promoting anything. RCs are cut from `canary`.

**Tag taxonomy.** An RC is `vX.Y.Z-rc.N`; the final is `vX.Y.Z`. Semver sorts
the prerelease before the final, so the final always wins.

**RC round.**

1. Bump the three version files to `X.Y.Z-rc.N`: `Cargo.toml` workspace
   version, `desktop/package.json`, `desktop/src-tauri/tauri.conf.json`.
2. Commit `chore(release): X.Y.Z-rc.N` on `canary`.
3. `git tag vX.Y.Z-rc.N && git push origin vX.Y.Z-rc.N`.

**What a `v*-rc.*` tag does.** It attaches the `.deb` (both arches), the
per-arch DMGs and the frontend tarball to a GitHub **prerelease**, and
`release-flathub.yml` builds the Flatpak bundle as a workflow artifact. The
release stays a prerelease, so it never becomes "latest" — which is what
`install.sh` and the site resolve against.

**What it does not do.** No publish to the APT repository (`publish-apt` is
skipped), no Homebrew cask update (`update-cask` is skipped), no PR on Flathub
(`update-flathub` is skipped). Every promotion job is gated on
`!contains(github.ref_name, '-')`.

**Testing the Flatpak.** Run the `release-flathub.yml` workflow manually
(`workflow_dispatch`) and download the `rustdiff-<version>.flatpak` artifact
from the run; install it with
`flatpak install --user rustdiff-<version>.flatpak`. A manual run builds the
default branch and takes the version from `desktop/src-tauri/tauri.conf.json`;
the bundle is built from the manifest at the repository root (frontend from the
checkout), so it never touches `flathub/`.

**Promotion.**

1. Bump the three files to `X.Y.Z` and commit `chore(release): X.Y.Z` on
   `canary`; push.
2. `git checkout main && git merge --ff-only canary`
3. `git tag vX.Y.Z`
4. `git push origin main vX.Y.Z`

That final tag runs the existing full-release pipelines unchanged (see the
checklist below). `main` must be exactly the commit that was tested: a fix
after `vX.Y.Z-rc.N` means `vX.Y.Z-rc.N+1`, never a different tree under the
final tag.

The AppStream `<release>` entry in `data/com.digitalgex.RustDiff.metainfo.xml`
is added only for the final version: Flathub rejects a build whose metainfo has
no entry for the version being published, and RCs never reach Flathub.

RC artifacts stay public on the prerelease — their links are what testers use.
They can be deleted once the final release is out.

## Checklist

1. **Bump the version** — three files, they do not read each other:
   - `Cargo.toml` → `[workspace.package].version` (every crate inherits it)
   - `desktop/package.json` → `version`
   - `desktop/src-tauri/tauri.conf.json` → `version` (what the bundles are named after)
   - `Cargo.lock` → refresh with any `cargo build`
2. **Add the AppStream release entry** in
   `data/com.digitalgex.RustDiff.metainfo.xml` (`<release version=… date=…>`,
   newest first, with a `<description>` that mirrors the release notes).
   Flathub rejects builds whose metainfo has no entry for the version being
   published.
3. **Update the user-facing docs**: `README.md` and `README.es.md`
   (features, shortcut table, release-notes link), plus
   `docs/RELEASE_NOTES_<version>.md` (Keep a Changelog sections: Added,
   Changed, Fixed, Removed, Breaking, Notes).
4. **Check the packaging file lists** if you added an installed file (icon,
   metainfo, desktop entry). Four places install files and they do *not*
   share a single list:
   - `desktop/src-tauri/tauri.conf.json` → `bundle.linux.deb.files` / `bundle.icon` (.deb)
   - `com.digitalgex.RustDiff.yaml` and `flathub/com.digitalgex.RustDiff.yaml` → `build-commands`
   - `install.sh` → `install_user_files` (per-user source build)
   - the DMG needs nothing: the frontend is embedded in the binary

   The app icon is `data/icons/com.digitalgex.RustDiff.svg` plus a PNG set
   rendered from it in `data/icons/hicolor/<size>/apps/`. Flatpak installs both:
   `appstreamcli compose` needs a PNG for every size it caches (48, 64, 128
   and their `@2` variants) or it falls back to decoding the SVG, which the
   Flathub builder fails on (`icon-file-read-error`). If the SVG changes,
   regenerate the PNGs:

   ```bash
   for spec in 48x48:48 64x64:64 128x128:128 256x256:256 512x512:512 64x64@2:128 128x128@2:256; do
       d=${spec%%:*}; px=${spec##*:}; mkdir -p data/icons/hicolor/$d/apps
       rsvg-convert -w $px -h $px data/icons/com.digitalgex.RustDiff.svg \
           -o data/icons/hicolor/$d/apps/com.digitalgex.RustDiff.png
   done
   ```
5. **Regenerate `cargo-sources.json`** if `Cargo.lock` changed in its
   registry crates (see [Flatpak](#flatpak-sources)), and copy it to
   `flathub/cargo-sources.json`. A version bump alone only rewrites the
   workspace crates, which are path dependencies and not vendored.
6. **Validate locally** (see next section).
7. **Commit, tag, push** — el bump y las notas van en `canary`, y `main` solo
   recibe el merge de `canary` (nunca commits directos):

   ```bash
   git checkout canary
   git add -A && git commit -m "chore(release): X.Y.Z"
   git push origin canary

   git checkout main && git merge --ff-only canary
   git tag vX.Y.Z
   git push origin main
   git push origin vX.Y.Z       # this is what starts every publish
   ```

8. **Review and merge the Flathub PR** that `release-flathub.yml` opens in
   `flathub/com.digitalgex.RustDiff` once Flathub's own build bot is green.
   That merge is what publishes the Flathub build; nothing reaches Flathub
   users before it.
9. **Check the Homebrew tap**: `release-macos.yml` rewrites
   `Casks/rustdiff-app.rb` in `jereok91/homebrew-rustdiff`; confirm the commit
   landed (see [Homebrew tap](#homebrew-tap-separate-repository) for the
   one-time manual change).
10. **Sync the local Flathub mirror** afterwards and commit it separately:
   `tag`, `commit` (what the tag points at), and the frontend `url`/`sha256`
   from the release asset (`sha256sum rustdiff-frontend-X.Y.Z.tar.gz`).

   This mirror is documentation only — the published Flathub build comes
   from the upstream `flathub/com.digitalgex.RustDiff` repo, which
   `release-flathub.yml` updates by PR. Changes to `build-commands` here
   still need a manual PR upstream to take effect.

## Local validation

```bash
# Rust: format, lint, tests of every crate (the Tauri shell needs WebKitGTK dev packages)
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --all-targets

# Frontend
cd desktop && pnpm install && pnpm build && pnpm test && cd ..

# Debian package: name, binary, desktop file, metainfo, depends
bash scripts/packaging/build-deb.sh
DEB=target/release/bundle/deb/rustdiff_X.Y.Z_amd64.deb
ar p "$DEB" control.tar.gz | tar -xzO control
ar p "$DEB" data.tar.gz | tar -tz

# AppStream + desktop entry (Flathub gates on these)
appstreamcli validate data/com.digitalgex.RustDiff.metainfo.xml
desktop-file-validate data/com.digitalgex.RustDiff.desktop

# Flatpak, end to end (needs org.gnome.{Platform,Sdk}//50 + rust-stable;
# downloads the crates listed in cargo-sources.json on the first run)
(cd desktop && pnpm build)
flatpak-builder --force-clean --disable-rofiles-fuse build-dir com.digitalgex.RustDiff.yaml
flatpak build --socket=wayland --socket=fallback-x11 --share=ipc --device=dri \
    --env=WAYLAND_DISPLAY="$WAYLAND_DISPLAY" build-dir rustdiff
```

macOS cannot be validated from Linux; `release-macos.yml` builds it on
macOS runners (`workflow_dispatch` re-runs it for an existing tag).

## Flatpak sources

`cargo-sources.json` vendors every crate in `Cargo.lock` for the offline
Flatpak build. Regenerate it whenever the lock changes:

```bash
python3 -m venv .flatpak-tools/venv
.flatpak-tools/venv/bin/pip install aiohttp tomlkit
.flatpak-tools/venv/bin/python3 .flatpak-tools/flatpak-cargo-generator.py Cargo.lock -o cargo-sources.json
cp cargo-sources.json flathub/cargo-sources.json
```

The frontend is not built inside the Flatpak sandbox: the local manifest uses
`desktop/dist` from the checkout and the Flathub manifest uses the
`rustdiff-frontend-<version>.tar.gz` release asset. See `flathub/README.md`
for why and for the from-source alternative.

## Homebrew tap (separate repository)

`jereok91/homebrew-rustdiff` is a separate repository. `release-macos.yml`
rewrites `Casks/rustdiff-app.rb` on every tag. Two one-time manual changes for
1.0.0 (the first Tauri release), in the tap:

1. **Retire `Formula/rustdiff.rb`.** It built the GTK app with
   `cargo install` from the source tarball; the root of the repository is no
   longer a package, so it cannot build any more. Either delete it or mark it
   `disable! date: "2026-10-14", because: "replaced by the rustdiff-app cask"`
   so existing users get a clear message. `release-homebrew.yml` (which bumped
   it) is removed from this repository.
2. **Nothing else in the cask**: the workflow writes it whole (same URL scheme,
   `RustDiff.app`, `Contents/MacOS/rustdiff`).

## Retired channels

- **crates.io** (decision D7 of the Tauri migration): `publish.yml` is gone and
  every crate is `publish = false`. `cargo install rustdiff` keeps installing
  0.4.x, the last GTK release.
- **Homebrew source formula**: see above.
