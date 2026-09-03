# Harness CORE autonomous-run sandbox.
# The container IS the jail: only the mounted repo is visible, egress is firewalled
# to an allowlist, and auth is injected as env (never the host keychain). Safe to run
# the agent with --permission-mode bypassPermissions inside here.
FROM node:24-bookworm

ARG PNPM_VERSION=9.15.9

RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl ca-certificates gnupg jq iptables ipset dnsutils \
  && mkdir -p /etc/apt/keyrings \
  && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
       | dd of=/etc/apt/keyrings/githubcli-archive-keyring.gpg \
  && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
       > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update && apt-get install -y --no-install-recommends gh \
  && rm -rf /var/lib/apt/lists/*

# pnpm (via corepack) + Claude Code CLI (the default agent runtime).
RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate \
  && npm install -g @anthropic-ai/claude-code

COPY init-firewall.sh /usr/local/bin/init-firewall.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 0755 /usr/local/bin/init-firewall.sh /usr/local/bin/entrypoint.sh

WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
