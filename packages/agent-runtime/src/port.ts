import type { Intent, TaskRef } from "@norma/core";

/** The stages an agent runtime can be asked to perform. `plan` is the intake
 * (decompose a demand into an epic plan); the rest map to engine intents. */
export type AgentStageKind =
  | Extract<Intent["kind"], "dispatch" | "review" | "rework" | "qa" | "escalate">
  | "plan";

/** What the orchestrator asks an agent to do for one intent. */
export interface AgentRequest {
  /** Which stage this is (plan | dispatch | review | rework | qa | escalate). */
  kind: AgentStageKind;
  /** The agent role to run (e.g. "api-engineer", "code-reviewer"). */
  role: string;
  /** Single task (dispatch/review/rework/escalate). */
  task?: TaskRef;
  /** Batch members (qa). */
  tasks?: TaskRef[];
  /** Batch key (qa). */
  batch?: string;
  /** Bounce count so far (rework/escalate). */
  bounces?: number;
  /** Working directory the agent should operate in (the epic worktree). */
  worktree?: string;
  /** The engineered handoff context: brief + plan + task detail + prior feedback. */
  context: string;
}

/**
 * Normalized verdict the orchestrator interprets per stage:
 *  - dispatch/rework → "ok" (green) | "error"
 *  - review          → "pass" | "fail"
 *  - qa              → "approve" | "bounce" (with `bounced`)
 *  - escalate        → "ok" (re-scoped; principal relabels) | "error"
 */
export type Verdict = "ok" | "pass" | "fail" | "approve" | "bounce" | "error";

export interface AgentOutcome {
  verdict: Verdict;
  /** Human-readable summary of what the agent did/found. */
  summary: string;
  /** For a QA bounce: the specific tasks that failed and why. */
  bounced?: { ref: string; defect: string }[];
  /** Raw agent output, for logging. */
  raw?: string;
}

/**
 * The port every agent runtime implements. This is the seam that lets the same
 * orchestrator drive Claude Code today and another runtime (Agent SDK, a remote
 * queue, a human) tomorrow — the engine and orchestrator never change.
 */
export interface AgentRunner {
  readonly kind: string;
  run(req: AgentRequest): Promise<AgentOutcome>;
}
