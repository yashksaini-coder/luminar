#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Luminar P2P Simulator — start script
#
# Starts the FastAPI backend API server.
#
# Usage:
#   ./start.sh                    # default: 20 nodes, port 8000
#   ./start.sh --nodes 50         # custom node count
#   ./start.sh --prod             # no --reload (demo/production mode)
# ──────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_PID=""
SHUTTING_DOWN=false

# Defaults
NODE_COUNT="${LUMINAR_NODE_COUNT:-20}"
LOG_LEVEL="${LUMINAR_LOG_LEVEL:-INFO}"
PORT="${LUMINAR_PORT:-8000}"
PROD_MODE=false

# ── Parse args ──
while [[ $# -gt 0 ]]; do
  case "$1" in
    --nodes)      NODE_COUNT="$2"; shift 2 ;;
    --port)       PORT="$2";       shift 2 ;;
    --log)        LOG_LEVEL="$2";  shift 2 ;;
    --prod)       PROD_MODE=true;  shift 1 ;;
    --help|-h)
      cat <<'USAGE'
Usage: ./start.sh [OPTIONS]

Options:
  --nodes N       Number of simulated peers (default: 20, range: 2-100)
  --port PORT     Backend port (default: 8000)
  --log LEVEL     Log level: DEBUG, INFO, WARNING, ERROR (default: INFO)
  --prod          Disable hot-reload (suitable for demos)
  -h, --help      Show this help

Environment variables:
  LUMINAR_NODE_COUNT   Same as --nodes
  LUMINAR_LOG_LEVEL    Same as --log
  LUMINAR_PORT         Same as --port
USAGE
      exit 0
      ;;
    *) echo "Unknown option: $1 (try --help)"; exit 1 ;;
  esac
done

# ── Colours ──
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[0;33m'; DIM='\033[0;90m'; BOLD='\033[1m'; RESET='\033[0m'

log()  { echo -e "${DIM}[$(date +%H:%M:%S)]${RESET} $1"; }
info() { log "${GREEN}$1${RESET}"; }
warn() { log "${YELLOW}$1${RESET}"; }
err()  { log "${RED}$1${RESET}"; }

# ── Graceful shutdown ──
cleanup() {
  if $SHUTTING_DOWN; then return; fi
  SHUTTING_DOWN=true
  echo ""
  warn "Shutting down..."

  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill -TERM "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi

  info "Stopped."
}
trap cleanup EXIT INT TERM HUP

# ── Pre-flight checks ──
command -v uv &>/dev/null || { err "uv not found. Install: https://docs.astral.sh/uv/"; exit 1; }

# ── Install deps ──
if [[ ! -d "$ROOT/.venv" ]]; then
  info "Installing dependencies..."
  (cd "$ROOT" && uv sync)
fi

# ── Start Backend ──
info "Starting backend on port ${PORT} (${NODE_COUNT} nodes)..."
export LUMINAR_NODE_COUNT="$NODE_COUNT"
export LUMINAR_LOG_LEVEL="$LOG_LEVEL"

UVICORN_ARGS=(
  backend.main:app
  --host 0.0.0.0
  --port "$PORT"
  --log-level "$(echo "$LOG_LEVEL" | tr '[:upper:]' '[:lower:]')"
)
if ! $PROD_MODE; then
  UVICORN_ARGS+=(--reload)
fi

uv run uvicorn "${UVICORN_ARGS[@]}" &
SERVER_PID=$!

# ── Wait for Backend Ready ──
log "Waiting for backend to be ready..."
READY=false
for i in $(seq 1 40); do
  if curl -sf "http://localhost:${PORT}/api/sim/snapshot" >/dev/null 2>&1; then
    READY=true
    break
  fi
  sleep 0.5
done

if ! $READY; then
  err "Backend failed to start within 20 seconds."
  exit 1
fi

# ── Banner ──
echo ""
echo -e "  ${CYAN}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "  ${CYAN}║${RESET}  ${BOLD}${GREEN}Luminar P2P Simulator${RESET}                                 ${CYAN}║${RESET}"
echo -e "  ${CYAN}║${RESET}                                                      ${CYAN}║${RESET}"
echo -e "  ${CYAN}║${RESET}  API:       ${CYAN}http://localhost:${PORT}${RESET}                      ${CYAN}║${RESET}"
echo -e "  ${CYAN}║${RESET}  API docs:  ${CYAN}http://localhost:${PORT}/docs${RESET}                  ${CYAN}║${RESET}"
echo -e "  ${CYAN}║${RESET}  WebSocket: ${CYAN}ws://localhost:${PORT}/ws/events${RESET}               ${CYAN}║${RESET}"
echo -e "  ${CYAN}║${RESET}                                                      ${CYAN}║${RESET}"
echo -e "  ${CYAN}║${RESET}  Nodes: ${GREEN}${NODE_COUNT}${RESET}    Speed: ${GREEN}1.0x${RESET}    Log: ${GREEN}${LOG_LEVEL}${RESET}              ${CYAN}║${RESET}"
if $PROD_MODE; then
echo -e "  ${CYAN}║${RESET}  Mode:  ${YELLOW}production${RESET} (no hot-reload)                     ${CYAN}║${RESET}"
fi
echo -e "  ${CYAN}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""
info "Press Ctrl+C to stop."

# ── Watch backend process ──
wait "$SERVER_PID" 2>/dev/null
err "Backend exited unexpectedly."
exit 1
