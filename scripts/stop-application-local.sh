#!/usr/bin/env bash
set -euo pipefail
systemctl --user stop dme-b2b-local-frontend.service dme-b2b-local-backend.service
# Database and AI containers are retained for other workflows.
