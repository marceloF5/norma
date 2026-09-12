import { spawn } from "node:child_process";
import { type AgentSpec, readAgent } from "@norma/agents";
import { parseVerdict, verdictContract } from "./parse.js";
import type { AgentOutcome, AgentRequest, AgentRunner } from "./port.js";

export interface CliAgentConfig {
  /** Runtime id (e.g. "claude-code", "opencode"). */
  kind: string;
  /** The executable to spawn. */
  bin: string;
  /**
   * Build the argv from the composed prompt and the SELECTED model. Norma never
   * touches the model API — it only forwards the selector; the CLI owns access + auth.
   */
  buildArgs: (prompt: string, model: string | undefined) => string[];
  /** Global model selector; overrides an agent's suggested model when set. */
  model?: string;
  /** Directory of `.md` agent definitions — the role's file becomes the persona. */
  agentsDir?: string;
  /** Extra env for the child. */
  env?: Record<string, string>;
  /** Per-invocation timeout in ms (default 30 min). */
  timeoutMs?: number;
}

/**
 * Generic runner for headless CLI coding agents (Claude Code, OpenCode, aider, …).
 * They all share the same shape: compose a prompt, spawn the CLI with a selected
 * model, parse the verdict. Adding a new agent CLI is a config, not new code.
 */
export class CliAgentRunner implements AgentRunner {
  readonly kind: string;
  constructor(private readonly cfg: CliAgentConfig) {
    this.kind = cfg.kind;
  }

  private async loadSpec(role: string): Promise<AgentSpec | null> {
    if (!this.cfg.agentsDir) return null;
    return readAgent(this.cfg.agentsDir, role);
  }

  private buildPrompt(req: AgentRequest, spec: AgentSpec | null): string {
    const persona = spec?.instructions ? spec.instructions : `You are the "${req.role}" agent.`;
    return `${persona}\n\nStage: ${req.kind}.\n\n${req.context}\n${verdictContract()}`;
  }

  async run(req: AgentRequest): Promise<AgentOutcome> {
    const spec = await this.loadSpec(req.role);
    const model = this.cfg.model ?? spec?.suggestedModel; // the model SELECTOR
    const args = this.cfg.buildArgs(this.buildPrompt(req, spec), model);

    return new Promise<AgentOutcome>((resolve) => {
      const child = spawn(this.cfg.bin, args, {
        cwd: req.worktree ?? process.cwd(),
        env: { ...process.env, ...this.cfg.env },
      });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => child.kill("SIGKILL"), this.cfg.timeoutMs ?? 30 * 60 * 1000);
      child.stdout.on("data", (d) => {
        stdout += d.toString();
      });
      child.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          verdict: "error",
          summary: `${this.cfg.kind} spawn failed: ${err.message}`,
          raw: stderr,
        });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        const parsed = parseVerdict(stdout);
        if (code !== 0 && parsed.summary.startsWith("no verdict token")) {
          resolve({
            verdict: "error",
            summary: `${this.cfg.kind} exited ${code}: ${stderr.slice(0, 300)}`,
            raw: stdout + stderr,
          });
          return;
        }
        resolve(parsed);
      });
    });
  }
}
