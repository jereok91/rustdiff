# RustDiff 1.0.1

Tag: `v1.0.1`. Date: 2026-10-16.

A packaging fix with no code changes.

## Fixed

- **The Flatpak build failed in the AppStream metadata step** with an icon
  error, so 1.0.0 never reached Flathub. The application icon is now installed
  as a PNG set (48, 64, 128, 256 and 512, plus the 2x variants) next to the
  scalable SVG. The builder runtime resolves icons through a pipeline that
  cannot read the SVG, and only the raster files satisfy it.

Everything else is identical to 1.0.0, including the application itself.
