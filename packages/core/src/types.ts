import type { Phase } from "./phase.js";

/** A dependency edge, carrying the blocker's current phase (all the engine needs). */
export interface Dependency {
  /** Human ref of the blocker (e.g. "RED-34"), for diagnostics. */
  ref: string;
  /** Current phase of the blocker. */
  phase: Phase;
}

/**
 * A task as the engine sees it — already normalized by an adapter from a raw
 * tracker issue. Contains ONLY what the engine reasons over; no tracker state
 * names, no labels, no command strings.
 */
export interface NormalizedTask {
  /** Stable opaque id (tracker's internal id). */
  id: string;
  /** Human identifier (e.g. "RED-34" / "PROJ-12"). */
  ref: string;
  title: string;
  url?: string;
  /** Canonical lifecycle phase. */
  phase: Phase;
  /** Owning worker type (e.g. "api" | "web"), or null if unrouted. */
  owner: string | null;
  /** QA batch key this task belongs to, or null. */
  batch: string | null;
  /** How many times this task has been bounced (from context/comments). */
  bounces: number;
  /** Blockers (from the DAG). Empty if none. */
  blockedBy: Dependency[];
  /** Deterministic ordering key for dispatch (lower = picked first). */
  order: number;
}

/** Tunable, JSON-expressible knobs for the engine. No functions, no I/O. */
export interface PlanPolicy {
  /** Worker types that can be dispatched (e.g. ["api", "web"]). */
  workerTypes: string[];
  /** Max in-flight tasks per worker type. Default 1 (the one-in-flight gate). */
  concurrency?: number;
  /** Bounce count at/above which a task escalates instead of reworking. Default 2. */
  escalateAtBounces?: number;
  /** Phases that count a task as released/terminal (batch settle + completion). */
  satisfiedPhases?: Phase[];
  /** Phases where a blocker stops blocking its dependents (frontier promotion). */
  depDonePhases?: Phase[];
}

/** A phase change the orchestrator/adapter must apply to the tracker. */
export interface PhaseTransition {
  toPhase: Phase;
}

/** Discriminated union of the ordered actions the engine emits. */
export type Intent =
  | PromoteIntent
  | DispatchIntent
  | ReviewIntent
  | ReworkIntent
  | EscalateIntent
  | QaIntent
  | CompleteIntent;

export interface TaskRef {
  id: string;
  ref: string;
  title: string;
  owner: string | null;
  url?: string;
}

export interface PromoteIntent {
  kind: "promote";
  task: TaskRef;
  /** Backlog → frontier. */
  to: PhaseTransition;
}

export interface DispatchIntent {
  kind: "dispatch";
  /** Worker type claiming the task. */
  worker: string;
  /** Role/agent that performs the work (resolved from config). */
  role: string;
  task: TaskRef;
  /** Applied before the agent runs. */
  onStart: PhaseTransition;
  /** Applied after the agent finishes green. */
  onDone: PhaseTransition;
}

export interface ReviewIntent {
  kind: "review";
  role: string;
  task: TaskRef;
  onPass: PhaseTransition;
  onFail: PhaseTransition;
}

export interface ReworkIntent {
  kind: "rework";
  role: string;
  task: TaskRef;
  bounces: number;
  onDone: PhaseTransition;
}

export interface EscalateIntent {
  kind: "escalate";
  role: string;
  task: TaskRef;
  bounces: number;
}

export interface QaIntent {
  kind: "qa";
  role: string;
  batch: string;
  tasks: TaskRef[];
  /** Applied to each member on APPROVE. */
  onApprove: PhaseTransition;
  /** Applied to a named member on BOUNCE. */
  onBounce: PhaseTransition;
}

export interface CompleteIntent {
  kind: "complete";
}

export interface PhaseCounts {
  total: number;
  byPhase: Record<Phase, number>;
}

/** The complete, deterministic output of the engine for one snapshot. */
export interface Plan {
  counts: PhaseCounts;
  /** In-flight task refs per worker type. */
  inFlight: Record<string, string[]>;
  /** True when every task is released/terminal (but not all DONE yet). */
  complete: boolean;
  /** Non-fatal problems the operator should surface (e.g. unrouted task). */
  anomalies: string[];
  actionCount: number;
  actions: Intent[];
}
