#!/usr/bin/env bash
# Install / remove a daily launchd job that runs one harness cycle (macOS only).
#
#   HARNESS_PROJECT=<id> ./tooling/scripts/install-cron.sh install
#   ./tooling/scripts/install-cron.sh uninstall
#   ./tooling/scripts/install-cron.sh status
#
# Override the time with HARNESS_HOUR / HARNESS_MINUTE (default 18:00).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LABEL="co.harness.cycle"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
RUNNER="$SCRIPT_DIR/harness-cycle.sh"
HOUR="${HARNESS_HOUR:-18}"; MINUTE="${HARNESS_MINUTE:-0}"
DOMAIN="gui/$(id -u)"
cmd="${1:-status}"

write_plist() {
  mkdir -p "$HOME/Library/LaunchAgents"
  cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$RUNNER</string></array>
  <key>EnvironmentVariables</key>
  <dict><key>HARNESS_PROJECT</key><string>${HARNESS_PROJECT:-}</string></dict>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>$HOUR</integer><key>Minute</key><integer>$MINUTE</integer></dict>
  <key>RunAtLoad</key><false/>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>StandardOutPath</key><string>$ROOT/.harness/logs/launchd.out.log</string>
  <key>StandardErrorPath</key><string>$ROOT/.harness/logs/launchd.err.log</string>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
PLIST
  echo "wrote $PLIST"
}

case "$cmd" in
  install)
    : "${HARNESS_PROJECT:?set HARNESS_PROJECT before installing}"
    chmod +x "$RUNNER"; mkdir -p "$ROOT/.harness/logs"; write_plist
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    launchctl bootstrap "$DOMAIN" "$PLIST"
    launchctl enable "$DOMAIN/$LABEL"
    echo "installed — cycle runs daily at $(printf '%02d:%02d' "$HOUR" "$MINUTE"). Test: launchctl kickstart -k $DOMAIN/$LABEL" ;;
  uninstall)
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true; rm -f "$PLIST"; echo "uninstalled $LABEL" ;;
  status)
    launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1 && echo "loaded: $LABEL" || echo "not loaded: $LABEL" ;;
  *) echo "usage: $0 {install|uninstall|status}"; exit 2 ;;
esac
