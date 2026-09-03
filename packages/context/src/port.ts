/**
 * The handoff / context-engineering layer. Durable artifacts re-read every run
 * with token discipline: the epic brief, the PLAN (tasks + DAG + qa-batches +
 * QA plans), and the final report. State lives in the tracker; *narrative*
 * context lives here. This is how one agent hands off to the next.
 */
export interface ContextStore {
  readonly kind: string;

  /** The succinct, re-read-every-run epic brief (goal / in-scope / out-of-scope). */
  readBrief(slug: string): Promise<string | null>;
  writeBrief(slug: string, content: string): Promise<void>;

  /** The human source-of-truth plan (tasks, DAG, qa-batches, QA plans). */
  readPlan(slug: string): Promise<string | null>;
  writePlan(slug: string, content: string): Promise<void>;

  /** The final delivery report (becomes the PR body). */
  readReport(slug: string): Promise<string | null>;
  writeReport(slug: string, content: string): Promise<void>;

  /** Append a raw artifact (e.g. an agent transcript) for the audit trail. */
  appendLog(slug: string, name: string, content: string): Promise<void>;
}
