#!/usr/bin/env bash
set -euo pipefail

plist_path="${1:-/Library/LaunchDaemons/com.agentops.worker-supervisor.plist}"
label="${2:-com.agentops.worker-supervisor}"

plutil -lint "$plist_path"
launchctl print "system/$label"
grep --fixed-strings --quiet '<string>supervisor-only</string>' "$plist_path"
if grep --extended-regexp --ignore-case --quiet 'resume.*(agent|workload)|provider.*start' "$plist_path"; then
  echo "Worker service definition must not resume workloads or start providers." >&2
  exit 1
fi
