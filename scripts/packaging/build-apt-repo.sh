#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <path-to-deb> <output-dir>"
    exit 1
fi

DEB_PATH="$1"
OUTPUT_DIR="$2"

if [ ! -f "$DEB_PATH" ]; then
    echo "[ERROR] .deb file not found: $DEB_PATH"
    exit 1
fi

: "${APT_GPG_KEY_FPR:?APT_GPG_KEY_FPR is required}"
APT_GPG_PASSPHRASE="${APT_GPG_PASSPHRASE:-}"

APT_ORIGIN="${APT_ORIGIN:-rustdiff}"
APT_LABEL="${APT_LABEL:-rustdiff}"
APT_SUITE="${APT_SUITE:-stable}"
APT_CODENAME="${APT_CODENAME:-$APT_SUITE}"
APT_COMPONENT="${APT_COMPONENT:-main}"

for cmd in dpkg-deb dpkg-scanpackages apt-ftparchive gpg gzip; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "[ERROR] Missing command: $cmd"
        exit 1
    fi
done

PACKAGE_NAME="$(dpkg-deb -f "$DEB_PATH" Package)"
ARCH="$(dpkg-deb -f "$DEB_PATH" Architecture)"

if [ -z "$PACKAGE_NAME" ] || [ -z "$ARCH" ]; then
    echo "[ERROR] Could not detect package metadata from: $DEB_PATH"
    exit 1
fi

PACKAGE_INITIAL="${PACKAGE_NAME:0:1}"
POOL_DIR="$OUTPUT_DIR/pool/$APT_COMPONENT/$PACKAGE_INITIAL/$PACKAGE_NAME"
BINARY_DIR="$OUTPUT_DIR/dists/$APT_SUITE/$APT_COMPONENT/binary-$ARCH"

rm -rf "$OUTPUT_DIR"
mkdir -p "$POOL_DIR" "$BINARY_DIR"
cp "$DEB_PATH" "$POOL_DIR/"

(
    cd "$OUTPUT_DIR"

    dpkg-scanpackages --multiversion pool > "dists/$APT_SUITE/$APT_COMPONENT/binary-$ARCH/Packages"
    gzip -9c "dists/$APT_SUITE/$APT_COMPONENT/binary-$ARCH/Packages" > "dists/$APT_SUITE/$APT_COMPONENT/binary-$ARCH/Packages.gz"

    apt-ftparchive \
        -o "APT::FTPArchive::Release::Origin=$APT_ORIGIN" \
        -o "APT::FTPArchive::Release::Label=$APT_LABEL" \
        -o "APT::FTPArchive::Release::Suite=$APT_SUITE" \
        -o "APT::FTPArchive::Release::Codename=$APT_CODENAME" \
        -o "APT::FTPArchive::Release::Architectures=$ARCH" \
        -o "APT::FTPArchive::Release::Components=$APT_COMPONENT" \
        release "dists/$APT_SUITE" > "dists/$APT_SUITE/Release"
)

gpg_sign_args=(--batch --yes --pinentry-mode loopback --local-user "$APT_GPG_KEY_FPR")
if [ -n "$APT_GPG_PASSPHRASE" ]; then
    gpg_sign_args+=(--passphrase "$APT_GPG_PASSPHRASE")
fi

gpg "${gpg_sign_args[@]}" \
    --output "$OUTPUT_DIR/dists/$APT_SUITE/InRelease" \
    --clearsign "$OUTPUT_DIR/dists/$APT_SUITE/Release"

gpg "${gpg_sign_args[@]}" \
    --output "$OUTPUT_DIR/dists/$APT_SUITE/Release.gpg" \
    --detach-sign "$OUTPUT_DIR/dists/$APT_SUITE/Release"

gpg --batch --yes --export "$APT_GPG_KEY_FPR" > "$OUTPUT_DIR/KEY.gpg"
gpg --batch --yes --armor --export "$APT_GPG_KEY_FPR" > "$OUTPUT_DIR/KEY.asc"
touch "$OUTPUT_DIR/.nojekyll"

echo "[OK] APT repository generated in: $OUTPUT_DIR"
echo "[OK] Distribution: $APT_SUITE"
echo "[OK] Component: $APT_COMPONENT"
echo "[OK] Architecture: $ARCH"
