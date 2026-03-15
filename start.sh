#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Lumina P2P Simulator — start script
#
# Starts the FastAPI backend AND the SvelteKit frontend (frontend-v2).
#
# Usage:
#   ./start.sh              # default: 20 nodes, port 8000
#   ./start.sh --nodes 50   # custom node count
# ──────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_PID=""
FRONTEND_PID=""
SHUTTING_DOWN=false

# Defaults
NODE_COUNT="${LUMINA_NODE_COUNT:-20}"
LOG_LEVEL="${LUMINA_LOG_LEVEL:-INFO}"
PORT="${LUMINA_PORT:-8000}"
FE_PORT=5173

# ── Parse args ──
while [[ $# -gt 0 ]]; do
  case "$1" in
    --nodes)  NODE_COUNT="$2"; shift 2 ;;
    --port)   PORT="$2";       shift 2 ;;
    --log)    LOG_LEVEL="$2";  shift 2 ;;
    --help|-h)
      echo "Usage: $0 [--nodes N] [--port PORT] [--log LEVEL]"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
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
  
  if [[ -n "$FRONTEND_PID" ]]; then
    kill -TERM "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [[ -n "$SERVER_PID" ]]; then
    kill -TERM -- -"$SERVER_PID" 2>/dev/null || kill -TERM "$SERVER_PID" 2>/dev/null || true
  fi
  
  # Clean up ports
  lsof -ti :"$PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true
  lsof -ti :"$FE_PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true
  info "Stopped."
}
trap cleanup EXIT INT TERM HUP

# ── Pre-flight ──
command -v uv &>/dev/null || { err "uv not found."; exit 1; }
command -v bun &>/dev/null || { err "bun not found."; exit 1; }

# ── Install deps ──
if [[ ! -d "$ROOT/.venv" ]]; then
  info "Installing backend deps..."
  (cd "$ROOT" && uv sync)
fi
if [[ ! -d "$ROOT/frontend-v2/node_modules" ]]; then
  info "Installing frontend-v2 deps..."
  (cd "$ROOT/frontend-v2" && bun install)
fi

# ── Start Backend ──
info "Starting Lumina Backend on port ${PORT}..."
export LUMINA_NODE_COUNT="$NODE_COUNT"
export LUMINA_LOG_LEVEL="$LOG_LEVEL"

setsid bash -c "cd '$ROOT' && exec uv run uvicorn backend.main:app \
  --host 0.0.0.0 \
  --port $PORT \
  --log-level $(echo "$LOG_LEVEL" | tr '[:upper:]' '[:lower:]') \
  --reload" &
SERVER_PID=$!

# ── Start Frontend ──
info "Starting SvelteKit Frontend-v2..."
(cd "$ROOT/frontend-v2" && exec bun run dev --port $FE_PORT) &
FRONTEND_PID=$!

# ── Wait for Backend Ready ──
log "Waiting for backend..."
for i in $(seq 1 40); do
  if curl -sf "http://localhost:${PORT}/api/sim/snapshot" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

# ── Banner ──
echo ""
echo -e "  ${CYAN}╔══════════════════════════════════════════════╗${RESET}"
echo -e "  ${CYAN}║${RESET}  ${BOLD}${GREEN}Lumina P2P Simulator — NOC v2${RESET}               ${CYAN}║${RESET}"
echo -e "  ${CYAN}║${RESET}                                              ${CYAN}║${RESET}"
echo -e "  ${CYAN}║${RESET}  Frontend: ${BOLD}${CYAN}http://localhost:${FE_PORT}${RESET}           ${CYAN}║${RESET}"
echo -e "  ${CYAN}║${RESET}  Backend:  ${DIM}http://localhost:${PORT}${RESET}              ${CYAN}║${RESET}"
echo -e "  ${CYAN}║${RESET}                                              ${CYAN}║${RESET}"
echo -e "  ${CYAN}║${RESET}  Nodes:    ${GREEN}${NODE_COUNT}${RESET}                               ${CYAN}║${RESET}"
echo -e "  ${CYAN}╚══════════════════════════════════════════════╝${RESET}"
echo ""

# ── Watch ──
while kill -0 "$SERVER_PID" 2>/dev/null; do sleep 2; done
err "Backend exited!"
exit 1
