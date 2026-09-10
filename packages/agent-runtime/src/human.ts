import { parseVerdict } from "./parse.js";
import type { AgentOutcome, AgentRequest, AgentRunner } from "./port.js";

export interface HumanRunnerOptions {
  /** Read an issue's comment bodies (oldest→newest). */
  readComments: (issueId: string) => Promise<string[]>;
  /** Post a comment to an issue. */
  postComment: (issueId: string, body: string) => Promise<void>;
  /** Prefix marking the request comment Norma posts (default "🧑 awaiting"). */
  requestPrefix?: string;
}

/**
 * A human-in-the-loop runtime for the natural human stages (review / QA). It posts
 * a request comment once, then returns "pending" until a human replies with a
 * `NORMA_VERDICT:` line — at which point it parses and returns that verdict. The
 * orchestrator leaves the task in place while pending, so a later cycle picks up
 * the human's decision. Dispatch/rework (code authoring) should stay on an
 * automated runtime; a human runner there would stall the lane.
 */
export class HumanRunner implements AgentRunner {
  readonly kind = "human";
  private readonly prefix: string;
  constructor(private readonly opts: HumanRunnerOptions) {
    this.prefix = opts.requestPrefix ?? "🧑 awaiting";
  }

  async run(req: AgentRequest): Promise<AgentOutcome> {
    const issueId = req.task?.id ?? req.tasks?.[0]?.id;
    if (!issueId) return { verdict: "pending", summary: "human runner: no task to await" };

    const comments = await this.opts.readComments(issueId);
    // A human reply carrying a verdict token resolves the stage.
    const withVerdict = comments.filter((c) => /NORMA_VERDICT:/i.test(c));
    if (withVerdict.length) {
      const last = withVerdict[withVerdict.length - 1] as string;
      return parseVerdict(last);
    }
    // Otherwise post the request once and wait.
    if (!comments.some((c) => c.startsWith(this.prefix))) {
      await this.opts.postComment(
        issueId,
        `${this.prefix} ${req.role} (${req.kind}) — reply with a line "NORMA_VERDICT: <pass|fail|approve|bounce>".`,
      );
    }
    return { verdict: "pending", summary: `awaiting human ${req.role} (${req.kind})` };
  }
}
