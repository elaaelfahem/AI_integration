#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
node_bin=$(command -v node)
backend="$root/applications/dme_backend-main"
frontend="$root/applications/dme_frontend-main"
[[ -f "$backend/.env.local" && -f "$frontend/.env.local" ]] || { echo 'Configure both applications .env.local files first.' >&2; exit 1; }
[[ -f "$backend/dist/src/main.js" && -f "$frontend/.next/BUILD_ID" ]] || { echo 'Build both applications first (npm run build).' >&2; exit 1; }
for component in application dme-assistant-gateway report-cleaner-gateway risk-detector-gateway; do
  docker compose -f "$root/deployment/$component/docker-compose.yml" up -d
done
if ! systemctl --user is-active --quiet dme-b2b-local-backend.service; then
  systemd-run --user --collect --unit=dme-b2b-local-backend --working-directory="$backend" --property=Restart=on-failure "$node_bin" dist/src/main.js
fi
if ! systemctl --user is-active --quiet dme-b2b-local-frontend.service; then
  systemd-run --user --collect --unit=dme-b2b-local-frontend --working-directory="$frontend" --property=Restart=on-failure "$node_bin" node_modules/next/dist/bin/next start --port 3002 --hostname 127.0.0.1
fi
printf '%s\n' 'Local website: http://localhost:3002' 'Local login details: deployment/application/.local-access.md'
