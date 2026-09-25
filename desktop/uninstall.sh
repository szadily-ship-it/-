#!/usr/bin/env bash
# ОБЪЕКТИВ-07 · DASHBOARD — удаление
set -euo pipefail

PREFIX="${PREFIX:-$HOME/.local/share/objektiv}"
BINDIR="${BINDIR:-$HOME/.local/bin}"
APPDIR="$HOME/.local/share/applications"
SYSTEMD_DIR="$HOME/.config/systemd/user"

say() { printf '\033[1;37m==>\033[0m %s\n' "$*"; }

say "Останавливаю сервис (если был)"
systemctl --user disable --now objektiv.service 2>/dev/null || true
rm -f "$SYSTEMD_DIR/objektiv.service"

say "Удаляю файлы"
rm -rf "$PREFIX"
rm -f "$BINDIR/objektiv"
rm -f "$APPDIR/objektiv.desktop"
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPDIR" 2>/dev/null || true

say "Конфиг оставлен: $HOME/.config/objektiv/config.json (удали вручную, если не нужен)"
say "Готово."
