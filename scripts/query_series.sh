#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4318}"
START="${START:-$(date -u -d '2 minutes ago' +%Y-%m-%dT%H:%M:%SZ)}"
END="${END:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
STEP="${STEP:-5000}"
GROUP_BY="${GROUP_BY:-from_node,to_node}"

curl -s "${BASE_URL}/api/series?metric=gossip_delay_ms&start=${START}&end=${END}&step=${STEP}&group_by=${GROUP_BY}&agg=avg"
echo
curl -s "${BASE_URL}/api/series?metric=gossip_message_total&start=${START}&end=${END}&step=${STEP}&group_by=${GROUP_BY}&agg=sum"
echo
