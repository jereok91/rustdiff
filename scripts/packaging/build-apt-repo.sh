#!/usr/bin/env bash
set -euo pipefail

# Genera un repositorio APT firmado a partir de uno o mas .deb (una entrada
# por arquitectura: amd64, arm64, ...). Cada arquitectura obtiene su propio
# indice binary-<arch>/Packages y el Release las declara todas.

if [ "$#" -lt 2 ]; then
    echo "Usage: $0 <output-dir> <path-to-deb> [<path-to-deb>...]"
    exit 1
fi

OUTPUT_DIR="$1"
shift
DEB_PATHS=("$@")

for deb in "${DEB_PATHS[@]}"; do
    if [ ! -f "$deb" ]; then
        echo "[ERROR] .deb file not found: $deb"
        exit 1
    fi
done

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

rm -rf "$OUTPUT_DIR"

# ── Pool: copiar todos los .deb y recolectar las arquitecturas ──────────
ARCHES=""
for deb in "${DEB_PATHS[@]}"; do
    PACKAGE_NAME="$(dpkg-deb -f "$deb" Package)"
    ARCH="$(dpkg-deb -f "$deb" Architecture)"

    if [ -z "$PACKAGE_NAME" ] || [ -z "$ARCH" ]; then
        echo "[ERROR] Could not detect package metadata from: $deb"
        exit 1
    fi

    PACKAGE_INITIAL="${PACKAGE_NAME:0:1}"
    POOL_DIR="$OUTPUT_DIR/pool/$APT_COMPONENT/$PACKAGE_INITIAL/$PACKAGE_NAME"
    mkdir -p "$POOL_DIR"
    cp "$deb" "$POOL_DIR/"

    case " $ARCHES " in
        *" $ARCH "*) ;;
        *) ARCHES="$ARCHES $ARCH" ;;
    esac
done
ARCHES="${ARCHES# }"

# ── Indices Packages por arquitectura ───────────────────────────────────
(
    cd "$OUTPUT_DIR"

    for arch in $ARCHES; do
        BINARY_DIR="dists/$APT_SUITE/$APT_COMPONENT/binary-$arch"
        mkdir -p "$BINARY_DIR"
        dpkg-scanpackages --multiversion --arch "$arch" pool > "$BINARY_DIR/Packages"
        gzip -9c "$BINARY_DIR/Packages" > "$BINARY_DIR/Packages.gz"
    done

    apt-ftparchive \
        -o "APT::FTPArchive::Release::Origin=$APT_ORIGIN" \
        -o "APT::FTPArchive::Release::Label=$APT_LABEL" \
        -o "APT::FTPArchive::Release::Suite=$APT_SUITE" \
        -o "APT::FTPArchive::Release::Codename=$APT_CODENAME" \
        -o "APT::FTPArchive::Release::Architectures=$ARCHES" \
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
echo "[OK] Architectures: $ARCHES"
