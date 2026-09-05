#!/usr/bin/env bash
set -euo pipefail

install_dir="${XDG_DATA_HOME:-$HOME/.local/share}/chatgpt-local-bridge"
config_root="${XDG_CONFIG_HOME:-$HOME/.config}"

if [[ -d "$install_dir" ]]; then
  rm -r -- "$install_dir"
fi
for browser_root in chromium google-chrome BraveSoftware/Brave-Browser; do
  manifest="$config_root/$browser_root/NativeMessagingHosts/com.zoa.chatgpt_local_bridge.json"
  if [[ -f "$manifest" ]]; then
    rm -- "$manifest"
  fi
done
echo "ChatGPT Local Bridge desinstalado. Quita también la extensión desde chromium://extensions."
