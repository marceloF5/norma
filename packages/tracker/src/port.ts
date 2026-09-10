import type {
  ApplyInstruction,
  CreateIssueInput,
  CreateProjectInput,
  RawIssue,
  TrackerIdentity,
} from "./types.js";

/**
 * The port every tracker adapter implements. This is the ONLY seam between the
 * orchestrator and a concrete tracker (Linear, Jira, in-memory…). The engine
 * never touches it; the orchestrator uses it to read state and write back the
 * phase transitions the engine decided.
 *
 * Reads/writes are expressed in the tracker's own vocabulary (state names,
 * labels). The mapping to canonical phases lives in config, applied by the
 * normalizer — so adapters stay thin API clients.
 */
export interface TrackerAdapter {
  readonly kind: string;

  /** Verify credentials & return the acting identity. Throws if unauthenticated. */
  whoami(): Promise<TrackerIdentity>;

  /** All issues in a project (paginated internally). */
  listIssues(query: { projectId: string }): Promise<RawIssue[]>;

  /** Apply a phase-write (state change + label add/remove) to one issue. */
  transition(issueId: string, apply: ApplyInstruction): Promise<void>;

  /** Apply the same phase-write to many issues (e.g. epic-complete → Done). */
  bulkTransition(issueIds: string[], apply: ApplyInstruction): Promise<void>;

  /** Post a comment (used for bounce markers, escalation notes, PR links). */
  comment(issueId: string, body: string): Promise<void>;

  /** Read an issue's comment bodies, oldest→newest. Optional; used to feed the
   * last reviewer/QA feedback into a rework/escalate handoff. */
  listComments?(issueId: string): Promise<string[]>;

  // --- intake / planning (used by /epic; optional for read-only trackers) ---
  createProject(input: CreateProjectInput): Promise<{ id: string; url?: string }>;
  createIssue(input: CreateIssueInput): Promise<{ id: string; ref: string; url?: string }>;
  /** Record "issue is blocked-by blocker" (a DAG edge). */
  addDependency(input: { issueId: string; blockedById: string }): Promise<void>;
}
