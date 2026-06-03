#!/usr/bin/env bash
# Create the timezone-aware "catalog refresh" trigger on cron-job.org.
#
# Fires Tue & Thu at 03:00 America/Los_Angeles (DST-safe) and POSTs to the backend's
# /internal/refresh-catalog endpoint with the shared X-Cron-Token, which kicks off
# `cueva.cli update` in the background.
#
# Prereqs (env vars):
#   CRONJOB_API_KEY     - cron-job.org API key (console.cron-job.org -> Settings -> API)
#   API_URL             - e.g. https://api.cuevapp.com
#   CRON_TRIGGER_TOKEN  - the same secret you set as CRON_TRIGGER_TOKEN on the backend
#
# Usage:
#   CRONJOB_API_KEY=... API_URL=https://api.cuevapp.com CRON_TRIGGER_TOKEN=... ./scripts/create_cronjob.sh
#
# (Prefer the dashboard? See the manual steps in GOLIVE.md — same settings.)
set -euo pipefail
: "${CRONJOB_API_KEY:?set CRONJOB_API_KEY}"
: "${API_URL:?set API_URL (e.g. https://api.cuevapp.com)}"
: "${CRON_TRIGGER_TOKEN:?set CRON_TRIGGER_TOKEN (must match the backend)}"

# wdays: 0=Sun .. 6=Sat  -> 2=Tue, 4=Thu.  requestMethod 1 = POST.  -1 = "every".
curl -fsS -X PUT "https://api.cron-job.org/jobs" \
  -H "Authorization: Bearer ${CRONJOB_API_KEY}" \
  -H "Content-Type: application/json" \
  -d @- <<JSON
{
  "job": {
    "title": "Cueva catalog refresh (Tue/Thu 3am PT)",
    "url": "${API_URL%/}/internal/refresh-catalog",
    "enabled": true,
    "saveResponses": true,
    "requestMethod": 1,
    "schedule": {
      "timezone": "America/Los_Angeles",
      "expiresAt": 0,
      "hours": [3],
      "minutes": [0],
      "mdays": [-1],
      "months": [-1],
      "wdays": [2, 4]
    },
    "extendedData": {
      "headers": {
        "X-Cron-Token": "${CRON_TRIGGER_TOKEN}"
      }
    }
  }
}
JSON

echo
echo "Done — verify at https://console.cron-job.org/jobs"
