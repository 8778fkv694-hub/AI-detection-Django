#!/bin/bash

set -euo pipefail

FULL_TARGET="graphical.target"
MINIMAL_TARGET="multi-user.target"
USER_SERVICES=(
  "ai-backend.service"
  "ai-frontend-spa.service"
)

usage() {
  cat <<'USAGE'
Usage:
  jetson-mode status
  jetson-mode full
  jetson-mode minimal

Modes:
  full     Enable the desktop and let the vision project start with the graphical session.
  minimal  Disable the desktop target and stop the vision project for the lowest idle usage.
USAGE
}

service_state() {
  local action="$1"
  local service="$2"
  systemctl --user "$action" "$service" 2>/dev/null || echo "not-found"
}

show_status() {
  echo "System default target: $(systemctl get-default)"
  echo "Display manager: $(systemctl is-active display-manager.service 2>/dev/null || echo not-found)"
  echo "User graphical session: $(systemctl --user is-active graphical-session.target 2>/dev/null || echo inactive)"
  for service in "${USER_SERVICES[@]}"; do
    echo "$service: enabled=$(service_state is-enabled "$service"), active=$(service_state is-active "$service")"
  done
}

switch_full() {
  echo "Switching to full mode: desktop + vision project."
  sudo systemctl set-default "$FULL_TARGET"
  sudo systemctl isolate "$FULL_TARGET"
  echo "Full mode applied."
  echo "If GNOME autologin stays enabled, the vision project will follow the graphical session automatically."
}

switch_minimal() {
  echo "Switching to minimal mode: no desktop + no vision project."
  echo "Keep this SSH session open while the graphical session is being stopped."
  systemctl --user stop "${USER_SERVICES[@]}" 2>/dev/null || true
  sudo systemctl set-default "$MINIMAL_TARGET"
  sudo systemctl isolate "$MINIMAL_TARGET"
  echo "Minimal mode applied."
}

case "${1:-status}" in
  status)
    show_status
    ;;
  full)
    switch_full
    ;;
  minimal)
    switch_minimal
    ;;
  *)
    usage
    exit 1
    ;;
esac
