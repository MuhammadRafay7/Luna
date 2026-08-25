#!/usr/bin/env bash
# LUNA — one-command setup. Detects host specifics, writes .env, starts the stack.
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*"; }

command -v docker >/dev/null || { echo "docker not found"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "docker compose v2 required"; exit 1; }

if [ ! -f .env ]; then
  say "Creating .env from .env.example"
  cp .env.example .env
  chmod 600 .env
fi

set_kv() {  # set_kv KEY VALUE  — idempotent
  if grep -qE "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env
  else printf '%s=%s\n' "$1" "$2" >> .env; fi
}

say "Detecting host user"
set_kv HOST_UID  "$(id -u)"
set_kv HOST_GID  "$(id -g)"
set_kv HERMES_UID "$(id -u)"
set_kv HERMES_GID "$(id -g)"
set_kv HOST_RUNTIME_DIR "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

say "Detecting camera"
CAM=$(ls /dev/video* 2>/dev/null | head -1 || true)
if [ -n "$CAM" ]; then set_kv CAMERA_DEVICE "$CAM"; echo "    camera: $CAM"
else warn "no /dev/video* found — camera tools will be unavailable"; fi

say "Checking audio"
if [ -S "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/pipewire-0" ]; then echo "    PipeWire: ok"
elif [ -S "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/pulse/native" ]; then warn "PulseAudio found, not PipeWire — edit the socket path in docker-compose.yml"
else warn "no audio socket — voice mode will not work"; fi

say "Generating dashboard password if unset"
if grep -qE '^HERMES_DASHBOARD_BASIC_AUTH_PASSWORD=(change-me)?$' .env; then
  set_kv HERMES_DASHBOARD_BASIC_AUTH_PASSWORD "$(python3 -c 'import secrets;print(secrets.token_urlsafe(18))')"
fi

if grep -qE '^GEMINI_API_KEY=(your-key-here)?$' .env; then
  warn "GEMINI_API_KEY is not set in .env — get one at https://aistudio.google.com/apikey"
  warn "LUNA will start but cannot think until you set it."
fi

mkdir -p data workspace captures
say "Starting LUNA"
docker compose up -d

say "Waiting for dashboard"
for _ in $(seq 1 60); do
  if curl -s -o /dev/null -m 3 "http://127.0.0.1:$(grep -E '^DASHBOARD_PORT=' .env | cut -d= -f2 || echo 9119)/login" 2>/dev/null; then break; fi
  sleep 2
done

PORT=$(grep -E '^DASHBOARD_PORT=' .env | cut -d= -f2- || true); PORT=${PORT:-9119}
echo
say "LUNA is up"
echo "    Dashboard: http://127.0.0.1:$PORT"
echo "    Username:  $(grep -E '^HERMES_DASHBOARD_BASIC_AUTH_USERNAME=' .env | cut -d= -f2-)"
echo "    Password:  $(grep -E '^HERMES_DASHBOARD_BASIC_AUTH_PASSWORD=' .env | cut -d= -f2-)"
echo "    Chat:      docker compose exec luna hermes"
