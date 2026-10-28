#!/usr/bin/env bash
# Construye Filmmaking para todo suelta para detrasdecamara.org/filmmakingparatodo.
#
#   scripts/construir-suelta.sh <carpeta-de-salida>
#   (p. ej. ~/code/DetrasdeCamaras/filmmakingparatodo)
#
# Deja en la carpeta index.html, assets/ y fonts/. El repo DetrasdeCamaras
# (Vercel) la sirve en /filmmakingparatodo, con la reescritura de vercel.json
# para las rutas de dentro (/filmmakingparatodo/recursos/…).
set -euo pipefail
SALIDA="${1:?Dime la carpeta de salida (p. ej. ~/code/DetrasdeCamaras/filmmakingparatodo)}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
PUB="$(mktemp -d)"
trap 'rm -rf "$PUB"' EXIT
mkdir -p "$PUB/fonts"
cp "$RAIZ"/public/fonts/{inter,inter-tight,jetbrains-mono}-latin{,-ext}.woff2 "$PUB/fonts/"
cd "$RAIZ"
SUELTA_PUBLIC="$PUB" SUELTA_SALIDA="$SALIDA" npx vite build --config vite.suelta.config.js
