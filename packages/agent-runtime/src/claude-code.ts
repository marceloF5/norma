import { spawn } from "node:child_process";
import { type AgentSpec, readAgent } from "@norma/agents";
import type { AgentOutcome, AgentRequest, AgentRunner, Verdict } from "./port.js";

export interface ClaudeCodeRunnerOptions {
  /** Path to the claude CLI (default "claude"). */
  bin?: string;
  /** Model to pin (e.g. "claude-opus-4-8"). Overrides an agent's suggested model. */
  model?: string;
  /** Permission mode (default "bypassPermissions" — intended for the sandbox). */
  permissionMode?: string;
  /** Extra CLI args. */
  extraArgs?: string[];
  /** Per-invocation timeout in ms (default 30 min). */
  timeoutMs?: number;
  /**
   * Directory of `.md` agent definitions (`.norma/agents`). When set, the role's
   * file becomes the agent's system prompt and its `model` is used unless overridden.
   */
  agentsDir?: string;
}

const VERDICT_RE = /NORMA_VERDICT:\s*(ok|pass|fail|approve|bounce|error)/i;
const BOUNCE_RE = /NORMA_BOUNCE:\s*([A-Z][A-Z0-9]*-\d+)\s*:\s*(.+)/gi;

/**
 * Drives a role by shelling out to the Claude Code CLI headlessly (`claude -p`).
 * The agent is instructed to end its run with a machine-readable verdict line;
 * this runner parses it. Requires the `claude` CLI on PATH and valid auth
 * (subscription OAuth token or API key) in the environment.
 */
export class ClaudeCodeRunner implements AgentRunner {
  readonly kind = "claude-code";
  constructor(private readonly opts: ClaudeCodeRunnerOptions = {}) {}

  private async loadSpec(role: string): Promise<AgentSpec | null> {
    if (!this.opts.agentsDir) return null;
    return readAgent(this.opts.agentsDir, role);
  }

  private buildPrompt(req: AgentRequest, spec: AgentSpec | null): string {
    const persona = spec?.instructions ? spec.instructions : `You are the "${req.role}" agent.`;
    const verdictContract = [
      "",
      "── NORMA PROTOCOL ──────────────────────────────────────────────",
      "When done, output EXACTLY one line:",
      "  NORMA_VERDICT: <ok|pass|fail|approve|bounce|error>",
      "Semantics by stage:",
      "  dispatch/rework → ok (green: lint+build+tests pass) or error",
      "  review          → pass or fail",
      "  qa              → approve or bounce",
      "  escalate        → ok (re-scoped) or error",
      "For a QA bounce, also emit one line per failing task:",
      "  NORMA_BOUNCE: <TASK-REF>: <one-line defect>",
      "─────────────────────────────────────────────────────────────────",
    ].join("\n");
    return `${persona}\n\nStage: ${req.kind}.\n\n${req.context}\n${verdictContract}`;
  }

  private parse(stdout: string): AgentOutcome {
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

  async run(req: AgentRequest): Promise<AgentOutcome> {
    const spec = await this.loadSpec(req.role);
    const bin = this.opts.bin ?? "claude";
    const args = ["-p", this.buildPrompt(req, spec)];
    const model = this.opts.model ?? spec?.suggestedModel;
    if (model) args.push("--model", model);
    args.push("--permission-mode", this.opts.permissionMode ?? "bypassPermissions");
    if (this.opts.extraArgs) args.push(...this.opts.extraArgs);

    return new Promise<AgentOutcome>((resolve) => {
      const child = spawn(bin, args, {
        cwd: req.worktree ?? process.cwd(),
        env: process.env,
      });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => child.kill("SIGKILL"), this.opts.timeoutMs ?? 30 * 60 * 1000);
      child.stdout.on("data", (d) => {
        stdout += d.toString();
      });
      child.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({ verdict: "error", summary: `spawn failed: ${err.message}`, raw: stderr });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0 && !VERDICT_RE.test(stdout)) {
          resolve({
            verdict: "error",
            summary: `claude exited ${code}: ${stderr.slice(0, 300)}`,
            raw: stdout + stderr,
          });
          return;
        }
        resolve(this.parse(stdout));
      });
    });
  }
}
