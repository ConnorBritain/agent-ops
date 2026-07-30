#!/usr/bin/env bash
set -euo pipefail

unit_name="${1:-agentops-worker-supervisor.service}"

systemctl is-enabled --quiet "$unit_name"
systemctl is-active --quiet "$unit_name"
systemctl show "$unit_name" --property=User --property=Type --property=Restart --property=Environment
systemctl cat "$unit_name" | grep --fixed-strings --quiet 'AGENTOPS_WORKER_MODE=supervisor-only'
if systemctl cat "$unit_name" | grep --extended-regexp --ignore-case --quiet 'resume.*(agent|workload)|provider.*start'; then
  echo "Worker service definition must not resume workloads or start providers." >&2
  exit 1
fi
