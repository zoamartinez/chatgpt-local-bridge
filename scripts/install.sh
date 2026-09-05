#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
install_dir="${XDG_DATA_HOME:-$HOME/.local/share}/chatgpt-local-bridge"
config_root="${XDG_CONFIG_HOME:-$HOME/.config}"

if [[ $# -ne 1 || ! "$1" =~ ^[a-p]{32}$ ]]; then
  echo "Uso: ./scripts/install.sh ID_EXTENSION"
  echo "Carga extension/ en chromium://extensions y copia su ID de 32 letras."
  exit 2
fi

extension_id="$1"
expected_repo="https://github.com/zoamartinez/chatgpt-local-bridge.git"
if [[ ! -d "$project_dir/.git" ]]; then
  echo "Error: instala desde un clon Git para habilitar las actualizaciones." >&2
  echo "git clone $expected_repo" >&2
  exit 2
fi
origin="$(git -C "$project_dir" remote get-url origin)"
if [[ "$origin" != "$expected_repo" ]]; then
  echo "Error: el origen debe ser exactamente $expected_repo" >&2
  exit 2
fi
mkdir -p "$install_dir/native-host"
install -m 0755 "$project_dir/native-host/bridge.py" "$install_dir/native-host/bridge.py"
python3 - "$install_dir/config.json" "$project_dir" <<'PY'
import json
import sys
from pathlib import Path

path, source = sys.argv[1:]
Path(path).write_text(json.dumps({"source_dir": str(Path(source).resolve())}, indent=2) + "\n")
PY

manifest_json="$(python3 - "$install_dir/native-host/bridge.py" "$extension_id" <<'PY'
import json
import sys
from pathlib import Path

host, extension_id = sys.argv[1:]
data = {
    "name": "com.zoa.chatgpt_local_bridge",
    "description": "Agente local de ChatGPT Local Bridge",
    "path": str(Path(host).resolve()),
    "type": "stdio",
    "allowed_origins": [f"chrome-extension://{extension_id}/"],
}
print(json.dumps(data, indent=2))
PY
)"

installed_manifests=()
for browser_root in chromium google-chrome BraveSoftware/Brave-Browser; do
  native_dir="$config_root/$browser_root/NativeMessagingHosts"
  mkdir -p "$native_dir"
  manifest="$native_dir/com.zoa.chatgpt_local_bridge.json"
  printf '%s\n' "$manifest_json" > "$manifest"
  installed_manifests+=("$manifest")
done

echo "Agente instalado en: $install_dir"
echo "Extensión actualizable: $project_dir/extension"
printf 'Manifest Native Messaging: %s\n' "${installed_manifests[@]}"
echo "Reinicia la aplicación web de ChatGPT antes de probar."
