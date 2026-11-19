#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
node_bin=$(command -v node)
backend="$root/applications/dme_backend-main"
frontend="$root/applications/dme_frontend-main"
[[ -f "$backend/.env.local" && -f "$frontend/.env.local" ]] || { echo 'Configure both applications .env.local files first.' >&2; exit 1; }
[[ -f "$backend/dist/src/main.js" && -f "$frontend/.next/BUILD_ID" ]] || { echo 'Build both applications first (npm run build).' >&2; exit 1; }
# Preserve the configured read-only Google credential mount when recreating discovery.
if [[ -z "${DISCOVERY_ENV_FILE:-}" ]] && docker inspect b2b-discovery-connector >/dev/null 2>&1; then
  DISCOVERY_ENV_FILE=$(docker inspect b2b-discovery-connector --format '{{range .Mounts}}{{if eq .Destination "/run/secrets/discovery.env"}}{{.Source}}{{end}}{{end}}')
  export DISCOVERY_ENV_FILE
fi
# n8n is an existing volume-backed service. Start it before the other workers
# and restore its shared route if Docker has detached that optional network.
if docker inspect b2b-n8n >/dev/null 2>&1; then
  if [[ "$(docker inspect b2b-n8n --format '{{.State.Running}}')" != true ]]; then
    docker start b2b-n8n
  fi
  if docker network inspect tp4_n8n_local >/dev/null 2>&1 \
      && ! docker inspect -f '{{json .NetworkSettings.Networks}}' b2b-n8n | rg -q '"tp4_n8n_local"'; then
    docker network connect --gw-priority 1 --alias n8n tp4_n8n_local b2b-n8n
  fi
fi
for component in application searxng discovery-connector website-collector fact-extraction-gateway rne-connector dme-assistant-gateway report-cleaner-gateway risk-detector-gateway; do
  docker compose -f "$root/deployment/$component/docker-compose.yml" up -d
done
# These stateless gateways also need the host's default bridge. Ollama listens
# on that bridge, and the local published-port route is unavailable from the
# project's isolated bridge on this host. Compose cannot attach to Docker's
# built-in bridge because it adds network aliases, which that bridge rejects.
for gateway in b2b-rne-connector b2b-dme-assistant-gateway b2b-report-cleaner-gateway b2b-risk-detector-gateway; do
  if ! docker inspect -f '{{json .NetworkSettings.Networks}}' "$gateway" | rg -q '"bridge"'; then
    docker network connect bridge "$gateway"
  fi
done
# Flowise is owned by its existing Compose project outside this repository.
# Give it the same non-overlapping egress route as n8n so it can reach Ollama.
if docker inspect docker-flowise-1 >/dev/null 2>&1 \
    && docker network inspect tp4_n8n_local >/dev/null 2>&1 \
    && ! docker inspect -f '{{json .NetworkSettings.Networks}}' docker-flowise-1 | rg -q '"tp4_n8n_local"'; then
  docker network connect --gw-priority 1 --alias flowise tp4_n8n_local docker-flowise-1
fi
# Wait for the existing database; never reset or migrate it as part of startup.
for attempt in {1..30}; do
  if docker exec dme-application-postgres pg_isready -U dme_local -d dme_integration >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec dme-application-postgres pg_isready -U dme_local -d dme_integration >/dev/null
if ! systemctl --user is-active --quiet dme-b2b-local-backend.service; then
  systemd-run --user --collect --unit=dme-b2b-local-backend --working-directory="$backend" --property=Restart=on-failure "$node_bin" dist/src/main.js
fi
if ! systemctl --user is-active --quiet dme-b2b-local-frontend.service; then
  systemd-run --user --collect --unit=dme-b2b-local-frontend --working-directory="$frontend" --property=Restart=on-failure "$node_bin" node_modules/next/dist/bin/next start --port 3002 --hostname 127.0.0.1
fi
mobile="$root/applications/dme_mobile_app/build/web"
if [[ -f "$mobile/index.html" ]] && ! systemctl --user is-active --quiet dme-mobile-demo.service; then
  systemd-run --user --collect --unit=dme-mobile-demo --working-directory="$mobile" --property=Restart=on-failure /usr/bin/python3 -m http.server 8090 --bind 127.0.0.1
fi
[[ -f "$mobile/index.html" ]] && echo 'Mobile app (browser build): http://localhost:8090'
printf '%s\n' 'Local website: http://localhost:3002' 'Local login details: deployment/application/.local-access.md'
