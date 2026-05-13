#!/usr/bin/env bash
# Install system-level Jetson services. This requires sudo because files are
# written under /etc/systemd/system.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
USER_NAME="${SUDO_USER:-${USER:-wenyili}}"
if [ "$USER_NAME" = "root" ]; then
    USER_NAME="wenyili"
fi

sudo tee /etc/systemd/system/ai-backend.service >/dev/null <<EOF
[Unit]
Description=AI Detection Backend WSGI
After=network.target multi-user.target

[Service]
Type=simple
User=${USER_NAME}
WorkingDirectory=${PROJECT_ROOT}/backend
Environment="PATH=${PROJECT_ROOT}/venv/bin:/usr/bin:/bin"
Environment="PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True"
Environment="DISABLE_MODEL_SOURCE_CHECK=True"
Environment="HF_HUB_OFFLINE=1"
Environment="PYTHONUNBUFFERED=1"
ExecStartPre=-/bin/bash -c '/usr/bin/fuser -k -TERM 8000/tcp 2>/dev/null; sleep 2; /usr/bin/fuser -k -KILL 8000/tcp 2>/dev/null; true'
ExecStart=${PROJECT_ROOT}/venv/bin/python ${PROJECT_ROOT}/backend/serve_production.py --host 0.0.0.0 --port 8000
Restart=always
RestartSec=3
StartLimitIntervalSec=120
StartLimitBurst=15
MemoryHigh=2.0G
MemoryMax=2.5G

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/ai-frontend-spa.service >/dev/null <<EOF
[Unit]
Description=AI Detection Frontend SPA (Port 3005)
After=network.target multi-user.target ai-backend.service
Requires=ai-backend.service

[Service]
Type=simple
User=${USER_NAME}
WorkingDirectory=${PROJECT_ROOT}
Environment="PYTHONUNBUFFERED=1"
ExecStartPre=-/bin/bash -c '/usr/bin/fuser -k -TERM 3005/tcp 2>/dev/null; sleep 1; /usr/bin/fuser -k -KILL 3005/tcp 2>/dev/null; true'
ExecStart=${PROJECT_ROOT}/venv/bin/python ${PROJECT_ROOT}/serve_spa.py --port 3005 --dir ${PROJECT_ROOT}/dist --cert ${PROJECT_ROOT}/server.crt --key ${PROJECT_ROOT}/server.key --backend http://127.0.0.1:8000
Restart=always
RestartSec=3
StartLimitIntervalSec=120
StartLimitBurst=15

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable ai-backend.service ai-frontend-spa.service
sudo systemctl restart ai-backend.service ai-frontend-spa.service

echo "Installed system-level Jetson services."
echo "Frontend: https://$(hostname -I | awk '{print $1}'):3005"
