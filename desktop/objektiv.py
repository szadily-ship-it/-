#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ОБЪЕКТИВ-07 · DASHBOARD
Дашборд-лаунчер приложений для Arch (Hyprland / Sway / X11) в эстетике
старой аналоговой камеры: чистый чёрный кадр, рыбний глаз, скан-линии,
зерно, OSD как у камеры наблюдения.

Backend: GTK3 + WebKit2GTK (+ gtk-layer-shell, если установлен).
Только публичные данные: читаются .desktop-файлы приложений, иконки кодируются
в data-URI, наружу ничего не уходит.

Использование:
    ./objektiv.py                 # запустить дашборд
    ./objektiv.py --demo          # демо-набор приложений (без чтения системы)
    ./objektiv.py --dump-json     # вывести JSON найденных приложений
    ./objektiv.py --print-config  # показать эффективный конфиг
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import platform
import re
import shlex
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

APP_ID = "objektiv"
APP_NAME = "ОБЪЕКТИВ-07"
UI_FILES = ("index.html", "style.css", "camera.js", "apps.js")

# --------------------------------------------------------------------------- #
#  XDG paths
# --------------------------------------------------------------------------- #


def _home() -> Path:
    return Path(os.environ.get("HOME") or Path.home())


def config_dir() -> Path:
    return Path(os.environ.get("XDG_CONFIG_HOME") or _home() / ".config") / APP_ID


def config_file() -> Path:
    return config_dir() / "config.json"


def data_dirs() -> list[Path]:
    out = [Path(os.environ.get("XDG_DATA_HOME") or _home() / ".local" / "share")]
    raw = os.environ.get("XDG_DATA_DIRS", "/usr/local/share:/usr/share")
    out += [Path(p) for p in raw.split(":") if p]
    return out


def ui_dir() -> Path:
    """Папка ui: рядом со скриптом, либо установленная в ~/.local/share."""
    local = Path(__file__).resolve().parent / "ui"
    if (local / "index.html").is_file():
        return local
    return data_dirs()[0] / APP_ID / "ui"


# --------------------------------------------------------------------------- #
#  Конфиг
# --------------------------------------------------------------------------- #

DEFAULT_CONFIG: dict = {
    "fisheye": True,
    "fisheye_strength": 78,
    "lens_mode": "auto",          # auto | filter | css  (filter = SVG-дисторсия)
    "columns": "auto",            # auto | число колонок
    "icon_size": 56,
    "show_exec": True,
    "terminal": "kitty",          # эмулятор для Terminal=true приложений
    "opacity": 1.0,               # прозрачность окна (1.0 — полностью чёрный кадр)
    "fullscreen": True,           # занять весь экран слоем
    "margin": 0,                  # отступ от краёв экрана, px
    "layer": "top",               # top | bottom | background | overlay
    "keyboard_focus": True,       # layer-shell keyboard-interactivity
    "favorites": [],              # desktop-id избранных приложений
    "scanlines": True,
    "grain": True,
    "flicker": True,
    "hide_on_launch": False,      # прятать дашборд на время запуска приложения
    "categories": None,           # None — все, либо список каналов
    "clock24": True,
}

BOOL_KEYS = {
    "fisheye", "show_exec", "fullscreen", "keyboard_focus", "scanlines",
    "grain", "flicker", "hide_on_launch", "clock24",
}


def load_config(path: Path | None = None) -> dict:
    cfg = json.loads(json.dumps(DEFAULT_CONFIG))
    f = path or config_file()
    if f.is_file():
        try:
            user = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            print(f"[{APP_ID}] конфиг {f} не читается: {exc}", file=sys.stderr)
            user = {}
        for k, v in (user or {}).items():
            if k not in cfg:
                continue
            if k in BOOL_KEYS:
                cfg[k] = bool(v)
            elif isinstance(cfg[k], float) and isinstance(v, (int, float)):
                cfg[k] = float(v)
            else:
                cfg[k] = v
    # нормализация
    cfg["fisheye_strength"] = max(0, min(200, int(cfg.get("fisheye_strength", 78))))
    cfg["icon_size"] = max(24, min(128, int(cfg.get("icon_size", 56))))
    cfg["margin"] = max(0, int(cfg.get("margin", 0)))
    cfg["opacity"] = min(1.0, max(0.2, float(cfg.get("opacity", 1.0))))
    if cfg["lens_mode"] not in ("auto", "filter", "css"):
        cfg["lens_mode"] = "auto"
    if not isinstance(cfg.get("favorites"), list):
        cfg["favorites"] = []
    return cfg


def save_config(cfg: dict, path: Path | None = None) -> None:
    f = path or config_file()
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")


# --------------------------------------------------------------------------- #
#  Разбор .desktop
# --------------------------------------------------------------------------- #

FIELD_CODE = re.compile(r"%[a-zA-Z]")
ICON_EXTS = ("png", "svg")
MAX_ICON_BYTES = 400_000

CHANNEL_MAP = [
    ("WebBrowser", "ИНТЕРНЕТ"),
    ("Email", "ПОЧТА"),
    ("InstantMessaging", "ЧАТ"),
    ("FileTransfer", "ФАЙЛЫ"),
    ("Network", "СЕТЬ"),
    ("TerminalEmulator", "ТЕРМИНАЛ"),
    ("Development", "РАЗРАБОТКА"),
    ("IDE", "РАЗРАБОТКА"),
    ("Building", "РАЗРАБОТКА"),
    ("Debugger", "РАЗРАБОТКА"),
    ("Graphics", "ГРАФИКА"),
    ("Photography", "ФОТО"),
    ("Publishing", "ВЁРСТКА"),
    ("AudioVideo", "МЕДИА"),
    ("Audio", "ЗВУК"),
    ("Video", "ВИДЕО"),
    ("Player", "МЕДИА"),
    ("Office", "ОФИС"),
    ("WordProcessor", "ОФИС"),
    ("Spreadsheet", "ОФИС"),
    ("Presentation", "ОФИС"),
    ("Game", "ИГРЫ"),
    ("Education", "ОБУЧЕНИЕ"),
    ("Science", "НАУКА"),
    ("Settings", "НАСТРОЙКИ"),
    ("System", "СИСТЕМА"),
    ("FileManager", "ФАЙЛЫ"),
    ("Utility", "УТИЛИТЫ"),
    ("Accessories", "УТИЛИТЫ"),
    ("Security", "БЕЗОПАСНОСТЬ"),
]


def parse_desktop(path: Path) -> dict | None:
    """Читает секцию [Desktop Entry] .desktop-файла."""
    data: dict[str, str] = {}
    section = None
    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("[") and line.endswith("]"):
            section = line[1:-1]
            continue
        if section != "Desktop Entry" or "=" not in line:
            continue
        key, val = line.split("=", 1)
        data[key.strip()] = val.strip()
    return data or None


def localized(data: dict, key: str) -> str:
    for lang in ("ru", "en"):
        val = data.get(f"{key}[{lang}]")
        if val:
            return val
    return data.get(key, "")


def localized_action(data: dict, action_id: str, key: str = "Name") -> str:
    """Имя действия из Actions=... с учётом локали."""
    for lang in ("ru", "en"):
        val = data.get(f"Action[{action_id}]{key}[{lang}]")
        if val:
            return val
    return data.get(f"Action[{action_id}]{key}", "") or action_id


def clean_exec(exec_str: str) -> str:
    """Убирает коды полей (%f, %U, %i ...) из строки Exec."""
    if not exec_str:
        return ""
    s = exec_str.replace("%%", "\x00")
    s = FIELD_CODE.sub("", s)
    s = s.replace("\x00", "%")
    return " ".join(s.split()).strip()


def icon_dirs() -> list[Path]:
    out: list[Path] = []
    for base in data_dirs():
        out.append(base / "icons")
        out.append(base / "pixmaps")
    out.append(_home() / ".icons")
    return out


def find_icon(name: str, size: int) -> Path | None:
    """Ищет иконку темы: точный размер PNG -> scalable SVG -> любой apps/."""
    if not name:
        return None
    p = Path(name)
    if p.is_absolute():
        return p if p.is_file() else None

    exact: list[Path] = []
    scalable: list[Path] = []
    other: list[Path] = []

    for base in icon_dirs():
        for ext in ICON_EXTS:
            direct = base / "pixmaps" / f"{name}.{ext}"
            if direct.is_file():
                exact.append(direct)
        icons_root = base / "icons"
        if not icons_root.is_dir():
            continue
        themes = sorted((d for d in icons_root.iterdir() if d.is_dir()),
                        key=lambda d: (d.name != "hicolor", d.name))
        for theme in themes:
            for sub, bucket in (
                (f"{size}x{size}/apps", exact),
                (f"{size}x{size}/mimetypes", exact),
                ("scalable/apps", scalable),
                ("scalable/mimetypes", scalable),
                ("apps", other),
            ):
                d = theme / sub
                if not d.is_dir():
                    continue
                for ext in ICON_EXTS:
                    f = d / f"{name}.{ext}"
                    if f.is_file():
                        bucket.append(f)

    for bucket in (exact, scalable, other):
        if bucket:
            # внутри корзины PNG предпочтительнее SVG (предсказуемый рендер)
            for f in bucket:
                if f.suffix.lower() == ".png":
                    return f
            return bucket[0]
    return None


def data_uri(path: Path | None) -> str:
    """Кодирует иконку в data-URI, чтобы UI был полностью автономным."""
    if not path:
        return ""
    try:
        raw = path.read_bytes()
    except OSError:
        return ""
    if not raw or len(raw) > MAX_ICON_BYTES:
        return ""
    mime = "image/svg+xml" if path.suffix.lower() == ".svg" else "image/png"
    return f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"


def channel_of(categories: list[str]) -> str:
    cats = set(categories)
    for key, label in CHANNEL_MAP:
        if key in cats:
            return label
    return "ПРОЧЕЕ"


def app_entry(path: Path, cfg: dict) -> dict | None:
    data = parse_desktop(path)
    if not data:
        return None
    if data.get("Type", "Application") != "Application":
        return None
    if data.get("NoDisplay", "").lower() == "true":
        return None
    if data.get("Hidden", "").lower() == "true":
        return None
    name = localized(data, "Name") or path.stem
    exec_str = clean_exec(data.get("Exec", ""))
    if not exec_str:
        return None
    cats = [c for c in re.split(r"[;,]", data.get("Categories", "")) if c]
    icon_file = find_icon(data.get("Icon", ""), cfg["icon_size"])
    actions = []
    for aid in [a for a in re.split(r";", data.get("Actions", "")) if a]:
        aexec = clean_exec(data.get(f"Action[{aid}]Exec", ""))
        if not aexec:
            continue
        aname = localized_action(data, aid)
        actions.append({"id": aid, "name": aname, "exec": aexec})
    return {
        "id": path.name,
        "name": name,
        "comment": localized(data, "Comment") or localized(data, "GenericName"),
        "exec": exec_str,
        "icon": data_uri(icon_file),
        "icon_path": str(icon_file) if icon_file else "",
        "terminal": data.get("Terminal", "").lower() == "true",
        "channel": channel_of(cats),
        "categories": cats,
        "keywords": localized(data, "Keywords"),
        "actions": actions,
        "source": str(path),
    }


def application_dirs() -> list[Path]:
    dirs = [d / "applications" for d in data_dirs()]
    dirs += [
        _home() / ".local" / "share" / "flatpak" / "exports" / "share" / "applications",
        Path("/var/lib/flatpak/exports/share/applications"),
        Path("/var/lib/snapd/desktop/applications"),
    ]
    seen, out = set(), []
    for d in dirs:
        if d.is_dir() and str(d) not in seen:
            seen.add(str(d))
            out.append(d)
    return out


def collect_apps(cfg: dict) -> list[dict]:
    """Собирает приложения из .desktop-файлов (первый найденный id выигрывает)."""
    found: dict[str, dict] = {}
    for d in application_dirs():
        for f in sorted(d.glob("*.desktop")):
            if f.name in found:
                continue
            entry = app_entry(f, cfg)
            if entry:
                found[f.name] = entry
    apps = sorted(found.values(), key=lambda a: a["name"].lower())
    if cfg.get("categories"):
        keep = {c.upper() for c in cfg["categories"]}
        apps = [a for a in apps if a["channel"].upper() in keep]
    return apps


# --------------------------------------------------------------------------- #
#  Демо-набор (для превью и проверки оформления без установки GTK)
# --------------------------------------------------------------------------- #

DEMO_APPS = [
    ("FIREFOX", "Веб-обозреватель", "ИНТЕРНЕТ", "#e66000"),
    ("THUNDERBIRD", "Почта и календарь", "ПОЧТА", "#1d7dcd"),
    ("SIGNAL", "Приватный мессенджер", "ЧАТ", "#3a76f0"),
    ("TRANSMISSION", "Торрент-клиент", "ФАЙЛЫ", "#c22"),
    ("KITTY", "Эмулятор терминала", "ТЕРМИНАЛ", "#d8d8d8"),
    ("NEOVIM", "Текстовый редактор", "РАЗРАБОТКА", "#57a143"),
    ("GIT", "Контроль версий", "РАЗРАБОТКА", "#f05033"),
    ("PYTHON", "Интерпретатор 3.11", "РАЗРАБОТКА", "#3572a5"),
    ("GIMP", "Растровый редактор", "ГРАФИКА", "#6b8e23"),
    ("INKSCAPE", "Векторный редактор", "ГРАФИКА", "#222"),
    ("DARKTABLE", "Обработка RAW", "ФОТО", "#5a5a5a"),
    ("OBS", "Запись и стрим", "ВИДЕО", "#302e31"),
    ("MPV", "Видеоплеер", "МЕДИА", "#6a1b9a"),
    ("PIPEWIRE", "Звуковой сервер", "ЗВУК", "#111"),
    ("LIBREOFFICE", "Офисный пакет", "ОФИС", "#00a500"),
    ("ONLYOFFICE", "Редактор документов", "ОФИС", "#e00"),
    ("SUBLIME", "Редактор кода", "ОФИС", "#ff9800"),
    ("STEAM", "Игровой клиент", "ИГРЫ", "#1b2838"),
    ("MINESWEEP", "Сапёр", "ИГРЫ", "#555"),
    ("CALIBRE", "Библиотека книг", "ОБУЧЕНИЕ", "#8a3ffc"),
    ("WIRESHARK", "Анализ трафика", "СЕТЬ", "#1679a3"),
    ("HTTrack", "Зеркало сайтов", "СЕТЬ", "#444"),
    ("GParted", "Разделы диска", "СИСТЕМА", "#5b8db8"),
    ("BTTOP", "Монитор ресурсов", "СИСТЕМА", "#333"),
    ("KDE SETTINGS", "Параметры системы", "НАСТРОЙКИ", "#1d99f3"),
    ("ARCH WIKI", "Документация", "ОБУЧЕНИЕ", "#1793d1"),
]


def demo_apps(cfg: dict) -> list[dict]:
    out = []
    for name, comment, channel, color in DEMO_APPS:
        letter = name[0]
        svg = (
            "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'>"
            f"<rect width='64' height='64' fill='#050505'/>"
            f"<rect x='1' y='1' width='62' height='62' fill='none' stroke='#3a3a3a'/>"
            f"<text x='32' y='42' font-family='monospace' font-size='30' fill='{color}'"
            " text-anchor='middle'>" + letter + "</text></svg>"
        )
        uri = "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()
        out.append({
            "id": f"{name.lower().replace(' ', '-')}.desktop",
            "name": name,
            "comment": comment,
            "exec": name.lower().split()[0],
            "icon": uri,
            "icon_path": "",
            "terminal": channel == "ТЕРМИНАЛ",
            "channel": channel,
            "categories": [],
            "keywords": "",
            "actions": ([{"id": "new-window", "name": "НОВОЕ ОКНО", "exec": name.lower()}]
                        if channel in ("ИНТЕРНЕТ", "ОФИС") else []),
            "source": "demo",
        })
    return out


# --------------------------------------------------------------------------- #
#  Payload для UI
# --------------------------------------------------------------------------- #


def detect_desktop() -> str:
    for key in ("XDG_CURRENT_DESKTOP", "DESKTOP_SESSION", "XDG_SESSION_TYPE"):
        val = os.environ.get(key)
        if val:
            return val
    return "TTY"


def build_payload(cfg: dict, demo: bool = False) -> dict:
    apps = demo_apps(cfg) if demo else collect_apps(cfg)
    channels: dict[str, int] = {}
    for a in apps:
        channels[a["channel"]] = channels.get(a["channel"], 0) + 1
    chan_list = [{"id": "ALL", "name": "ВСЕ КАНАЛЫ", "count": len(apps)}]
    chan_list += [{"id": c.upper(), "name": c, "count": n}
                  for c, n in sorted(channels.items(), key=lambda kv: kv[0])]
    favs = [a for a in apps if a["id"] in set(cfg.get("favorites") or [])]
    if favs:
        chan_list.insert(1, {"id": "FAV", "name": "ИЗБРАННОЕ", "count": len(favs)})
    return {
        "app": APP_NAME,
        "subtitle": "APP DASHBOARD",
        "version": "07.1",
        "host": socket.gethostname(),
        "desktop": detect_desktop(),
        "kernel": platform.release(),
        "config": cfg,
        "channels": chan_list,
        "apps": apps,
        "favorites": list(cfg.get("favorites") or []),
        "generated": time.strftime("%Y-%m-%d %H:%M:%S"),
        "count": len(apps),
    }


def payload_js(payload: dict) -> str:
    return "window.OBJEKTIV_PAYLOAD = " + json.dumps(payload, ensure_ascii=False) + ";\n"


def write_payload(payload: dict, directory: Path | None = None) -> Path:
    d = directory or ui_dir()
    f = d / "payload.js"
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(payload_js(payload), encoding="utf-8")
    return f


# --------------------------------------------------------------------------- #
#  Запуск приложений
# --------------------------------------------------------------------------- #

TERMINALS: dict[str, list[str]] = {
    "kitty": ["kitty"],
    "alacritty": ["alacritty", "-e"],
    "wezterm": ["wezterm", "start", "--"],
    "foot": ["foot"],
    "gnome-terminal": ["gnome-terminal", "--"],
    "konsole": ["konsole", "-e"],
    "xterm": ["xterm", "-e"],
    "st": ["st", "-e"],
    "tilix": ["tilix", "-e"],
    "urxvt": ["urxvt", "-e"],
    "terminator": ["terminator", "-x"],
}


def _argv(exec_str: str) -> list[str]:
    try:
        return shlex.split(exec_str)
    except ValueError:
        return exec_str.split()


def launch_app(app: dict, cfg: dict) -> tuple[bool, str]:
    argv = _argv(app.get("exec", ""))
    if not argv:
        return False, "пустая команда"
    if app.get("terminal"):
        term = cfg.get("terminal", "kitty")
        tpl = TERMINALS.get(term)
        if tpl is None:
            found = shutil.which(term)
            tpl = [term, "-e"] if found else None
        if tpl is None:
            # авто-выбор любого доступного эмулятора
            for name, t in TERMINALS.items():
                if shutil.which(t[0]):
                    tpl = t
                    break
        if tpl is None:
            return False, "не найден эмулятор терминала"
        argv = tpl + argv
    if not shutil.which(argv[0]):
        return False, f"не найдено: {argv[0]}"
    try:
        subprocess.Popen(
            argv,
            start_new_session=True,
            cwd=str(_home()),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
        )
    except OSError as exc:
        return False, str(exc)
    return True, " ".join(argv)


# --------------------------------------------------------------------------- #
#  GUI: GTK3 + WebKit2GTK (+ gtk-layer-shell)
# --------------------------------------------------------------------------- #

LAYER_MAP_NAMES = ("top", "bottom", "background", "overlay")


def run_gui(cfg: dict, payload: dict, ui_uri: str) -> int:
    try:
        import gi
    except ImportError:
        print(f"[{APP_ID}] не установлен PyGObject.\n"
              "  Arch: sudo pacman -S python-gobject gtk3 webkit2gtk", file=sys.stderr)
        return 2

    gi.require_version("Gtk", "3.0")
    try:
        gi.require_version("WebKit2", "4.0")
    except ValueError:
        print(f"[{APP_ID}] нужен webkit2gtk (WebKit2 4.0)", file=sys.stderr)
        return 2
    try:
        gi.require_version("GtkLayerShell", "0.1")
        from gi.repository import GtkLayerShell  # type: ignore
        have_layer_shell = True
    except (ValueError, ImportError):
        have_layer_shell = False

    from gi.repository import Gdk, GLib, Gtk, WebKit2

    win = Gtk.Window(title=APP_NAME)
    win.set_decorated(False)
    win.set_app_paintable(True)
    win.set_skip_taskbar_hint(True)
    win.set_skip_pager_hint(True)
    try:
        screen = win.get_screen()
        visual = screen.get_rgba_visual()
        if visual is not None:
            win.set_visual(visual)
    except Exception:
        pass
    win.set_opacity(cfg["opacity"])

    manager = WebKit2.UserContentManager()
    webview = WebKit2.WebView.new_with_user_content_manager(manager)
    settings = webview.get_settings()
    try:
        settings.set_properties({
            "allow-file-access-from-file-urls": True,
            "allow-universal-access-from-file-urls": True,
            "enable-developer-extras": False,
            "javascript-can-open-windows-automatically": True,
            "enable-page-cache": False,
            "hardware-acceleration-policy": WebKit2.HardwareAccelerationPolicy.ALWAYS,
        })
    except Exception:
        pass
    try:
        webview.set_background_color(Gdk.RGBA(0, 0, 0, 1))
    except Exception:
        pass

    win.add(webview)

    # ---- слой ---- #
    if have_layer_shell:
        try:
            GtkLayerShell.init_for_window(win)
            layers = {
                "top": GtkLayerShell.Layer.TOP,
                "bottom": GtkLayerShell.Layer.BOTTOM,
                "background": GtkLayerShell.Layer.BACKGROUND,
                "overlay": GtkLayerShell.Layer.OVERLAY,
            }
            GtkLayerShell.set_layer(win, layers.get(cfg.get("layer", "top"), GtkLayerShell.Layer.TOP))
            for edge in (GtkLayerShell.Edge.TOP, GtkLayerShell.Edge.BOTTOM,
                         GtkLayerShell.Edge.LEFT, GtkLayerShell.Edge.RIGHT):
                GtkLayerShell.set_anchor(win, edge, True)
                GtkLayerShell.set_margin(win, edge, cfg.get("margin", 0))
            GtkLayerShell.set_exclusive_zone(win, 0)
            if cfg.get("keyboard_focus", True):
                GtkLayerShell.set_keyboard_mode(win, GtkLayerShell.KeyboardMode.ON_DEMAND)
        except Exception as exc:  # pragma: no cover
            print(f"[{APP_ID}] layer-shell недоступен: {exc}", file=sys.stderr)
            have_layer_shell = False

    if not have_layer_shell:
        win.set_keep_above(True)
        if cfg.get("fullscreen", True):
            win.fullscreen()

    # ---- мост JS <-> Python ---- #
    def js_call(script: str) -> None:
        try:
            webview.run_javascript(script, None, None, None)
        except Exception:
            pass

    def to_py(value) -> object:
        for attr in ("to_string", "get_string"):
            fn = getattr(value, attr, None)
            if callable(fn):
                try:
                    return json.loads(fn())
                except Exception:
                    try:
                        return fn()
                    except Exception:
                        pass
        try:
            return json.loads(str(value))
        except Exception:
            return None

    def on_message(_mgr, value) -> None:
        msg = to_py(value)
        if not isinstance(msg, dict):
            return
        cmd = msg.get("cmd")
        if cmd == "launch":
            app = msg.get("app") or {}
            ok, info = launch_app(app, cfg)
            if ok and cfg.get("hide_on_launch"):
                win.hide()
                GLib.timeout_add(900, lambda: (win.show(), False)[1])
            js_call(f"window.OBJEKTIV.reply({json.dumps({'cmd': 'launch', 'ok': ok, 'info': info, 'id': app.get('id')}, ensure_ascii=False)});")
        elif cmd == "rescan":
            new = build_payload(cfg)
            write_payload(new)
            js_call(f"window.OBJEKTIV.apply({json.dumps(new, ensure_ascii=False)});")
        elif cmd == "config":
            patch = msg.get("patch") or {}
            for k, v in patch.items():
                if k in DEFAULT_CONFIG:
                    cfg[k] = bool(v) if k in BOOL_KEYS else v
            cfg = load_config.__wrapped__(cfg) if False else cfg
            try:
                config_file().parent.mkdir(parents=True, exist_ok=True)
                config_file().write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
            except OSError:
                pass
            js_call(f"window.OBJEKTIV.reply({json.dumps({'cmd': 'config', 'config': cfg}, ensure_ascii=False)});")
        elif cmd == "favorite":
            favs = list(cfg.get("favorites") or [])
            fid = msg.get("id")
            if fid in favs:
                favs.remove(fid)
            elif fid:
                favs.append(fid)
            cfg["favorites"] = favs
            try:
                config_file().parent.mkdir(parents=True, exist_ok=True)
                config_file().write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
            except OSError:
                pass
            new = build_payload(cfg)
            write_payload(new)
            js_call(f"window.OBJEKTIV.apply({json.dumps(new, ensure_ascii=False)});")
        elif cmd == "ping":
            js_call("window.OBJEKTIV.reply({'cmd':'ping','ok':true});")
        elif cmd == "quit":
            Gtk.main_quit()

    try:
        manager.connect("script-message-received::objektiv", on_message)
        manager.register_script_message_handler("objektiv")
    except Exception as exc:  # pragma: no cover
        print(f"[{APP_ID}] мост JS недоступен: {exc}", file=sys.stderr)

    def on_load_changed(_w, event) -> None:
        if event == WebKit2.LoadEvent.FINISHED:
            js_call(f"window.OBJEKTIV.handshake({json.dumps(payload, ensure_ascii=False)});")

    webview.connect("load-changed", on_load_changed)
    webview.load_uri(ui_uri)

    win.show_all()
    win.connect("destroy", Gtk.main_quit)
    try:
        Gtk.main()
    except KeyboardInterrupt:
        pass
    return 0


# --------------------------------------------------------------------------- #
#  HTTP-мост (режимы --serve / --chromium): работает в любом браузере
# --------------------------------------------------------------------------- #


def run_http(cfg: dict, host: str = "127.0.0.1", port: int = 8791,
             demo: bool = False) -> int:
    """Отдаёт интерфейс и принимает команды запуска приложений."""
    import http.server
    import socketserver

    ui = ui_dir()
    payload = build_payload(cfg, demo=demo)

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(ui), **kw)

        def _json(self, obj, code=200):
            body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()

        def _handle(self, msg):
            cmd = msg.get("cmd")
            if cmd == "launch":
                ok, info = launch_app(msg.get("app") or {}, cfg)
                return {"cmd": "launch", "ok": ok, "info": info}
            if cmd in ("rescan", "favorite"):
                if cmd == "favorite":
                    favs = list(cfg.get("favorites") or [])
                    fid = msg.get("id")
                    if fid in favs:
                        favs.remove(fid)
                    elif fid:
                        favs.append(fid)
                    cfg["favorites"] = favs
                nonlocal payload
                payload = build_payload(cfg, demo=demo)
                write_payload(payload)
                return {"cmd": cmd, "ok": True, "payload": payload}
            if cmd == "config":
                for k, v in (msg.get("patch") or {}).items():
                    if k in DEFAULT_CONFIG:
                        cfg[k] = bool(v) if k in BOOL_KEYS else v
                return {"cmd": "config", "ok": True, "config": cfg}
            return {"cmd": "ping", "ok": True, "payload": payload}

        def do_POST(self):
            if self.path.split("?")[0] != "/api":
                self._json({"ok": False, "error": "unknown endpoint"}, 404)
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                msg = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            except (ValueError, OSError):
                self._json({"ok": False, "error": "bad request"}, 400)
                return
            self._json(self._handle(msg))

        def do_GET(self):
            if self.path.split("?")[0] == "/api":
                self._json({"cmd": "ping", "ok": True, "payload": payload})
                return
            super().do_GET()

        def log_message(self, fmt, *args):  # тихий лог
            pass

    class Server(socketserver.ThreadingTCPServer):
        allow_reuse_address = True
        daemon_threads = True

    write_payload(payload)
    with Server((host, port), Handler) as httpd:
        print(f"[{APP_ID}] {APP_NAME} · http://{host}:{port}/  (Ctrl+C - стоп)", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print()
    return 0


def run_chromium(cfg: dict, port: int, demo: bool) -> int:
    """HTTP-мост + окно Chromium: SVG-дисторзия работает как на сайте."""
    import threading

    candidates = ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable",
                  "microsoft-edge", "brave-browser", "vivaldi"]
    binary = next((b for b in candidates if shutil.which(b)), None)
    if binary is None:
        print(f"[{APP_ID}] браузер не найден ({', '.join(candidates)})", file=sys.stderr)
        return 2

    threading.Thread(target=run_http, args=(cfg, "127.0.0.1", port, demo), daemon=True).start()
    time.sleep(0.7)
    url = f"http://127.0.0.1:{port}/index.html"
    profile = config_dir() / "chromium-profile"
    cmd = [
        binary,
        f"--app={url}",
        f"--user-data-dir={profile}",
        "--class=objektiv-07",
        "--ozone-platform-hint=auto",
        "--enable-transparent-visuals",
        "--no-default-browser-check",
        "--no-first-run",
        "--disable-features=Translate,MediaRouter,ChromeWhatsNewUI",
        "--disable-session-crashed-bubble",
        "--hide-crash-restore-bubble",
    ]
    if os.environ.get("WAYLAND_DISPLAY"):
        cmd += ["--ozone-platform=wayland"]
    else:
        cmd += ["--ozone-platform=x11"]
    print(f"[{APP_ID}] {' '.join(cmd)}", flush=True)
    try:
        proc = subprocess.Popen(cmd)
    except OSError as exc:
        print(f"[{APP_ID}] не запущен: {exc}", file=sys.stderr)
        return 2
    try:
        proc.wait()
    except KeyboardInterrupt:
        proc.terminate()
    return 0


# --------------------------------------------------------------------------- #
#  CLI
# --------------------------------------------------------------------------- #


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog=APP_ID, description=f"{APP_NAME} — дашборд приложений")
    ap.add_argument("--config", type=Path, default=None, help="путь к config.json")
    ap.add_argument("--demo", action="store_true", help="демо-набор приложений")
    ap.add_argument("--dump-json", action="store_true", help="вывести JSON приложений")
    ap.add_argument("--no-icons", action="store_true", help="без иконок (для --dump-json)")
    ap.add_argument("--print-config", action="store_true", help="показать конфиг")
    ap.add_argument("--list", action="store_true", help="список: канал · имя · exec")
    ap.add_argument("--write-payload", action="store_true", help="перезаписать payload.js")
    ap.add_argument("--uri", action="store_true", help="напечатать file:// URI интерфейса")
    ap.add_argument("--serve", nargs="?", type=int, const=8791, default=None, metavar="PORT",
                    help="HTTP-мост: отдать дашборд в браузере (по умолчанию порт 8791)")
    ap.add_argument("--chromium", nargs="?", type=int, const=8791, default=None, metavar="PORT",
                    help="окно Chromium с дашбордом (SVG-дисторсия как на сайте)")
    args = ap.parse_args(argv)

    cfg = load_config(args.config)
    payload = build_payload(cfg, demo=args.demo)
    if args.no_icons:
        for a in payload["apps"]:
            a["icon"] = ""

    if args.print_config:
        print(json.dumps(cfg, ensure_ascii=False, indent=2))
        return 0
    if args.dump_json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0
    if args.list:
        for a in payload["apps"]:
            term = " [T]" if a["terminal"] else ""
            print(f"{a['channel']:<14} {a['name']:<26} {a['exec']}{term}")
        print(f"— всего: {payload['count']}")
        return 0
    if args.uri:
        print((ui_dir() / "index.html").as_uri())
        return 0
    if args.serve is not None:
        return run_http(cfg, port=args.serve, demo=args.demo)
    if args.chromium is not None:
        return run_chromium(cfg, args.chromium, args.demo)
    if args.write_payload:
        f = write_payload(payload)
        print(f"[{APP_ID}] payload → {f} ({payload['count']} приложений)")
        return 0

    write_payload(payload)
    return run_gui(cfg, payload, (ui_dir() / "index.html").as_uri())


if __name__ == "__main__":
    sys.exit(main())

