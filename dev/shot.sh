#!/usr/bin/env bash
# Dev helper: serve the site, load a page headlessly, report title/console
# errors, and capture a screenshot — all in one shell invocation, because
# background processes do not survive between tool calls in this sandbox.
#
# Usage: dev/shot.sh <path> <label> [width] [height] [settle_seconds] [scrollY]
#   dev/shot.sh /index.html hero 1600 900 3 0
set -uo pipefail

PAGE="${1:-/index.html}"
LABEL="${2:-shot}"
WIDTH="${3:-1600}"
HEIGHT="${4:-900}"
SETTLE="${5:-3}"
SCROLL="${6:-0}"

PORT="${PORT:-8123}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTDIR="/projects/sandbox/.kiro/artifacts/screenshots"
SESSION="${SESSION:-ship}"

unset NODE_OPTIONS
mkdir -p "$OUTDIR"

# Clear any stale server on this port, then start a fresh one.
pkill -f "http.server ${PORT}" 2>/dev/null
sleep 0.3
cd "$ROOT" || exit 1
setsid nohup python3 -m http.server "$PORT" < /dev/null > /tmp/shot-serve.log 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null
  pkill -f "http.server ${PORT}" 2>/dev/null
}
trap cleanup EXIT

# Wait for the server to accept connections.
for _ in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PORT}${PAGE}" 2>/dev/null)
  [ "$code" = "200" ] && break
  sleep 0.25
done
if [ "$code" != "200" ]; then
  echo "SERVER_FAIL http ${code} for ${PAGE}"
  cat /tmp/shot-serve.log
  exit 1
fi
echo "server: HTTP ${code} ${PAGE}"

# Size the window first, then load. Setting the viewport on an already-loaded
# page does not re-run media queries or the scene's resize path, so the order
# matters and the page is opened again afterwards.
agent-browser --session "$SESSION" open "about:blank" > /dev/null 2>&1
agent-browser --session "$SESSION" set viewport "$WIDTH" "$HEIGHT" 2>&1 | tail -1
agent-browser --session "$SESSION" open "http://localhost:${PORT}${PAGE}" 2>&1 | tail -2

sleep "$SETTLE"

if [ "$SCROLL" != "0" ]; then
  agent-browser --session "$SESSION" eval "window.scrollTo(0, ${SCROLL}); 'scrolled'" > /dev/null 2>&1
  sleep 1
  # When the page halted its render loop for capture, advance it manually so the
  # camera eases into the newly scrolled stop before the screenshot.
  agent-browser --session "$SESSION" eval \
    "typeof window.__step === 'function' ? JSON.stringify(window.__step(90)) : 'no-step'" 2>&1 | tail -2
  sleep 0.5
fi

echo "--- title ---"
agent-browser --session "$SESSION" eval "document.title" 2>&1 | tail -2

echo "--- diagnostics ---"
agent-browser --session "$SESSION" eval \
  "JSON.stringify({err: (window.__errors||[]).slice(0,6), boot: window.__boot||null, scrollY: Math.round(window.scrollY), h: document.documentElement.scrollHeight, vh: window.innerHeight, perStop: Math.round((document.documentElement.scrollHeight - window.innerHeight) / ((window.__boot&&window.__boot.stops||13) - 1))})" \
  2>&1 | tail -3

echo "--- screenshot ---"
agent-browser --session "$SESSION" screenshot "${OUTDIR}/${LABEL}.png" 2>&1 | tail -2
