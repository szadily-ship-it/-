#!/usr/bin/env bash
# ОБЪЕКТИВ-07 · DASHBOARD — one-liner установка
#   curl -fsSL https://raw.githubusercontent.com/szadily-ship-it/-/arena/01a0d457-repo/desktop/get.sh | bash
set -euo pipefail

REPO="${REPO:-szadily-ship-it/-}"
REF="${REF:-arena/01a0d457-repo}"
BASE="https://github.com/$REPO"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

say() { printf '\033[1;37m==>\033[0m %s\n' "$*"; }

say "Качаю $BASE ($REF)"
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$BASE/archive/$REF.tar.gz" | tar -xz -C "$TMP"
elif command -v wget >/dev/null 2>&1; then
  wget -qO- "$BASE/archive/$REF.tar.gz" | tar -xz -C "$TMP"
else
  say "Нужен curl или wget"
  exit 1
fi

SRC="$(find "$TMP" -maxdepth 3 -type f -name objektiv.py | head -n1 | xargs dirname)"
if [ -z "$SRC" ] || [ ! -f "$SRC/install.sh" ]; then
  say "В архиве не нашёлся desktop/install.sh"
  exit 1
fi

say "Устанавливаю из $SRC"
cd "$SRC"
bash ./install.sh "$@"
