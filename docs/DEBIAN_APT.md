# Debian package and APT repository

This project ships Debian packages in two ways:

- Release asset: downloadable `.deb` file on each tagged GitHub release.
- APT repository: signed repository published on GitHub Pages (PPA-style workflow).

The automation lives in:

- `.github/workflows/release-deb-apt.yml`
- `scripts/packaging/build-deb.sh`
- `scripts/packaging/build-apt-repo.sh`

## What the workflow does

When a tag like `v0.5.0` is pushed:

1. Builds a `.deb` package per architecture with the Tauri bundler
   (`scripts/packaging/build-deb.sh`, which runs `pnpm tauri build --bundles deb`
   in `desktop/`) and checks its identity: package name `rustdiff`,
   architecture, `/usr/bin/rustdiff` and the AppStream metainfo.
2. Uploads it as a workflow artifact.
3. Attaches it to the GitHub release.
4. Creates a signed APT repository and publishes it to `gh-pages`.

## Required repository settings

### 1) Enable GitHub Pages

In GitHub repository settings:

- Open `Settings -> Pages`
- Set source to `Deploy from a branch`
- Select branch `gh-pages` and folder `/ (root)`

### 2) Add signing secrets

In `Settings -> Secrets and variables -> Actions`, add:

- `APT_GPG_PRIVATE_KEY`: ASCII-armored private GPG key.
- `APT_GPG_PASSPHRASE`: passphrase for that private key (optional if your key has no passphrase).

Generate or export your key locally:

```bash
# Generate a key (if you do not have one yet)
gpg --full-generate-key

# List available secret keys
gpg --list-secret-keys --keyid-format LONG

# Export private key in ASCII armor (for GitHub secret)
gpg --armor --export-secret-keys <KEY_ID>
```

Copy the full armored block into `APT_GPG_PRIVATE_KEY`.

## Release flow

```bash
# Example release
git tag v0.5.0
git push origin v0.5.0
```

After the workflow finishes:

- `.deb` is available in the GitHub release assets.
- APT repository is available at `https://<owner>.github.io/<repo>`.

## End-user install commands

Replace `<owner>` and `<repo>` with your GitHub values if you fork this project.

```bash
curl -fsSL https://<owner>.github.io/<repo>/KEY.gpg | sudo tee /usr/share/keyrings/rustdiff-archive-keyring.gpg >/dev/null
echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/rustdiff-archive-keyring.gpg] https://<owner>.github.io/<repo> stable main" | sudo tee /etc/apt/sources.list.d/rustdiff.list >/dev/null
sudo apt update
sudo apt install rustdiff
```

## Notes

- Repository metadata is generated for `amd64` and `arm64`. The workflow builds each architecture natively (`ubuntu-latest` and `ubuntu-24.04-arm` runners) and `build-apt-repo.sh` merges all downloaded `.deb` files into per-architecture `Packages` indices: `bash scripts/packaging/build-apt-repo.sh <output-dir> <deb> [<deb>...]`.
- This is not a Launchpad PPA; it is a signed APT repository hosted on GitHub Pages.
- If you need Launchpad specifically, you can keep this pipeline for `.deb` artifacts and add a source-package upload pipeline separately.

## What the package contains

The bundler configuration lives in `desktop/src-tauri/tauri.conf.json`
(`bundle.linux.deb`) plus `desktop/src-tauri/tauri.linux.conf.json`, which sets
the product name to `rustdiff` on Linux so the package keeps the name it had
before 0.5.0 (`apt upgrade` replaces the GTK package instead of installing a
second one).

| Path | Source |
| --- | --- |
| `/usr/bin/rustdiff` | the Tauri shell (`mainBinaryName`) |
| `/usr/share/applications/rustdiff.desktop` | `data/com.digitalgex.RustDiff.desktop`, used as `desktopTemplate` |
| `/usr/share/metainfo/com.digitalgex.RustDiff.metainfo.xml` | `data/`, via `bundle.linux.deb.files` |
| `/usr/share/icons/hicolor/scalable/apps/com.digitalgex.RustDiff.svg` | `data/icons/`, via `bundle.linux.deb.files` |
| `/usr/share/icons/hicolor/<size>/apps/rustdiff.png` | `desktop/src-tauri/icons/` (`bundle.icon`) |

`Depends: libwebkit2gtk-4.1-0, libgtk-3-0` is written by the bundler. Tauri
renders the window through WebKitGTK, which sits on GTK3; GTK4, libadwaita and
GtkSourceView are no longer needed.

The desktop entry inside the `.deb` is named after the product name
(`rustdiff.desktop`), not after the app id: the bundler offers no option for
the file name. The Flatpak and the per-user `install.sh` path keep
`com.digitalgex.RustDiff.desktop`, which is what the metainfo's `launchable`
points at.

Build and inspect it locally:

```bash
bash scripts/packaging/build-deb.sh
DEB=target/release/bundle/deb/rustdiff_0.5.0_amd64.deb
ar p "$DEB" control.tar.gz | tar -xzO control
ar p "$DEB" data.tar.gz | tar -tz
```

## Minimum OS version

The `amd64`/`arm64` jobs build on `ubuntu-latest` (24.04/noble) and
`ubuntu-24.04-arm`. Unlike `cargo-deb` (used up to 0.4.x), the Tauri bundler
does not run `dpkg-shlibdeps`, so the declared dependencies carry no minimum
version; the real floor is the **glibc the binary was linked against** (2.39 on
Ubuntu 24.04). In practice that means **Ubuntu 24.04+ or Debian 13 (trixie)+**:
on older releases the package installs but the binary refuses to start with a
`GLIBC_2.3x not found` error.

There is currently no older-runner build variant; users on pre-24.04 Ubuntu or
pre-13 Debian should install the
[Flatpak package](https://flathub.org/apps/com.digitalgex.RustDiff) instead,
which bundles its own `org.gnome.Platform` runtime (WebKitGTK included).

