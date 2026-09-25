# ОБЪЕКТИВ-07 · DASHBOARD

Тот же вид, что у сайта ОБЪЕКТИВ-07, но вместо OSINT-источников — **ярлыки твоих
приложений**. Чисто чёрный кадр, рыбий глаз, скан-линии, зерно, OSD как у старой
аналоговой камеры наблюдения. Дашборд живёт слоем поверх обоев (Wayland,
Hyprland / Sway).

```
┌─ CAM-07 · FISHEYE 1.7mm · f/1.4 ──────────────── 2026-09-25 17:30:00 ─┐
│  КАНАЛЫ        │  [ 042 ] прил.  каналов  избранное  узел            │
│  0 ВСЕ         │  ┌ ПОИСК ──────────────────────────────── [СБРОС] ┐ │
│  1 ИЗБРАННОЕ   │  │ firefox, код, терминал…                    │ │
│  2 ИНТЕРНЕТ    │  └───────────────────────────────────────────────┘ │
│  3 РАЗРАБОТКА  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐       │
│  4 ГРАФИКА     │  │ ▣ FF   │ │ ▣ NVIM │ │ ▣ GIMP │ │ ▣ MPV  │  ...  │
│  5 МЕДИА       │  │ FIREFOX│ │ NEOVIM │ │ GIMP   │ │ MPV    │       │
│  …             │  └────────┘ └────────┘ └────────┘ └────────┘       │
└─ REC 00:12:44 ── NTSC 480i ISO-400 F 0012345 ─── OBJ-07 APPS 042 ────┘
```

## Установка (Arch)

```bash
cd desktop
./install.sh                 # поставит пакеты, файлы, команду objektiv, пункт меню
objektiv                     # запуск
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

## Управление

| Клавиша | Действие |
|---|---|
| `/` | фокус в поиск |
| `↑` `↓` `←` `→`, `PgUp` `PgDn`, `Home` `End` | выбор ярлыка |
| `↵` | запустить |
| `S` | в избранное / убрать (канал «ИЗБРАННОЕ») |
| `0`–`9` | канал |
| `F` | рыбий глаз вкл/выкл |
| `R` | пересканировать приложения |
| `H` | экран помощи |
| `ESC` | закрыть помощь / сбросить поиск |
| мышь | клик по ярлыку — запуск, кнопки в карточке — доп. действия (`Actions=`) |

## Конфиг (`~/.config/objektiv/config.json`)

| Ключ | По умолчанию | Значение |
|---|---|---|
| `fisheye` | `true` | включить дисторсию объектива |
| `fisheye_strength` | `78` | сила «рыбьего глаза» (0–200) |
| `lens_mode` | `auto` | `auto` / `filter` (SVG-дисторсия) / `css` (CSS-изгиб, если SVG-фильтр не работает) |
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

Если в WebKit2GTK SVG-фильтр дисторсии не применяется (зависит от сборки),
интерфейс сам добивает эффект цилиндрическим изгином карточек; при необходимости
жёстко: `"lens_mode": "css"`. Максимально близкий к сайту вид даёт
`--chromium` — там `feDisplacementMap` работает так же, как в браузере.

## Устройство

```
desktop/
├── objektiv.py            # ядро: .desktop → иконки → payload, GTK/WebKit, запуск
├── ui/
│   ├── index.html         # разметка дашборда
│   ├── style.css          # чёрный CRT: виньетка, скан-линии, HUD, boot
│   ├── camera.js          # fisheye, зерно, сетка, часы, статика, OSD
│   ├── apps.js            # каналы, поиск, клавиатура, запуск
│   └── payload.js         # генерируется objektiv.py (не править)
├── install.sh / uninstall.sh
├── objektiv.desktop / objektiv.svg / objektiv.service
├── config.example.json
└── README-ARCH.md
```

Приложения берутся из `.desktop`-файлов XDG (`/usr/share/applications`,
`~/.local/share/applications`, flatpak, snap). Пропускаются записи с
`NoDisplay=true`, `Hidden=true`, типом не `Application`, а также ярлыки без
`Exec`. Наружу ничего не отправляется: чтение файлов и локальный запуск.
