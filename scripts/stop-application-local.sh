#!/usr/bin/env bash
set -euo pipefail
systemctl --user stop dme-b2b-local-frontend.service dme-b2b-local-backend.service
systemctl --user stop dme-mobile-demo.service 2>/dev/null || true
# Database and AI containers are retained for other workflows.
