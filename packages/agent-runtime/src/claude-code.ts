import { CliAgentRunner } from "./cli-agent.js";
import type { AgentOutcome, AgentRequest, AgentRunner } from "./port.js";

export interface ClaudeCodeRunnerOptions {
  /** Path to the claude CLI (default "claude"). */
  bin?: string;
  /** Model selector to pin (e.g. "claude-opus-4-8"); overrides an agent's suggested model. */
  model?: string;
  /** Permission mode (default "bypassPermissions" — intended for the sandbox). */
  permissionMode?: string;
  /** Extra CLI args. */
  extraArgs?: string[];
  /** Per-invocation timeout in ms. */
  timeoutMs?: number;
  /** Directory of `.md` agent definitions (`.norma/agents`). */
  agentsDir?: string;
}

/**
 * Drives a role via the Claude Code CLI headlessly (`claude -p`). Norma only
 * selects the model (`--model`); Claude Code owns model access + auth.
 */
export class ClaudeCodeRunner implements AgentRunner {
  readonly kind = "claude-code";
  private inner: CliAgentRunner;

  constructor(opts: ClaudeCodeRunnerOptions = {}) {
    const permissionMode = opts.permissionMode ?? "bypassPermissions";
    this.inner = new CliAgentRunner({
      kind: "claude-code",
      bin: opts.bin ?? "claude",
      model: opts.model,
      agentsDir: opts.agentsDir,
      timeoutMs: opts.timeoutMs,
      buildArgs: (prompt, model) => [
        "-p",
        prompt,
        ...(model ? ["--model", model] : []),
        "--permission-mode",
        permissionMode,
        ...(opts.extraArgs ?? []),
      ],
    });
  }

  run(req: AgentRequest): Promise<AgentOutcome> {
    return this.inner.run(req);
  }
}
