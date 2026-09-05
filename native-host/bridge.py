#!/usr/bin/env python3
"""Native Messaging host for ChatGPT Local Bridge.

Read-only by default. Commands are executed without a shell and under the
current desktop user. JSON is framed according to Chromium Native Messaging.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import struct
import subprocess
import sys
from pathlib import Path
from typing import Any

MAX_MESSAGE = 1024 * 1024
MAX_OUTPUT = 200_000
TIMEOUT_SECONDS = 20
UPDATE_TIMEOUT_SECONDS = 90
EXPECTED_REPOSITORY = "https://github.com/zoamartinez/chatgpt-local-bridge.git"

SIMPLE_COMMANDS = {
    "ps", "free", "df", "uptime", "uname", "lspci", "lsusb", "lsblk",
    "ss", "sensors",
}

SYSTEMCTL_ACTIONS = {"status", "show", "list-units", "list-unit-files", "is-active", "is-enabled"}
JOURNALCTL_FLAGS = {
    "-b", "--boot", "-e", "--pager-end", "-n", "--lines", "-p", "--priority",
    "-u", "--unit", "--user", "--system", "--no-pager", "--since", "--until",
    "-k", "--dmesg", "-o", "--output", "--disk-usage", "--list-boots",
}
IP_ACTIONS = {
    "address": {"show"}, "addr": {"show"}, "link": {"show"},
    "route": {"show", "list", "get"}, "rule": {"show", "list"},
    "neighbour": {"show"}, "neighbor": {"show"}, "netns": {"list"},
}
LOGINCTL_ACTIONS = {
    "list-sessions", "session-status", "show-session", "list-users",
    "user-status", "show-user", "list-seats", "seat-status", "show-seat",
}
TIMEDATECTL_ACTIONS = {"status", "show", "show-timesync", "timesync-status", "list-timezones"}
UPOWER_FLAGS = {"-e", "--enumerate", "-d", "--dump", "-i", "--show-info"}
SAFE_TOKEN = re.compile(r"^[\w@%+=:,./-]{1,300}$", re.UNICODE)


def read_message() -> dict[str, Any] | None:
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        return None
    if len(raw_length) != 4:
        raise ValueError("Cabecera incompleta")
    length = struct.unpack("<I", raw_length)[0]
    if length > MAX_MESSAGE:
        raise ValueError("Mensaje demasiado grande")
    payload = sys.stdin.buffer.read(length)
    if len(payload) != length:
        raise ValueError("Mensaje incompleto")
    value = json.loads(payload)
    if not isinstance(value, dict):
        raise ValueError("Se esperaba un objeto JSON")
    return value


def write_message(value: dict[str, Any]) -> None:
    payload = json.dumps(value, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(payload)))
    sys.stdout.buffer.write(payload)
    sys.stdout.buffer.flush()


def validate_args(args: Any) -> list[str]:
    if not isinstance(args, list) or not 1 <= len(args) <= 40:
        raise ValueError("args debe contener entre 1 y 40 elementos")
    clean: list[str] = []
    for arg in args:
        if not isinstance(arg, str) or not SAFE_TOKEN.fullmatch(arg):
            raise ValueError(f"Argumento no permitido: {arg!r}")
        clean.append(arg)
    return clean


def validate_command(args: list[str]) -> None:
    if Path(args[0]).name != args[0]:
        raise ValueError("El ejecutable debe indicarse por nombre, no mediante una ruta")
    executable = args[0]
    if executable in SIMPLE_COMMANDS:
        return
    if executable == "systemctl":
        meaningful = [a for a in args[1:] if not a.startswith("-")]
        if meaningful and meaningful[0] in SYSTEMCTL_ACTIONS:
            return
        raise ValueError("Acción systemctl no permitida")
    if executable == "journalctl":
        for arg in args[1:]:
            if arg.startswith("-") and arg.split("=", 1)[0] not in JOURNALCTL_FLAGS:
                raise ValueError(f"Opción journalctl no permitida: {arg}")
        return
    if executable == "ip":
        meaningful = [a for a in args[1:] if not a.startswith("-")]
        if not meaningful:
            raise ValueError("La consulta ip necesita un objeto")
        obj = meaningful[0]
        action = meaningful[1] if len(meaningful) > 1 else "show"
        if obj in IP_ACTIONS and action in IP_ACTIONS[obj]:
            return
        raise ValueError("Solo se permiten consultas con ip")
    if executable == "loginctl":
        meaningful = [a for a in args[1:] if not a.startswith("-")]
        if not meaningful or meaningful[0] in LOGINCTL_ACTIONS:
            return
        raise ValueError("Acción loginctl no permitida")
    if executable == "hostnamectl":
        meaningful = [a for a in args[1:] if not a.startswith("-")]
        if not meaningful or meaningful[0] in {"status"}:
            return
        raise ValueError("Acción hostnamectl no permitida")
    if executable == "timedatectl":
        meaningful = [a for a in args[1:] if not a.startswith("-")]
        if not meaningful or meaningful[0] in TIMEDATECTL_ACTIONS:
            return
        raise ValueError("Acción timedatectl no permitida")
    if executable == "upower":
        flags = {a.split("=", 1)[0] for a in args[1:] if a.startswith("-")}
        if flags.issubset(UPOWER_FLAGS):
            return
        raise ValueError("Opción upower no permitida")
    raise ValueError(f"Ejecutable no permitido: {executable}")


def run_git(source_dir: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["/usr/bin/git", "-C", str(source_dir), *args],
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        timeout=UPDATE_TIMEOUT_SECONDS,
        check=False,
        env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
    )


def update_bridge() -> dict[str, Any]:
    config_path = Path(__file__).resolve().parent.parent / "config.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    source_dir = Path(config["source_dir"]).expanduser().resolve()
    if not source_dir.is_dir() or not (source_dir / ".git").is_dir():
        raise ValueError("La fuente instalada no es un clon Git válido")

    origin = run_git(source_dir, "remote", "get-url", "origin")
    if origin.returncode != 0 or origin.stdout.strip() != EXPECTED_REPOSITORY:
        raise ValueError("El repositorio de origen no coincide con el autorizado")
    status = run_git(source_dir, "status", "--porcelain")
    if status.returncode != 0 or status.stdout.strip():
        raise ValueError("Hay cambios locales; actualización cancelada para no sobrescribirlos")

    before = run_git(source_dir, "rev-parse", "HEAD")
    pulled = run_git(source_dir, "pull", "--ff-only", "origin", "main")
    if pulled.returncode != 0:
        return {"ok": False, "exit_code": pulled.returncode, "stdout": pulled.stdout,
                "stderr": pulled.stderr, "truncated": False}

    updated_host = source_dir / "native-host" / "bridge.py"
    if not updated_host.is_file():
        raise ValueError("La actualización no contiene el agente local")
    installed_host = Path(__file__).resolve()
    temporary = installed_host.with_suffix(".py.new")
    shutil.copy2(updated_host, temporary)
    os.chmod(temporary, 0o755)
    os.replace(temporary, installed_host)
    after = run_git(source_dir, "rev-parse", "HEAD")
    changed = before.stdout.strip() != after.stdout.strip()
    return {
        "ok": True,
        "exit_code": 0,
        "stdout": pulled.stdout,
        "stderr": pulled.stderr,
        "truncated": False,
        "updated": changed,
        "commit": after.stdout.strip(),
        "reload_extension": changed,
    }


def execute(request: dict[str, Any]) -> dict[str, Any]:
    if request.get("version") != 1:
        raise ValueError("Versión no permitida")
    if request.get("tool") == "update_bridge":
        return update_bridge()
    if request.get("tool") != "run_command":
        raise ValueError("Herramienta no permitida")
    args = validate_args(request.get("args"))
    validate_command(args)
    executable = Path("/usr/bin") / args[0]
    if not executable.is_file():
        raise ValueError(f"El comando no está instalado: {args[0]}")
    args[0] = str(executable)
    completed = subprocess.run(
        args,
        cwd=os.environ.get("HOME", "/tmp"),
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        timeout=TIMEOUT_SECONDS,
        check=False,
        env={**os.environ, "PAGER": "cat", "SYSTEMD_PAGER": "cat"},
    )
    stdout = completed.stdout[:MAX_OUTPUT]
    stderr = completed.stderr[:MAX_OUTPUT]
    truncated = len(completed.stdout) > MAX_OUTPUT or len(completed.stderr) > MAX_OUTPUT
    return {
        "ok": completed.returncode == 0,
        "exit_code": completed.returncode,
        "stdout": stdout,
        "stderr": stderr,
        "truncated": truncated,
    }


def main() -> int:
    while True:
        try:
            request = read_message()
            if request is None:
                return 0
            try:
                response = execute(request)
            except subprocess.TimeoutExpired:
                response = {"ok": False, "error": f"Tiempo agotado ({TIMEOUT_SECONDS} s)"}
            except Exception as error:  # keep protocol response deterministic
                response = {"ok": False, "error": str(error)}
            write_message(response)
        except Exception as error:
            write_message({"ok": False, "error": f"Error de protocolo: {error}"})
            return 1


if __name__ == "__main__":
    raise SystemExit(main())
