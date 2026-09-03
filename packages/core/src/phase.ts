/**
 * Canonical lifecycle phases the engine reasons over — provider-agnostic.
 *
 * A tracker (Linear, Jira, a local file store) has its own states and labels.
 * An adapter's *normalizer* maps a raw issue `(state, labels)` onto exactly one
 * of these phases, and maps a phase transition back onto `(state, labels)` writes.
 * The engine NEVER sees a tracker state name — only these phases. That single
 * indirection is what makes the core open to any adapter.
 *
 * The default pipeline models an agent build loop:
 *   BACKLOG → READY → IN_PROGRESS → NEEDS_REVIEW → NEEDS_QA → RELEASED → DONE
 * with NEEDS_REWORK as the bounce-back lane and CANCELED as a side exit.
 */
export const Phase = {
  /** Exists; dependency blockers may still be open. */
  BACKLOG: "backlog",
  /** Frontier — all blockers satisfied, claimable by a worker now. */
  READY: "ready",
  /** Being implemented by its owning worker. */
  IN_PROGRESS: "in_progress",
  /** Bounced by review or QA; awaiting rework by the owning worker. */
  NEEDS_REWORK: "needs_rework",
  /** Implementation done; awaiting code review. */
  NEEDS_REVIEW: "needs_review",
  /** Review passed; awaiting QA (batched). */
  NEEDS_QA: "needs_qa",
  /** QA passed; released and accumulating (no PR/merge yet). */
  RELEASED: "released",
  /** Terminal — merged / shipped. */
  DONE: "done",
  /** Abandoned — no longer blocks anything. */
  CANCELED: "canceled",
} as const;

export type Phase = (typeof Phase)[keyof typeof Phase];

export const ALL_PHASES: readonly Phase[] = Object.values(Phase);

/** Phases where a task occupies a worker (dispatched but not yet released). */
export const IN_FLIGHT_PHASES: readonly Phase[] = [
  Phase.IN_PROGRESS,
  Phase.NEEDS_REWORK,
  Phase.NEEDS_REVIEW,
  Phase.NEEDS_QA,
];

/** Default set of phases that count a task as "released or terminal". */
export const DEFAULT_SATISFIED_PHASES: readonly Phase[] = [Phase.RELEASED, Phase.DONE];

/** Default set of phases where a blocker no longer blocks its dependents. */
export const DEFAULT_DEP_DONE_PHASES: readonly Phase[] = [
  Phase.RELEASED,
  Phase.DONE,
  Phase.CANCELED,
];

export function isPhase(value: unknown): value is Phase {
  return typeof value === "string" && (ALL_PHASES as string[]).includes(value);
}
