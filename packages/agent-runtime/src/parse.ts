import type { AgentOutcome, Verdict } from "./port.js";

const VERDICT_RE = /NORMA_VERDICT:\s*(ok|pass|fail|approve|bounce|error|pending)/i;
const BOUNCE_RE = /NORMA_BOUNCE:\s*([A-Z][A-Z0-9]*-\d+)\s*:\s*(.+)/gi;

/** Parse the machine-readable verdict (and any QA bounces) from an agent's stdout. */
export function parseVerdict(stdout: string): AgentOutcome {
  const m = stdout.match(VERDICT_RE);
  const verdict = (m?.[1]?.toLowerCase() as Verdict) ?? "error";
  const bounced: { ref: string; defect: string }[] = [];
  for (const bm of stdout.matchAll(BOUNCE_RE)) {
    if (bm[1] && bm[2]) bounced.push({ ref: bm[1], defect: bm[2].trim() });
  }
  return {
    verdict,
    summary: m ? `verdict=${verdict}` : "no verdict token found in agent output",
    bounced: bounced.length ? bounced : undefined,
    raw: stdout,
  };
}

/** The protocol footer appended to every agent prompt. */
export function verdictContract(): string {
  return [
    "",
    "── NORMA PROTOCOL ──────────────────────────────────────────────",
    "When done, output EXACTLY one line:",
    "  NORMA_VERDICT: <ok|pass|fail|approve|bounce|error|pending>",
    "Semantics by stage:",
    "  plan            → ok (wrote the epic plan JSON as instructed) or error",
    "  dispatch/rework → ok (green: lint+build+tests pass) or error",
    "  review          → pass or fail",
    "  qa              → approve or bounce",
    "  escalate        → ok (re-scoped) or error",
    "For a QA bounce, also emit one line per failing task:",
    "  NORMA_BOUNCE: <TASK-REF>: <one-line defect>",
    "─────────────────────────────────────────────────────────────────",
  ].join("\n");
}
