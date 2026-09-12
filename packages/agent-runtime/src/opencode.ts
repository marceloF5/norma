import { CliAgentRunner } from "./cli-agent.js";
import type { AgentOutcome, AgentRequest, AgentRunner } from "./port.js";

export interface OpenCodeRunnerOptions {
  /** Path to the opencode CLI (default "opencode"). */
  bin?: string;
  /**
   * Model selector, provider-qualified (e.g. "openai/gpt-4o", "anthropic/claude-...",
   * "ollama/llama3"). Overrides an agent's suggested model. Norma only selects it;
   * OpenCode resolves the provider + credentials and makes the call.
   */
  model?: string;
  /** Extra CLI args. */
  extraArgs?: string[];
  /** Per-invocation timeout in ms. */
  timeoutMs?: number;
  /** Directory of `.md` agent definitions (`.norma/agents`). */
  agentsDir?: string;
}

/**
 * Drives a role via the OpenCode CLI headlessly (`opencode run`). OpenCode speaks
 * to many providers, so selecting "openai/…", "anthropic/…" or a local model is just
 * the model selector Norma forwards — Norma never accesses the model itself.
 */
export class OpenCodeRunner implements AgentRunner {
  readonly kind = "opencode";
  private inner: CliAgentRunner;

  constructor(opts: OpenCodeRunnerOptions = {}) {
    this.inner = new CliAgentRunner({
      kind: "opencode",
      bin: opts.bin ?? "opencode",
      model: opts.model,
      agentsDir: opts.agentsDir,
      timeoutMs: opts.timeoutMs,
      buildArgs: (prompt, model) => [
        "run",
        ...(model ? ["--model", model] : []),
        ...(opts.extraArgs ?? []),
        prompt,
      ],
    });
  }

  run(req: AgentRequest): Promise<AgentOutcome> {
    return this.inner.run(req);
  }
}
