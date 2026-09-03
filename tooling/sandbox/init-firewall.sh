#!/usr/bin/env bash
# Default-deny egress firewall for the harness sandbox. Run as root at container boot.
# Allows ONLY the domains a cycle needs; everything else outbound is dropped, so a
# confused/compromised agent cannot exfiltrate. Extend ALLOW_DOMAINS via
# HARNESS_ALLOW_DOMAINS (space-separated) for your tracker (e.g. your-site.atlassian.net).
set -euo pipefail

ALLOW_DOMAINS=(
  api.anthropic.com          # Claude (REQUIRED)
  api.linear.app             # Linear adapter
  registry.npmjs.org         # pnpm installs
)
# Append tracker-specific hosts (e.g. Jira Cloud site) without editing this file.
if [[ -n "${HARNESS_ALLOW_DOMAINS:-}" ]]; then
  read -r -a EXTRA <<< "${HARNESS_ALLOW_DOMAINS}"
  ALLOW_DOMAINS+=("${EXTRA[@]}")
fi

echo "[firewall] resetting rules"
iptables -F; iptables -X 2>/dev/null || true
iptables -t nat -F 2>/dev/null || true
ipset destroy allowed 2>/dev/null || true
ipset create allowed hash:net

iptables -A INPUT  -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A INPUT  -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

add_domain() {
  local d="$1" ip
  for ip in $(dig +short "$d" A | grep -E '^[0-9]+\.'); do
    ipset add allowed "$ip" 2>/dev/null || true
  done
}
echo "[firewall] resolving allowlist"
for d in "${ALLOW_DOMAINS[@]}"; do add_domain "$d"; done

echo "[firewall] adding GitHub ranges"
gh_meta="$(curl -fsS https://api.github.com/meta || echo '{}')"
for key in git api web; do
  echo "$gh_meta" | jq -r ".${key}[]?" 2>/dev/null | while read -r cidr; do
    [ -n "$cidr" ] && ipset add allowed "$cidr" 2>/dev/null || true
  done
done

iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP
iptables -A OUTPUT -m set --match-set allowed dst -p tcp --dport 443 -j ACCEPT
iptables -A OUTPUT -m set --match-set allowed dst -p tcp --dport 22 -j ACCEPT

echo "[firewall] active — egress restricted to: ${ALLOW_DOMAINS[*]} + github.com ranges"
