#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
USER_SYSTEMD_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
BIN_DIR="$HOME/bin"

mkdir -p "$USER_SYSTEMD_DIR" "$BIN_DIR"

cp "$SCRIPT_DIR/ai-backend.service" "$USER_SYSTEMD_DIR/ai-backend.service"
cp "$SCRIPT_DIR/ai-frontend-spa.service" "$USER_SYSTEMD_DIR/ai-frontend-spa.service"
cp "$SCRIPT_DIR/jetson-mode.sh" "$BIN_DIR/jetson-mode"

chmod +x "$BIN_DIR/jetson-mode"

systemctl --user daemon-reload
systemctl --user disable ai-backend.service ai-frontend-spa.service >/dev/null 2>&1 || true
systemctl --user enable ai-backend.service ai-frontend-spa.service

echo "Installed user services:"
echo "  - $USER_SYSTEMD_DIR/ai-backend.service"
echo "  - $USER_SYSTEMD_DIR/ai-frontend-spa.service"
echo "Installed helper:"
echo "  - $BIN_DIR/jetson-mode"
echo
echo "Current mode:"
systemctl get-default
echo
echo "Next steps:"
echo "  $BIN_DIR/jetson-mode status"
echo "  $BIN_DIR/jetson-mode minimal"
echo "  $BIN_DIR/jetson-mode full"
