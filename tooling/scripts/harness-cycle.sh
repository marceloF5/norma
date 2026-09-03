#!/usr/bin/env bash
# Headless host runner for one harness cycle — what a cron/launchd job fires.
# Runs `harness cycle <project>` with a single-flight lock and a timestamped log.
#
#   HARNESS_PROJECT=<id> ./tooling/scripts/harness-cycle.sh
#   DRY_RUN=1 HARNESS_PROJECT=<id> ./tooling/scripts/harness-cycle.sh   # no writes
#
# Env (or an operator env file at $HARNESS_ENV_FILE):
#   HARNESS_PROJECT   (required)  tracker project/epic id
#   HARNESS_CONFIG    (optional)  path to a config JSON (default: software-dev preset)
#   HARNESS_SLUG      (optional)  epic slug for durable context
#   LINEAR_API_KEY / JIRA_*       tracker credentials (per your config's tracker)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

ENV_FILE="${HARNESS_ENV_FILE:-$HOME/.config/harness/env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a; # shellcheck disable=SC1090
  source "$ENV_FILE"; set +a
fi
export PATH="$HOME/Library/pnpm:/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

: "${HARNESS_PROJECT:?set HARNESS_PROJECT to the tracker project/epic id}"

LOG_DIR="$ROOT/.harness/logs"; mkdir -p "$LOG_DIR"
STAMP="$(date +%Y-%m-%d_%H%M%S)"
LOG_FILE="$LOG_DIR/cycle_$STAMP.log"

LOCK_DIR="$ROOT/.harness/.cycle.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "[$STAMP] another cycle is already running — skipping." | tee -a "$LOG_FILE"; exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

cd "$ROOT"
[[ -f apps/cli/dist/index.js ]] || pnpm --filter @norma/cli build >>"$LOG_FILE" 2>&1

ARGS=(cycle "$HARNESS_PROJECT")
[[ -n "${HARNESS_CONFIG:-}" ]] && ARGS=(--config "$HARNESS_CONFIG" "${ARGS[@]}")
[[ -n "${HARNESS_SLUG:-}" ]] && ARGS+=(--slug "$HARNESS_SLUG")
[[ "${DRY_RUN:-0}" == "1" ]] && ARGS+=(--dry-run)

echo "[$STAMP] harness ${ARGS[*]} → $LOG_FILE"
node apps/cli/dist/index.js "${ARGS[@]}" >>"$LOG_FILE" 2>&1 || {
  echo "[$STAMP] cycle exited non-zero — see $LOG_FILE" | tee -a "$LOG_FILE"; exit 1
}
echo "[$STAMP] cycle finished OK → $LOG_FILE"
