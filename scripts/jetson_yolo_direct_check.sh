#!/usr/bin/env bash
# Directly verify Jetson YOLO on the current stream. This distinguishes
# "model did not detect boxes" from "frontend did not draw boxes".
set -euo pipefail

SSH_TARGET="${JETSON_SSH_TARGET:-jetson}"
STREAM_ID="${JETSON_STREAM_ID:-}"
CONF="${YOLO_CONF:-0.25}"
DETECTION_TYPE="${YOLO_DETECTION_TYPE:-cleanroom_ppe}"
OWNER_ID="direct-check:$(date +%s):$$"

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

extract_stream_id() {
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

log "Checking Jetson connectivity: $SSH_TARGET"
remote "echo jetson_ok"

if [ -z "$STREAM_ID" ]; then
  STATUS_JSON="$(remote "curl -sS http://127.0.0.1:8000/api/streams/manager/status/")"
  if STREAM_ID="$(printf '%s\n' "$STATUS_JSON" | extract_stream_id)"; then
    log "Auto-detected active stream: $STREAM_ID"
  else
    echo "No active stream found. Start the USB stream first." >&2
    exit 1
  fi
fi

log "Starting backend detection loop for stream $STREAM_ID"
remote "curl -sS -X POST -H 'Content-Type: application/json' \
  -d '{\"model_id\":\"ppe_detection\",\"conf_threshold\":$CONF,\"owner_id\":\"$OWNER_ID\"}' \
  http://127.0.0.1:8000/api/streams/$STREAM_ID/detection-loop/start/"

log "Waiting for detection loop to produce results"
remote "sleep 2"

log "Loop status"
remote "curl -sS http://127.0.0.1:8000/api/streams/detection-loop/status/"

log "Latest loop detections"
remote "curl -sS http://127.0.0.1:8000/api/streams/$STREAM_ID/detections/ | python3 -m json.tool"

log "Direct snapshot + yolo-detect request"
remote "python3 - <<'PY'
import base64
import json
import sys
import urllib.error
import urllib.request

stream_id = '$STREAM_ID'
conf = float('$CONF')
detection_type = '$DETECTION_TYPE'
base = 'http://127.0.0.1:8000'

def get(url):
    with urllib.request.urlopen(url, timeout=15) as response:
        return response.read(), response.headers

def post_json(url, payload):
    body = json.dumps(payload).encode('utf-8')
    request = urllib.request.Request(
        url,
        data=body,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.status, response.read()

image_b64 = None
image_source = None
try:
    jpeg, headers = get(f'{base}/api/streams/{stream_id}/snapshot/')
    image_b64 = base64.b64encode(jpeg).decode('ascii')
    image_source = 'snapshot'
except Exception as exc:
    print({'snapshot_error': str(exc)}, file=sys.stderr)

if not image_b64:
    raw, _headers = get(f'{base}/api/streams/{stream_id}/frame/?quality=85&width=1280')
    frame_payload = json.loads(raw.decode('utf-8'))
    frame_data = frame_payload.get('frame') or ''
    if 'base64,' in frame_data:
        frame_data = frame_data.split('base64,', 1)[1]
    image_b64 = frame_data
    image_source = 'frame'

payload = {
    'image': image_b64,
    'conf': conf,
    'detection_type': detection_type,
}

try:
    status, raw = post_json(f'{base}/api/results/yolo-detect/', payload)
    result = json.loads(raw.decode('utf-8'))
except urllib.error.HTTPError as exc:
    error_body = exc.read().decode('utf-8', errors='replace')
    print({'http_status': exc.code, 'error': error_body})
    raise SystemExit(1)

detections = result.get('detections') or []
summary = {
    'image_source': image_source,
    'http_status': status,
    'model_type': result.get('model_type'),
    'detection_type': result.get('detection_type'),
    'model_resolution': result.get('model_resolution'),
    'box_count': len(detections),
    'boxes': detections,
}
print(json.dumps(summary, ensure_ascii=False, indent=2))
PY"

log "Stopping direct-check owner"
remote "curl -sS -X POST -H 'Content-Type: application/json' \
  -d '{\"owner_id\":\"$OWNER_ID\"}' \
  http://127.0.0.1:8000/api/streams/$STREAM_ID/detection-loop/stop/"

log "Direct YOLO check completed"
