# RustDiff 1.0.2

Tag: `v1.0.2`. Date: 2026-10-16.

A packaging fix with no code changes, and the second attempt at getting 1.0.0
onto Flathub.

## Fixed

- **The Flatpak export step rejected the scalable SVG icon** with "is not a
  valid icon: Failed to load image". 1.0.1 added the PNG set, which the builder
  accepts, but it still installed the SVG alongside it and the export validates
  every installed icon, so the build failed one step later.

  The manifest now installs only the PNG set (48, 64, 128, 256 and 512, plus
  the 2x variants). The SVG stays in the repository as the source the PNGs are
  rendered from, and the desktop entry keeps resolving its icon by name.

Everything else is identical to 1.0.0.
