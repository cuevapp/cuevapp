#!/usr/bin/env bash
# Create a "warm-up" trigger on cron-job.org that wakes the (free-tier) Render service
# ONE MINUTE BEFORE the catalog refresh, so the 03:00 refresh hits a warm instance
# instead of a cold-starting one (which can return a transient 5xx → "HTTP error").
#
# Fires Tue & Thu at 02:59 America/Los_Angeles and sends a plain GET to the API root.
# No token needed — it's just a wake-up ping (the root returns 404, which still wakes
# the service; cron-job.org treats 404 as a completed request, not a failure).
#
# Prereqs (env vars):
#   CRONJOB_API_KEY  - cron-job.org API key (console.cron-job.org -> Settings -> API)
#   API_URL          - e.g. https://api.cuevapp.com
#
# Usage:
#   CRONJOB_API_KEY=... API_URL=https://api.cuevapp.com ./scripts/create_warmup_cronjob.sh
#
# (Prefer the dashboard? Create a job: GET <API_URL>/, schedule 02:59 PT on Tue & Thu.)
set -euo pipefail
: "${CRONJOB_API_KEY:?set CRONJOB_API_KEY}"
: "${API_URL:?set API_URL (e.g. https://api.cuevapp.com)}"

# wdays: 0=Sun .. 6=Sat -> 2=Tue, 4=Thu.  requestMethod 0 = GET.  -1 = "every".
curl -fsS -X PUT "https://api.cron-job.org/jobs" \
  -H "Authorization: Bearer ${CRONJOB_API_KEY}" \
  -H "Content-Type: application/json" \
  -d @- <<JSON
{
  "job": {
    "title": "Cueva warm-up (Tue/Thu 2:59am PT)",
    "url": "${API_URL%/}/",
    "enabled": true,
    "saveResponses": true,
    "requestMethod": 0,
    "schedule": {
      "timezone": "America/Los_Angeles",
      "expiresAt": 0,
      "hours": [2],
      "minutes": [59],
      "mdays": [-1],
      "months": [-1],
      "wdays": [2, 4]
    }
  }
}
JSON

echo
echo "Done — verify at https://console.cron-job.org/jobs"
echo "It wakes the service at 02:59 PT so the 03:00 refresh hits a warm instance."
