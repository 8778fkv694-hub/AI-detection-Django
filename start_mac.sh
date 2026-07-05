#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"
export PROJECT_ROOT
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

MODE="${1:-full}"
STARTED_PIDS=()

log() {
    printf '%s\n' "$*"
}

fail() {
    printf 'ERROR: %s\n' "$*" >&2
    exit 1
}

require_cmd() {
    command -v "$1" >/dev/null 2>&1 || fail "$1 is not installed or not in PATH"
}

pid_is_alive() {
    [ -n "${1:-}" ] && ps -p "$1" >/dev/null 2>&1
}

stop_pid_file() {
    local pid_file="$1"
    local label="$2"

    if [ ! -f "$pid_file" ]; then
        return 0
    fi

    local pid
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if pid_is_alive "$pid"; then
        log "Stopping old $label process (PID: $pid)"
        kill "$pid" 2>/dev/null || true
        sleep 1
    fi
    rm -f "$pid_file"
}

wait_port() {
    local port="$1"
    local label="$2"
    local attempts="${3:-30}"

    for ((i = 1; i <= attempts; i++)); do
        if nc -z 127.0.0.1 "$port" >/dev/null 2>&1; then
            log "$label is ready on port $port"
            return 0
        fi
        sleep 1
    done

    return 1
}

ensure_node_deps() {
    require_cmd node
    require_cmd npm

    if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
        log "Installing Node.js dependencies..."
        npm install
    fi
}

ensure_backend() {
    require_cmd python3

    local candidate
    local candidates=()

    if [ -n "${START_MAC_PYTHON:-}" ]; then
        candidates+=("$START_MAC_PYTHON")
    fi
    candidates+=(
        "$PROJECT_ROOT/venv/bin/python"
        "$PROJECT_ROOT/backend/venv/bin/python"
        "$(command -v python3)"
    )

    for candidate in "${candidates[@]}"; do
        if [ -x "$candidate" ] && backend_deps_ok "$candidate"; then
            BACKEND_PY="$candidate"
            export BACKEND_PY
            log "Using backend Python: $BACKEND_PY"
            break
        fi
    done

    if [ -z "${BACKEND_PY:-}" ]; then
        if [ ! -d "$PROJECT_ROOT/backend/venv" ]; then
            log "Creating backend virtualenv..."
            python3 -m venv "$PROJECT_ROOT/backend/venv"
        fi

        BACKEND_PY="$PROJECT_ROOT/backend/venv/bin/python"
        [ -x "$BACKEND_PY" ] || fail "Backend Python not found at $BACKEND_PY"
        export BACKEND_PY

        log "Installing web backend dependencies..."
        "$BACKEND_PY" -m ensurepip --upgrade >/dev/null 2>&1 || true
        "$BACKEND_PY" -m pip install -r "$PROJECT_ROOT/backend/requirements-web.txt"

        backend_deps_ok "$BACKEND_PY" || fail "Backend dependencies are still incomplete after install"
    fi

    log "Running Django migrations..."
    (
        cd "$PROJECT_ROOT/backend"
        "$BACKEND_PY" manage.py migrate --noinput
    )
}

backend_deps_ok() {
    local python_bin="$1"

    "$python_bin" - <<'PY' >/dev/null 2>&1
import django
import rest_framework
import corsheaders
import PIL
import requests
import numpy
import cv2
PY
}

start_bg() {
    local label="$1"
    local pid_file="$2"
    local log_file="$3"
    shift 3

    stop_pid_file "$pid_file" "$label"
    log "Starting $label..."
    "$@" > "$log_file" 2>&1 &
    local pid=$!
    echo "$pid" > "$pid_file"
    STARTED_PIDS+=("$pid")
    log "$label PID: $pid"
}

print_urls() {
    cat <<'EOF'

URLs:
  Frontend:     http://localhost:3303
  Django API:   http://localhost:8000/api/
  Django admin: http://localhost:8000/admin
  Node API:     http://localhost:3001
  RPA API:      http://localhost:3002

Logs:
  Django: django.log
  React:  react.log
  Node:   nodejs.log
  RPA:    rpa.log

Stop:
  ./stop_services.sh
EOF
}

wait_for_started_services() {
    if [ "${START_MAC_NO_WAIT:-0}" = "1" ]; then
        return 0
    fi

    log
    log "Mac dev services are running. Keep this window/session open."
    log "Press Ctrl+C to stop all local dev services."

    trap 'log; log "Stopping Mac dev services..."; "$PROJECT_ROOT/stop_services.sh"; exit 0' INT TERM
    wait "${STARTED_PIDS[@]}"
}

start_full() {
    ensure_backend
    ensure_node_deps

    start_bg "Django" "$PROJECT_ROOT/django.pid" "$PROJECT_ROOT/django.log" \
        bash -c 'cd "$PROJECT_ROOT/backend" && "$BACKEND_PY" manage.py runserver 0.0.0.0:8000'
    wait_port 8000 "Django" 45 || fail "Django failed to start; see django.log"

    start_bg "Node API" "$PROJECT_ROOT/nodejs.pid" "$PROJECT_ROOT/nodejs.log" \
        bash -c 'cd "$PROJECT_ROOT" && npm run dev:server'
    wait_port 3001 "Node API" 30 || log "WARNING: Node API may still be starting; see nodejs.log"

    start_bg "RPA server" "$PROJECT_ROOT/rpa.pid" "$PROJECT_ROOT/rpa.log" \
        bash -c 'cd "$PROJECT_ROOT" && node rpa-server.js'
    wait_port 3002 "RPA server" 20 || log "WARNING: RPA server may still be starting; see rpa.log"

    start_bg "React frontend" "$PROJECT_ROOT/react.pid" "$PROJECT_ROOT/react.log" \
        bash -c 'cd "$PROJECT_ROOT" && npm run dev:client'
    wait_port 3303 "React frontend" 30 || fail "React frontend failed to start; see react.log"

    print_urls
    if command -v open >/dev/null 2>&1; then
        open "http://localhost:3303" >/dev/null 2>&1 || true
    fi
    wait_for_started_services
}

start_django() {
    ensure_backend
    cd "$PROJECT_ROOT/backend"
    exec "$BACKEND_PY" manage.py runserver 0.0.0.0:8000
}

start_frontend() {
    ensure_node_deps
    exec npm run dev:client
}

start_node_api() {
    ensure_node_deps
    exec npm run dev:server
}

start_rpa() {
    ensure_node_deps
    exec node rpa-server.js
}

start_ollama() {
    require_cmd ollama

    if nc -z 127.0.0.1 11434 >/dev/null 2>&1; then
        log "Ollama is already running on http://localhost:11434"
        return 0
    fi

    log "Starting Ollama..."
    ollama serve > "$PROJECT_ROOT/ollama.log" 2>&1 &
    local pid=$!
    echo "$pid" > "$PROJECT_ROOT/ollama.pid"
    wait_port 11434 "Ollama" 45 || fail "Ollama failed to start; see ollama.log"
}

start_ollama_proxy() {
    ensure_node_deps
    start_ollama

    stop_pid_file "$PROJECT_ROOT/ollama-proxy.pid" "Ollama proxy"
    log "Starting Ollama proxy..."
    node ollama-proxy.js > "$PROJECT_ROOT/ollama-proxy.log" 2>&1 &
    local pid=$!
    echo "$pid" > "$PROJECT_ROOT/ollama-proxy.pid"
    wait_port 11437 "Ollama proxy" 20 || log "WARNING: Ollama proxy may still be starting; see ollama-proxy.log"
}

start_moondream() {
    require_cmd ollama
    ensure_node_deps
    start_ollama

    if ! ollama list | grep -q 'moondream'; then
        log "Pulling moondream model..."
        ollama pull moondream:latest
    fi

    if ! ollama list | grep -q 'moondream-fast'; then
        log "Creating moondream-fast model..."
        cat > /tmp/moondream-fast.Modelfile <<'EOF'
FROM moondream:latest
PARAMETER num_gpu_layers 999
PARAMETER num_thread 4
PARAMETER num_ctx 2048
PARAMETER num_predict 96
PARAMETER temperature 0.2
PARAMETER keep_alive 2h
EOF
        ollama create moondream-fast -f /tmp/moondream-fast.Modelfile
    fi

    start_ollama_proxy
    start_bg "React frontend" "$PROJECT_ROOT/react.pid" "$PROJECT_ROOT/react.log" \
        bash -c 'cd "$PROJECT_ROOT" && npm run dev:client'
    wait_port 3303 "React frontend" 30 || fail "React frontend failed to start; see react.log"
    log "Moondream mode is ready: http://localhost:3303"
}

start_production_preview() {
    ensure_backend
    ensure_node_deps

    if [ ! -f "$PROJECT_ROOT/dist/index.html" ]; then
        log "dist/ missing; running npm run build..."
        npm run build
    fi

    start_bg "Django production preview" "$PROJECT_ROOT/django.pid" "$PROJECT_ROOT/django.log" \
        bash -c 'cd "$PROJECT_ROOT/backend" && "$BACKEND_PY" manage.py runserver 0.0.0.0:8000 --noreload'
    wait_port 8000 "Django" 45 || fail "Django failed to start; see django.log"

    if [ -d "$PROJECT_ROOT/nodejs-stream-service/node_modules" ]; then
        start_bg "Node stream service" "$PROJECT_ROOT/stream.pid" "$PROJECT_ROOT/nodejs.log" \
            bash -c 'cd "$PROJECT_ROOT/nodejs-stream-service" && npm run start'
    else
        log "Skipping nodejs-stream-service because node_modules is missing"
    fi

    local spa_args=(serve_spa.py --port 3005 --dir "$PROJECT_ROOT/dist" --backend http://127.0.0.1:8000)
    local scheme="http"
    if [ -f "$PROJECT_ROOT/server.crt" ] && [ -f "$PROJECT_ROOT/server.key" ]; then
        spa_args+=(--cert "$PROJECT_ROOT/server.crt" --key "$PROJECT_ROOT/server.key")
        scheme="https"
    fi

    start_bg "Mac production preview SPA" "$PROJECT_ROOT/spa.pid" "$PROJECT_ROOT/frontend_prod.log" \
        "$BACKEND_PY" "${spa_args[@]}"
    wait_port 3005 "SPA server" 20 || fail "SPA server failed to start; see frontend_prod.log"

    log "Mac production preview is ready: ${scheme}://localhost:3005"
    if command -v open >/dev/null 2>&1; then
        open "${scheme}://localhost:3005" >/dev/null 2>&1 || true
    fi
}

show_status() {
    for item in \
        "django.pid:Django:8000" \
        "nodejs.pid:Node API:3001" \
        "rpa.pid:RPA:3002" \
        "react.pid:React:3303" \
        "stream.pid:Node stream:3000" \
        "spa.pid:SPA:3005" \
        "ollama.pid:Ollama:11434" \
        "ollama-proxy.pid:Ollama proxy:11437"; do
        local pid_file label port pid
        IFS=':' read -r pid_file label port <<<"$item"
        pid=""
        [ -f "$PROJECT_ROOT/$pid_file" ] && pid="$(cat "$PROJECT_ROOT/$pid_file" 2>/dev/null || true)"
        if pid_is_alive "$pid"; then
            log "$label: running (PID $pid, port $port)"
        else
            log "$label: stopped"
        fi
    done
}

show_help() {
    cat <<'EOF'
Usage:
  ./start_mac.sh [mode]

Modes:
  full        Start Mac development stack: Django + Node API + RPA + Vite (default)
  django      Start Django only, foreground
  frontend    Start Vite frontend only, foreground
  node        Start Node API only, foreground
  rpa         Start RPA server only, foreground
  ollama      Start Ollama service
  ollama-proxy Start Ollama service + local proxy
  moondream   Start Moondream local-model helper stack
  production  Start Mac production preview on port 3005
  status      Show PID-file based service status
  stop        Stop local services via stop_services.sh
  help        Show this help

Other platforms:
  Jetson:  bash deploy/start_jetson.sh
  Android: cd android-app && bash scripts/build-apk.sh debug
EOF
}

case "$MODE" in
    full) start_full ;;
    django) start_django ;;
    frontend) start_frontend ;;
    node) start_node_api ;;
    rpa) start_rpa ;;
    ollama) start_ollama ;;
    ollama-proxy) start_ollama_proxy ;;
    moondream) start_moondream ;;
    production|prod) start_production_preview ;;
    status) show_status ;;
    stop) exec "$PROJECT_ROOT/stop_services.sh" ;;
    help|-h|--help) show_help ;;
    *) show_help; fail "Unknown mode: $MODE" ;;
esac
