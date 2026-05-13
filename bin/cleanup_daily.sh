#!/usr/bin/env bash
# Daily Jetson maintenance: trim old inspection rows, stale HLS files, caches,
# and oversized logs. Safe to run repeatedly; flock prevents overlap.
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$HOME/projects/AI-Detection}"
PYTHON="${PROJECT_DIR}/venv/bin/python"
[ -x "$PYTHON" ] || PYTHON="${PROJECT_DIR}/venv/bin/python3"
DAYS="${CLEANUP_DAYS:-30}"
LOCKFILE="/tmp/ai_detection_cleanup_daily.lock"

exec 200>"$LOCKFILE"
if ! flock -n 200; then
    echo "cleanup_daily already running; skipped" | systemd-cat -t ai-cleanup 2>/dev/null || true
    exit 0
fi

log() {
    if command -v systemd-cat >/dev/null 2>&1; then
        echo "$1" | systemd-cat -t ai-cleanup
    else
        echo "$1"
    fi
}

log "cleanup started: project=${PROJECT_DIR}, days=${DAYS}"

if [ -x "$PYTHON" ] && [ -f "${PROJECT_DIR}/backend/manage.py" ]; then
    (cd "${PROJECT_DIR}/backend" && "$PYTHON" manage.py cleanup_old_results --days "$DAYS") || true
fi

find "${PROJECT_DIR}/backend/media/hls" -type f \( -name "*.ts" -o -name "*.m3u8" \) -mmin +30 -delete 2>/dev/null || true
find "${PROJECT_DIR}" -name "__pycache__" -type d -prune -exec rm -rf {} + 2>/dev/null || true
find "${PROJECT_DIR}" -name "*.pyc" -delete 2>/dev/null || true
find "${PROJECT_DIR}" -name "*.log.*" -mtime +"$DAYS" -delete 2>/dev/null || true
find "${PROJECT_DIR}" -name "*.log" -size +50M -exec truncate -s 0 {} \; 2>/dev/null || true
find "$HOME/.cache/pip" -type f -mtime +"$DAYS" -delete 2>/dev/null || true

USAGE="$(df "$HOME" | awk 'NR==2 {gsub(/%/, "", $5); print $5}')"
AVAIL="$(df -h "$HOME" | awk 'NR==2 {print $4}')"
if [ "${USAGE:-0}" -ge 95 ]; then
    log "cleanup finished; disk critical: ${USAGE}% used, ${AVAIL} available"
elif [ "${USAGE:-0}" -ge 85 ]; then
    log "cleanup finished; disk high: ${USAGE}% used, ${AVAIL} available"
else
    log "cleanup finished; disk ok: ${USAGE}% used, ${AVAIL} available"
fi
