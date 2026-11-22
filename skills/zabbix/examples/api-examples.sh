#!/usr/bin/env bash
# Zabbix JSON-RPC API automation — token auth, NOC queries, acknowledgements, export
#
# Requires: curl, jq
# Set ZBX_URL and ZBX_TOKEN (frontend: User settings → API tokens, with expiry).
# Prefer a dedicated read-only user's token for dashboards/queries.

set -euo pipefail

ZBX_URL="${ZBX_URL:-https://zbx.example.com/api_jsonrpc.php}"
ZBX_TOKEN="${ZBX_TOKEN:?export ZBX_TOKEN=<api token>}"

rpc() {
  local method="$1" params="$2" id="${3:-1}"
  curl -sS "$ZBX_URL" \
    -H 'Content-Type: application/json-rpc' \
    -H "Authorization: Bearer ${ZBX_TOKEN}" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"${method}\",\"params\":${params},\"id\":${id}}" \
  | jq .
}

# 1) Sanity: server version (no auth needed)
rpc apiinfo.version '{}' 100

# 2) Open problems — currently firing, high+ severity, unacknowledged first
#    severity: 0..5 (Not classified..Disaster)
rpc problem.get '{
  "output": ["eventid", "objectid", "name", "severity", "acknowledged", "clock"],
  "severities": [3, 4, 5],
  "sortfield": "eventid",
  "sortorder": "DESC",
  "limit": 20
}' 101

# 3) Acknowledge an event with a message (action bitflags: 2 = acknowledge, 4 = add message)
EVENT_ID="${EVENT_ID:?export EVENT_ID=<eventid>}"
rpc event.acknowledge "{
  \"eventids\": [\"${EVENT_ID}\"],
  \"action\": 6,
  \"message\": \"Investigating - ticket NOC-1234\"
}" 102

# 4) Item lookup by host + key (the everyday query)
rpc item.get '{
  "output": ["itemid", "name", "key_", "lastvalue", "units", "state"],
  "filter": { "host": "web-01.example.com", "key_": "system.cpu.util" },
  "monitored": true
}' 103

# 5) Recent history for an item (history: 0 float, 1 str, 3 int, 4 text)
ITEM_ID="${ITEM_ID:?export ITEM_ID=<itemid>}"
rpc history.get "{
  \"output\": \"extend\",
  \"itemids\": [\"${ITEM_ID}\"],
  \"history\": 0,
  \"time_from\": $(date -d '1 hour ago' +%s),
  \"sortfield\": \"clock\",
  \"sortorder\": \"ASC\",
  \"limit\": 500
}" 104

# 6) Export a template as YAML (config-as-code / drift audit)
rpc configuration.export '{
  "options": { "templates": ["100100000010021"] },
  "format": "yaml"
}' 105

# 7) Fleet onboarding skeleton: create a host with group + template + agent interface
rpc host.create '{
  "host": "web-07.example.com",
  "groups": [{ "groupid": "2" }],
  "templates": [{ "templateid": "100100000010021" }],
  "interfaces": [{
    "type": 1, "main": 1, "useip": 1, "ip": "10.20.0.7", "dns": "", "port": "10050"
  }],
  "tags": [{ "tag": "env", "value": "prod" }, { "tag": "team", "value": "noc" }]
}' 106

# Notes:
# - All enum values are integers (status 0 = enabled, severity 0..5, type 1 = agent interface).
# - Avoid "output": "extend" on large objects — list the fields you need.
# - Log every mutating call (create/update/delete) with its JSON-RPC "id".
