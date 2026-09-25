# ОБЪЕКТИВ-07 · DASHBOARD

Тот же вид, что у сайта ОБЪЕКТИВ-07, но вместо OSINT-источников — **ярлыки твоих
приложений**. Чёрный кадр, скан-линии, зерно, виньетка, OSD как у старой
аналоговой камеры наблюдения. Дашборд живёт слоем поверх обоев (Wayland,
Hyprland / Sway).

```
┌─ CAM-07 · DASHBOARD ─────────────────────── 2026-09-25 17:30:00 ─┐
│  КАНАЛЫ        │  [ 042 ] прил.  каналов  избранное  узел            │
│  0 ВСЕ         │  ┌ ПОИСК ──────────────────────────────── [СБРОС] ┐ │
│  1 ИЗБРАННОЕ   │  │ firefox, код, терминал…                    │ │
│  2 ИНТЕРНЕТ    │  └───────────────────────────────────────────────┘ │
│  3 РАЗРАБОТКА  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐       │
│  4 ГРАФИКА     │  │ ▣ FF   │ │ ▣ NVIM │ │ ▣ GIMP │ │ ▣ MPV  │  ...  │
│  5 МЕДИА       │  │ FIREFOX│ │ NEOVIM │ │ GIMP   │ │ MPV    │       │
│  …             │  └────────┘ └────────┘ └────────┘ └────────┘       │
└─ REC 00:12:44 ── CAM-07 DASHBOARD F 0012345 ─── OBJ-07 APPS 042 ────┘
```

## Установка одной командой

```bash
curl -fsSL https://raw.githubusercontent.com/szadily-ship-it/-/arena/01a0d457-repo/desktop/get.sh | bash
```

`get.sh` качает архив ветки, распаковывает во временную папку и запускает
`install.sh`. Дальше — просто `objektiv`.

Или вручную:

```bash
git clone -b arena/01a0d457-repo https://github.com/szadily-ship-it/-.git
cd -/desktop && ./install.sh && objektiv
```

Что делает установщик:

| Шаг | Деталь |
|---|---|
| Пакеты | `gtk3`, `webkit2gtk`, `python-gobject`, `gtk-layer-shell` |
| Файлы | `~/.local/share/objektiv/` (код + `ui/`) |
| Команда | `~/.local/bin/objektiv` |
| Меню | `~/.local/share/applications/objektiv.desktop` |
| Конфиг | `~/.config/objektiv/config.json` (создаётся из `config.example.json`) |
| Сервис | только с `WITH_SYSTEMD=1 ./install.sh` |

Удаление: `./uninstall.sh`.

## Подключение к среде

**Hyprland** (`~/.config/hypr/hyprland.conf`):

```ini
exec-once = objektiv
layerrule = noanim, objektiv
layerrule = blur, objektiv        # если нужен блюр под дашбордом
```

**Sway** (`~/.config/sway/config`):

```
exec objektiv
```

**Systemd user** (если сессия сама не поднимает сервисы):

```bash
WITH_SYSTEMD=1 ./install.sh
systemctl --user enable --now objektiv.service
```

Дашборд — layer-surface: он всегда поверх обоев, не перехватывает фокус
(`keyboard-interactivity: on-demand`), поэтому рабочий стол и бар работают как
обычно. Клик по ярлыку — запуск приложения; дашборд остаётся на месте.

### Горячая клавиша Win + R

`~/.config/hypr/hyprland.conf`:

```ini
bind = SUPER, R, exec, objektiv --toggle
```

Как работает: если дашборд уже запущен — он скрывается или показывается
(сигнал `SIGUSR1`); если не запущен — запускается. Второй экземпляр создать
нельзя: процесс пишет свой PID в `~/.config/objektiv/instance.pid`, а
`--toggle` находит его по этому файлу и шлёт сигнал.

Если дашборд не должен висеть поверх обоев постоянно — убери `exec-once`
из конфига Hyprland и запускай только по клавише.

Другие варианты:

```ini
bind = SUPER, D, exec, objektiv --toggle      # рядом с Win+D
bind = SUPER SHIFT, R, exec, objektiv         # всегда новый экземпляр
bind = , XF86Launch0, exec, objektiv --toggle # спец-кнопка на клавиатуре
```

## Управление

| Клавиша | Действие |
|---|---|
| `/` | фокус в поиск |
| `↑` `↓` `←` `→`, `PgUp` `PgDn`, `Home` `End` | выбор ярлыка |
| `↵` | запустить |
| `S` | в избранное / убрать (канал «ИЗБРАННОЕ») |
| `0`–`9` | канал |
| `R` | пересканировать приложения |
| `H` | экран помощи |
| `ESC` | закрыть помощь / сбросить поиск |
| мышь | клик по ярлыку — запуск, кнопки в карточке — доп. действия (`Actions=`) |

## Конфиг (`~/.config/objektiv/config.json`)

| Ключ | По умолчанию | Значение |
|---|---|---|
| `icon_size` | `56` | размер иконки в сетке |
| `columns` | `"auto"` | `"auto"` или число колонок |
| `show_exec` | `true` | показывать команду запуска |
| `terminal` | `"kitty"` | эмулятор для приложений с `Terminal=true` (kitty, alacritty, foot, wezterm, konsole, xterm, st, …) |
| `opacity` | `1.0` | прозрачность кадра (меньше 1 — виден рабочий стол) |
| `fullscreen` | `true` | на весь экран; иначе — окно GTK |
| `margin` | `0` | отступ от краёв экрана, px |
| `layer` | `"top"` | слой layer-shell: `top` / `bottom` / `background` / `overlay` |
| `keyboard_focus` | `true` | брать клавиатуру по требованию (on-demand) |
| `favorites` | `[]` | список desktop-id избранного |
| `scanlines` / `grain` / `flicker` | `true` | слои аналоговой картинки |
| `hide_on_launch` | `false` | прятать дашборд на мгновение при запуске |
| `fallback_browser` | `true` | если `webkit2gtk` сломан — сам открыть дашборд в Chromium или браузере |
| `categories` | `null` | `null` — все каналы, иначе список (напр. `["ИНТЕРНЕТ","РАЗРАБОТКА"]`) |
| `clock24` | `true` | 24-часовой формат в OSD |

Иконки читаются из темы оформления и встраиваются в интерфейс как data-URI,
поэтому дашборд не зависит от путей и тем после запуска.

## Режимы запуска

```bash
objektiv                 # GTK + WebKit + layer-shell (основной)
objektiv --demo          # демо-набор, если приложений ещё нет
objektiv --serve 8791    # вид в браузере, ярлыки работают (HTTP-мост)
objektiv --chromium      # окно Chromium: SVG-дисторсия точь-в-точь как на сайте
objektiv --list          # что найдено: канал · имя · команда
objektiv --print-config  # эффективный конфиг
objektiv --write-payload # пересобрать payload.js без запуска окна
```

Дисторсия объектива (рыбий глаз) убрана полностью: в разных сборках WebKit она
выглядела криво. Остался чистый аналоговый кадр — виньетка, скан-линии, зерно,
хроматика, мерцание, ровная сетка монитора и OSD.

## Если не запускается

**`Failed to load shared library 'libwebkit2gtk-4.0.so.37' ... libjxl.so.0.11:
cannot open shared object file`** — сломана установка `webkit2gtk` (чаще всего
после частичного обновления):

```bash
sudo pacman -Syu                      # лечит частичное обновление
sudo pacman -S webkit2gtk libjxl      # точечно
ldd /usr/lib/libwebkit2gtk-4.0.so.37 | grep 'not found'   # что ещё не тянется
```

Пока не починилось, дашборд работает и без `webkit2gtk` (сам подставит фалбэк,
если `fallback_browser: true`):

```bash
objektiv --doctor        # покажет, что именно сломано
objektiv --chromium      # окно Chromium — полный вид, ярлыки работают
objektiv --serve 8791    # тот же дашборд в браузере по адресу
```

**Win+R не срабатывает** — проверь `objektiv --toggle` из терминала: должно
написаться «дашборд уже запущен — переключил видимость». Если дашборд не
запущен, `--toggle` сам его запустит. Файл блокировки:
`~/.config/objektiv/instance.pid`.

**Win+R не срабатывает** — проверь из терминала `objektiv --toggle`: должно
написаться «дашборд уже запущен — переключил видимость». Если дашборд не
запущен, `--toggle` сам его запустит. Файл блокировки:
`~/.config/objektiv/instance.pid` (удали, если процесс уже мёртв).

**Не появляется поверх обоев / нет слоя** — не хватает `gtk-layer-shell`:

```bash
sudo pacman -S gtk-layer-shell
objektiv --doctor        # строка LayerShell должна быть ok
```

**Ярлыки не найдены** — проверь `objektiv --list`: приложения берутся из
`.desktop`-файлов XDG; записи с `NoDisplay=true`, `Hidden=true` и без `Exec`
пропускаются намеренно.

**Иконки пустые** — тема оформления без иконок приложений; в `--doctor` смотри
`icon_size` и ставь тему (`papirus-icon-theme`, `adwaita-icon-theme`).

## Устройство

```
desktop/
├── objektiv.py            # ядро: .desktop → иконки → payload, GTK/WebKit, запуск
├── ui/
│   ├── index.html         # разметка дашборда
│   ├── style.css          # чёрный CRT: виньетка, скан-линии, HUD, boot
│   ├── camera.js          # зерно, сетка, часы, статика, OSD
│   ├── apps.js            # каналы, поиск, клавиатура, запуск
│   └── payload.js         # генерируется objektiv.py (не править)
├── get.sh                 # one-liner установка
├── install.sh / uninstall.sh
├── objektiv.desktop / objektiv.svg / objektiv.service
├── config.example.json
└── README-ARCH.md
```

Приложения берутся из `.desktop`-файлов XDG (`/usr/share/applications`,
`~/.local/share/applications`, flatpak, snap). Пропускаются записи с
`NoDisplay=true`, `Hidden=true`, типом не `Application`, а также ярлыки без
`Exec`. Наружу ничего не отправляется: чтение файлов и локальный запуск.
