/** A dependency edge as the tracker reports it (blocker id + state). */
export interface RawDependency {
  id: string;
  ref: string;
  state: string;
  /**
   * The blocker's labels, when the adapter can supply them. Required for
   * label-driven pipelines (e.g. GitHub, where phases live in labels, not state)
   * so the blocker classifies to the right phase. Omit when state alone is exact
   * (Linear/Jira, where released/done/canceled are distinct states).
   */
  labels?: string[];
}

/**
 * The tracker-native issue shape every adapter produces. Provider-agnostic:
 * a state name + a flat label list + blocker edges. The normalizer turns this
 * into a `NormalizedTask` the engine understands.
 */
export interface RawIssue {
  id: string;
  ref: string;
  title: string;
  url?: string;
  description?: string;
  /** Tracker state name (e.g. "In Review"). */
  state: string;
  labels: string[];
  /** Blockers of this issue (this issue is blocked-by them). */
  blockedBy: RawDependency[];
  /** Deterministic ordering key (adapter derives, e.g. from the ref number). */
  order: number;
  /** Bounce count (adapter counts bounce-marker comments), default 0. */
  bounces?: number;
}

export interface TrackerIdentity {
  id: string;
  name?: string;
  email?: string;
  /** Adapter-specific workspace/team info for diagnostics. */
  context?: Record<string, unknown>;
}

/** A phase-write instruction: target state + label add/remove. Mirrors config ApplyRule. */
export interface ApplyInstruction {
  state?: string;
  addLabels?: string[];
  removeLabels?: string[];
}

export interface CreateProjectInput {
  name: string;
  summary?: string;
  description?: string;
}

export interface CreateIssueInput {
  projectId: string;
  title: string;
  description?: string;
  labels?: string[];
  parentId?: string;
  estimate?: number;
}
