#!/usr/bin/env bash
# Container entrypoint: raise the firewall, wire identity, install + build the harness,
# then run ONE cycle for the target project. bypassPermissions is safe here because the
# container is the jail (only /workspace mounted, egress allowlisted, no host keychain).
set -euo pipefail

/usr/local/bin/init-firewall.sh

: "${CLAUDE_CODE_OAUTH_TOKEN:?missing — run 'claude setup-token' on the host and inject it}"
: "${NORMA_PROJECT:?missing — the tracker project/epic id to advance}"

git config --global --add safe.directory /workspace
git config --global --add safe.directory '/workspace/*'
if [[ -n "${GH_TOKEN:-}" ]]; then
  git config --global url."https://x-access-token:${GH_TOKEN}@github.com/".insteadOf "git@github.com:"
fi

echo "[entrypoint] installing workspace"
pnpm install --frozen-lockfile
pnpm --filter @norma/cli build

CONFIG_ARG=()
[[ -n "${NORMA_CONFIG:-}" ]] && CONFIG_ARG=(--config "${NORMA_CONFIG}")

echo "[entrypoint] running: harness cycle ${NORMA_PROJECT}"
exec node apps/cli/dist/index.js "${CONFIG_ARG[@]}" cycle "${NORMA_PROJECT}" \
  ${NORMA_SLUG:+--slug "${NORMA_SLUG}"} \
  ${NORMA_WORKTREE:+--worktree "${NORMA_WORKTREE}"}
