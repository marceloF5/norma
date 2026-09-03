import type { AgentOutcome, AgentRequest, AgentRunner, Verdict } from "./port.js";

const GREEN: Record<AgentRequest["kind"], Verdict> = {
  dispatch: "ok",
  rework: "ok",
  review: "pass",
  qa: "approve",
  escalate: "ok",
};

export interface EchoRunnerOptions {
  /** Override the verdict per stage or per task ref for deterministic tests. */
  decide?: (req: AgentRequest) => AgentOutcome | Verdict | undefined;
}

/**
 * A deterministic, offline agent runtime. Runs no model — it returns scripted
 * verdicts (all-green by default). Lets the whole orchestrator loop run end-to-end
 * in tests and `--dry-run` without any API/CLI. Swap in ClaudeCodeRunner for real work.
 */
export class EchoRunner implements AgentRunner {
  readonly kind = "echo";
  constructor(private readonly opts: EchoRunnerOptions = {}) {}

  async run(req: AgentRequest): Promise<AgentOutcome> {
    const decided = this.opts.decide?.(req);
    if (decided && typeof decided === "object") return decided;
    const verdict = (decided as Verdict) ?? GREEN[req.kind];
    return {
      verdict,
      summary: `[echo] ${req.role} ${req.kind}${req.task ? ` ${req.task.ref}` : ""}${
        req.batch ? ` ${req.batch}` : ""
      } → ${verdict}`,
    };
  }
}
