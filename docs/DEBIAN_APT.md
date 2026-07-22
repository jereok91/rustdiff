# Debian package and APT repository

This project ships Debian packages in two ways:

- Release asset: downloadable `.deb` file on each tagged GitHub release.
- APT repository: signed repository published on GitHub Pages (PPA-style workflow).

The automation lives in:

- `.github/workflows/release-deb-apt.yml`
- `scripts/packaging/build-deb.sh`
- `scripts/packaging/build-apt-repo.sh`

## What the workflow does

When a tag like `v0.1.7` is pushed:

1. Builds a `.deb` package with `cargo-deb`.
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
git tag v0.1.7
git push origin v0.1.7
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

## Minimum OS version

The `amd64`/`arm64` build jobs run `cargo-deb` on whatever Ubuntu version the CI runner
provides (`ubuntu-latest`, currently 24.04/noble; `ubuntu-24.04-arm`). `cargo-deb`'s `$auto`
dependency resolution (via `dpkg-shlibdeps`) bakes in the minimum library versions actually
linked at build time — currently `libadwaita-1-0 (>= 1.5~beta)`, `libgtk-4-1 (>= 4.12.0)`, and
`libglib2.0-0t64` (the 64-bit-time_t package name introduced in 24.04, which doesn't exist as
an installable name on older releases at all).

RustDiff's UI code itself already depends on libadwaita APIs (`adw::ToolbarView`, `adw::ToastOverlay`)
that only exist from libadwaita 1.4+, so this isn't just an artifact of the CI runner choice —
the app genuinely cannot build or run against the libadwaita/GTK4 shipped in Ubuntu 22.04 or
Debian 12 without a newer stack from a PPA or backport. There is currently no older-runner
build variant; end users on pre-24.04 Ubuntu or pre-13/trixie Debian should install the
[Flatpak package](https://flathub.org/apps/com.digitalgex.RustDiff) instead, which bundles its
own `org.gnome.Platform` runtime and is unaffected by the host's GTK version.
