#!/usr/bin/env bash
# Deploy the current Mac workspace to Jetson and run the checks that matter for
# the MJPEG/PPE detection-loop fixes.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_TARGET="${JETSON_SSH_TARGET:-jetson}"
REMOTE_DIR="${JETSON_PROJECT_DIR:-/home/wenyili/projects/AI-Detection}"
STREAM_ID="${JETSON_STREAM_ID:-}"
SKIP_BUILD="${SKIP_BUILD:-0}"
SKIP_RESTART="${SKIP_RESTART:-0}"

SSH_OPTS=(
  -i "$HOME/.ssh/id_rsa"
  -o IdentitiesOnly=yes
  -o ControlMaster=no
  -S none
)

log() {
  printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$*"
}

remote() {
  ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "$@"
}

remote_tty() {
  ssh -tt "${SSH_OPTS[@]}" "$SSH_TARGET" "$@"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Required command not found: $1" >&2
    exit 2
  }
}

json_stream_id() {
  python3 -c '
import json, sys
data = json.load(sys.stdin)
streams = data.get("streams") or {}
for sid, info in streams.items():
    if info.get("is_running") or info.get("is_connected"):
        print(sid)
        raise SystemExit(0)
raise SystemExit(1)
'
}

require_cmd npm
require_cmd rsync
require_cmd ssh
require_cmd python3

cd "$ROOT_DIR"

log "Checking Jetson SSH connectivity: $SSH_TARGET"
remote "test -d '$REMOTE_DIR' && echo remote_project_ok"

if [ "$SKIP_BUILD" != "1" ]; then
  log "Building frontend locally"
  npm run build
else
  log "Skipping local frontend build because SKIP_BUILD=1"
fi

log "Syncing backend hot-path files"
rsync -az \
  backend/inspection/stream_service.py \
  backend/inspection/mjpeg_view.py \
  backend/inspection/detection_loop.py \
  backend/inspection/detection_api.py \
  backend/inspection/stream_api.py \
  backend/inspection/yolo.py \
  "$SSH_TARGET:$REMOTE_DIR/backend/inspection/"

log "Syncing frontend source and built dist"
rsync -az src/ "$SSH_TARGET:$REMOTE_DIR/src/"
rsync -az --delete dist/ "$SSH_TARGET:$REMOTE_DIR/dist/"

if [ "$SKIP_RESTART" != "1" ]; then
  log "Restarting Jetson services. Enter sudo password on prompt if requested."
  remote_tty "sudo systemctl restart ai-backend ai-frontend-spa && sleep 3 && systemctl is-active ai-backend ai-frontend-spa"
else
  log "Skipping service restart because SKIP_RESTART=1"
fi

log "Checking service logs for immediate failures"
remote "systemctl --no-pager --plain status ai-backend ai-frontend-spa | sed -n '1,80p'"

log "Checking active stream manager status"
STATUS_JSON="$(remote "curl -sS http://127.0.0.1:8000/api/streams/manager/status/")"
printf '%s\n' "$STATUS_JSON"

if [ -z "$STREAM_ID" ]; then
  if STREAM_ID="$(printf '%s\n' "$STATUS_JSON" | json_stream_id)"; then
    log "Auto-detected active stream: $STREAM_ID"
  else
    log "No active stream detected; skipping stream-specific checks"
    STREAM_ID=""
  fi
fi

log "Checking detection-loop status"
LOOP_STATUS_JSON="$(remote "curl -sS http://127.0.0.1:8000/api/streams/detection-loop/status/")"
printf '%s\n' "$LOOP_STATUS_JSON"

ACTIVE_LOOPS="$(printf '%s\n' "$LOOP_STATUS_JSON" | python3 -c '
import json, sys
try:
    print(json.load(sys.stdin).get("active_loops", 0))
except Exception:
    print("unknown")
')"
log "Detection-loop active_loops=$ACTIVE_LOOPS"

if [ -n "$STREAM_ID" ]; then
  log "Checking latest detections for stream $STREAM_ID"
  DETECTIONS_JSON="$(remote "curl -sS http://127.0.0.1:8000/api/streams/$STREAM_ID/detections/")"
  printf '%s\n' "$DETECTIONS_JSON"
  BOX_COUNT="$(printf '%s\n' "$DETECTIONS_JSON" | python3 -c '
import json, sys
try:
    print(len(json.load(sys.stdin).get("boxes") or []))
except Exception:
    print("unknown")
')"
  FRAME_SIZE="$(printf '%s\n' "$DETECTIONS_JSON" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    w, h = data.get("frame_width"), data.get("frame_height")
    print(f"{w}x{h}" if w and h else "unknown")
except Exception:
    print("unknown")
')"
  log "Latest detection summary: boxes=$BOX_COUNT frame_size=$FRAME_SIZE"

  log "Measuring MJPEG-CV2 throughput for stream $STREAM_ID (5s sample)"
  MJPEG_SAMPLE="$(remote "curl -sS --max-time 5 'http://127.0.0.1:8000/api/streams/$STREAM_ID/mjpeg-cv2/?quality=75&width=960&fps=25&overlay=0' | python3 -c \"import sys, json; data=sys.stdin.buffer.read(); print(json.dumps({'frames': data.count(b'--frame'), 'bytes': len(data)}))\"")"
  printf '%s\n' "$MJPEG_SAMPLE"
  MJPEG_FRAMES="$(printf '%s\n' "$MJPEG_SAMPLE" | python3 -c '
import json, sys
try:
    print(json.load(sys.stdin).get("frames", 0))
except Exception:
    print("unknown")
')"
  if [ "$MJPEG_FRAMES" != "unknown" ]; then
    log "MJPEG sample summary: ${MJPEG_FRAMES} frames / 5s (~$((MJPEG_FRAMES / 5)) fps integer floor)"
  fi

  log "Running direct YOLO check script"
  JETSON_SSH_TARGET="$SSH_TARGET" JETSON_STREAM_ID="$STREAM_ID" "$ROOT_DIR/scripts/jetson_yolo_direct_check.sh"
fi

log "Recent backend log tail"
remote "journalctl -u ai-backend -n 80 --no-pager"

log "Deploy and verification script completed"
