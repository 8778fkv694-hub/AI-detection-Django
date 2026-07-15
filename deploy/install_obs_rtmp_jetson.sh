#!/usr/bin/env bash
# Install the Jetson-side RTMP ingest used by the second (OBS) camera source.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NGINX_CONF="/etc/nginx/nginx.conf"
RTMP_CONF="/etc/nginx/rtmp.conf"

if ! dpkg-query -W -f='${Status}' libnginx-mod-rtmp 2>/dev/null | grep -q 'install ok installed'; then
    sudo apt-get update
    sudo apt-get install -y nginx libnginx-mod-rtmp
fi

sudo install -m 0644 "${PROJECT_ROOT}/deploy/nginx-rtmp.conf" "${RTMP_CONF}"

if ! sudo grep -q '^include /etc/nginx/rtmp.conf;' "${NGINX_CONF}"; then
    sudo sed -i '/^http {/i include /etc/nginx/rtmp.conf;' "${NGINX_CONF}"
fi

sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx

echo "OBS RTMP ingest installed."
echo "Server: rtmp://$(hostname -I | awk '{print $1}')/live"
echo "Stream key: obs"
