#!/usr/bin/env bash
# Runs a command with the repo's .env loaded. A variable already set in the shell wins over the file
# (so `OTEL_EXPORTER_OTLP_ENDPOINT=... make backend` still works), and a blank value in the file is skipped
# so the code's own default applies. Usage: scripts/with-env.sh <command> [args...]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f "$ROOT/.env" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    key="${line%%=*}"; val="${line#*=}"
    key="${key#export }"; key="${key//[[:space:]]/}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    [[ -n "${!key+x}" ]] && continue          # the shell wins
    val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
    [[ -z "$val" ]] && continue               # blank = use the code default
    export "$key=$val"
  done < "$ROOT/.env"
fi
exec "$@"
