import { spawn } from "node:child_process";
import { parseVerdict } from "./parse.js";
import type { AgentOutcome, AgentRequest, AgentRunner } from "./port.js";

export interface CommandRunnerOptions {
  /** The executable to run for every stage (e.g. "./agents/run.sh" or "python"). */
  command: string;
  /** Fixed args prepended before the per-run args. */
  args?: string[];
  /** Per-invocation timeout in ms (default 30 min). */
  timeoutMs?: number;
  /** Extra environment for the child. */
  env?: Record<string, string>;
}

/**
 * The universal escape hatch: drive ANY execution model by running a user command.
 * The full AgentRequest is written to the child's stdin as JSON and mirrored into
 * env (NORMA_STAGE, NORMA_ROLE, NORMA_TASK_REF, NORMA_WORKTREE); the child prints
 * a `NORMA_VERDICT:` line (and `NORMA_BOUNCE:` lines for QA) to stdout.
 *
 * This is how Norma stays model-agnostic without a bespoke runner per provider:
 * point `command` at a script wrapping OpenAI, a local model, a bash pipeline, etc.
 */
export class CommandRunner implements AgentRunner {
  readonly kind = "command";
  constructor(private readonly opts: CommandRunnerOptions) {}

  run(req: AgentRequest): Promise<AgentOutcome> {
    const args = [...(this.opts.args ?? [])];
    return new Promise<AgentOutcome>((resolve) => {
      const child = spawn(this.opts.command, args, {
        cwd: req.worktree ?? process.cwd(),
        env: {
          ...process.env,
          ...this.opts.env,
          NORMA_STAGE: req.kind,
          NORMA_ROLE: req.role,
          NORMA_TASK_REF: req.task?.ref ?? "",
          NORMA_BATCH: req.batch ?? "",
          NORMA_WORKTREE: req.worktree ?? "",
        },
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
        const parsed = parseVerdict(stdout);
        if (code !== 0 && parsed.summary.startsWith("no verdict token")) {
          resolve({
            verdict: "error",
            summary: `command exited ${code}: ${stderr.slice(0, 300)}`,
            raw: stdout + stderr,
          });
          return;
        }
        resolve(parsed);
      });
      child.stdin.on("error", () => {});
      child.stdin.write(JSON.stringify(req));
      child.stdin.end();
    });
  }
}
