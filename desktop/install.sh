#!/usr/bin/env bash
# ОБЪЕКТИВ-07 · DASHBOARD — установка на Arch Linux
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PREFIX="${PREFIX:-$HOME/.local/share/objektiv}"
BINDIR="${BINDIR:-$HOME/.local/bin}"
APPDIR="$HOME/.local/share/applications"
SYSTEMD_DIR="$HOME/.config/systemd/user"

say() { printf '\033[1;37m==>\033[0m %s\n' "$*"; }

# ---------------------------------------------------------------- зависимости
if command -v pacman >/dev/null 2>&1; then
  SUDO=""
  [ "$(id -u)" -ne 0 ] && SUDO="sudo"
  say "Ставлю зависимости (gtk3, webkit2gtk, python-gobject, gtk-layer-shell)"
  # gtk-layer-shell опционален: без него дашборд откроется обычным окном
  $SUDO pacman -S --needed --noconfirm gtk3 webkit2gtk python-gobject gtk-layer-shell \
    || say "pacman вернул ошибку — проверь пакеты вручную"
else
  say "pacman не найден: ставь gtk3, webkit2gtk, python-gobject (+ gtk-layer-shell) сам"
fi

# ---------------------------------------------------------------- файлы
say "Копирую в $PREFIX"
mkdir -p "$PREFIX/ui" "$BINDIR" "$APPDIR"
install -Dm644 "$HERE/objektiv.py" "$PREFIX/objektiv.py"
install -Dm644 "$HERE/ui/index.html" "$PREFIX/ui/index.html"
install -Dm644 "$HERE/ui/style.css" "$PREFIX/ui/style.css"
install -Dm644 "$HERE/ui/camera.js" "$PREFIX/ui/camera.js"
install -Dm644 "$HERE/ui/apps.js" "$PREFIX/ui/apps.js"
install -Dm644 "$HERE/objektiv.svg" "$PREFIX/objektiv.svg"

# ---------------------------------------------------------------- команда
say "Создаю команду $BINDIR/objektiv"
cat > "$BINDIR/objektiv" <<EOF
#!/usr/bin/env bash
# ОБЪЕКТИВ-07 · дашборд приложений
exec python3 "$PREFIX/objektiv.py" "\$@"
EOF
chmod +x "$BINDIR/objektiv"

# ---------------------------------------------------------------- .desktop
say "Пункт меню приложений"
sed "s|@PREFIX@|$PREFIX|g" "$HERE/objektiv.desktop" > "$APPDIR/objektiv.desktop"
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPDIR" 2>/dev/null || true

# ---------------------------------------------------------------- конфиг
if [ ! -f "$HOME/.config/objektiv/config.json" ]; then
  say "Пишу конфиг $HOME/.config/objektiv/config.json"
  mkdir -p "$HOME/.config/objektiv"
  cp "$HERE/config.example.json" "$HOME/.config/objektiv/config.json"
fi

# ---------------------------------------------------------------- systemd (опционально)
if [ "${WITH_SYSTEMD:-0}" = "1" ]; then
  say "Systemd user-unit"
  mkdir -p "$SYSTEMD_DIR"
  sed "s|@PREFIX@|$PREFIX|g" "$HERE/objektiv.service" > "$SYSTEMD_DIR/objektiv.service"
  systemctl --user daemon-reload
  systemctl --user enable objektiv.service
fi

say "Готово."
cat <<'EOF'

Запуск:
  objektiv                     # дашборд (GTK + WebKit, слой поверх обоев)
  objektiv --demo              # демо-набор приложений
  objektiv --serve 8791        # тот же вид в браузере + рабочие ярлыки
  objektiv --chromium          # окно Chromium (SVG-рыбий глаз как на сайте)
  objektiv --list              # список найденных приложений

Hyprland (~/.config/hypr/hyprland.conf):
  exec-once = objektiv
  layerrule = noanim, objektiv
  layerrule = blur, objektiv        # если нужен блюр под дашбордом

Sway (~/.config/sway/config):
  exec objektiv

Автостарт через systemd:
  WITH_SYSTEMD=1 ./install.sh
  systemctl --user start objektiv.service
EOF
