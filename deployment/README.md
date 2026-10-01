# Local Flowise and Ollama connectivity

These files allow the Flowise Docker container to reach the host Ollama service at `http://host.docker.internal:11434` on Linux.

- `docker-compose.override.yml` maps `host.docker.internal` to Docker's host gateway.
- `ollama-docker-bridge-proxy.mjs` forwards HTTP between the Docker bridge and Ollama's localhost-only listener.
- `ollama-docker-bridge-proxy.service` keeps that proxy running as a user service.

The Compose override is deployed beside the Flowise Compose file and the service unit is deployed in the user's systemd directory. The proxy binds to Docker's default host-gateway address (`172.17.0.1`), which is the address assigned to `host.docker.internal` by the override. This avoids exposing unauthenticated Ollama on the machine's LAN interfaces. If the Docker daemon's default bridge subnet changes, update the bind address to its new host gateway.
