import {
  ALL_PHASES,
  DEFAULT_DEP_DONE_PHASES,
  DEFAULT_SATISFIED_PHASES,
  IN_FLIGHT_PHASES,
  Phase,
} from "./phase.js";
import type { Intent, NormalizedTask, PhaseCounts, Plan, PlanPolicy, TaskRef } from "./types.js";

/**
 * Role naming — which agent handles each stage. Kept out of the engine's logic
 * (the engine only decides *what* happens); this decides *who* is named in the
 * emitted intent. Fully config-driven, JSON-expressible.
 */
export interface RoleMap {
  /** Owner-type → agent role for dispatch & rework (e.g. { api: "api-engineer" }). */
  worker: Record<string, string>;
  /** Role that reviews. */
  review: string;
  /** Role that runs QA. */
  qa: string;
  /** Role that re-scopes escalated tasks. */
  escalate: string;
}

export interface PlanContext {
  policy: PlanPolicy;
  roles: RoleMap;
}

const toRef = (t: NormalizedTask): TaskRef => ({
  id: t.id,
  ref: t.ref,
  title: t.title,
  owner: t.owner,
  url: t.url,
});

/**
 * The deterministic graph + loop engine. PURE — no network, no clock, no I/O.
 * Same (tasks, context) ⇒ byte-identical Plan. This is the single authority on
 * the DAG frontier, the one-in-flight gate, batch readiness, and completion.
 * The LLM operator only *executes* the intents it returns.
 */
export function computePlan(tasks: NormalizedTask[], ctx: PlanContext): Plan {
  const concurrency = ctx.policy.concurrency ?? 1;
  const escalateAt = ctx.policy.escalateAtBounces ?? 2;
  const satisfied = new Set<Phase>(ctx.policy.satisfiedPhases ?? DEFAULT_SATISFIED_PHASES);
  const depDone = new Set<Phase>(ctx.policy.depDonePhases ?? DEFAULT_DEP_DONE_PHASES);
  const workerTypes = ctx.policy.workerTypes;
  const inFlightSet = new Set<Phase>(IN_FLIGHT_PHASES);

  const anomalies: string[] = [];

  // --- counts -------------------------------------------------------------
  const byPhase = Object.fromEntries(ALL_PHASES.map((p) => [p, 0])) as Record<Phase, number>;
  for (const t of tasks) byPhase[t.phase]++;
  const counts: PhaseCounts = { total: tasks.length, byPhase };

  // --- in-flight per worker (the concurrency gate) ------------------------
  const inFlight: Record<string, string[]> = Object.fromEntries(workerTypes.map((w) => [w, []]));
  for (const t of tasks) {
    if (inFlightSet.has(t.phase) && t.owner) {
      const bucket = inFlight[t.owner] ?? [];
      bucket.push(t.ref);
      inFlight[t.owner] = bucket;
    }
    if (!t.owner && t.phase !== Phase.CANCELED) {
      anomalies.push(`${t.ref} has no owner (worker type) assigned`);
    }
  }
  for (const w of workerTypes) {
    const n = inFlight[w]?.length ?? 0;
    if (n > concurrency)
      anomalies.push(
        `worker ${w} has ${n} in-flight (limit ${concurrency}): ${inFlight[w]?.join(", ")}`,
      );
  }

  const actions: Intent[] = [];

  // 1) QA — batches whose members are ALL settled, with ≥1 pending QA. --------
  const batches = new Map<string, NormalizedTask[]>();
  for (const t of tasks) {
    if (t.batch) {
      const arr = batches.get(t.batch) ?? [];
      arr.push(t);
      batches.set(t.batch, arr);
    }
  }
  // A member stops holding the batch back once it's satisfied, canceled, or itself pending QA.
  const settled = (m: NormalizedTask) =>
    satisfied.has(m.phase) || m.phase === Phase.CANCELED || m.phase === Phase.NEEDS_QA;
  for (const [batch, members] of batches) {
    const pending = members.filter((m) => m.phase === Phase.NEEDS_QA);
    const notReady = members.filter((m) => !settled(m));
    if (pending.length > 0 && notReady.length === 0) {
      actions.push({
        kind: "qa",
        role: ctx.roles.qa,
        batch,
        tasks: pending.map(toRef),
        onApprove: { toPhase: Phase.RELEASED },
        onBounce: { toPhase: Phase.NEEDS_REWORK },
      });
    }
  }

  // 2) Review — every task awaiting review (independent of worker availability).
  for (const t of tasks) {
    if (t.phase === Phase.NEEDS_REVIEW) {
      actions.push({
        kind: "review",
        role: ctx.roles.review,
        task: toRef(t),
        onPass: { toPhase: Phase.NEEDS_QA },
        onFail: { toPhase: Phase.NEEDS_REWORK },
      });
    }
  }

  // 3) Rework / escalate — bounced tasks (escalate at the threshold). --------
  for (const t of tasks) {
    if (t.phase === Phase.NEEDS_REWORK) {
      if (t.bounces >= escalateAt) {
        actions.push({
          kind: "escalate",
          role: ctx.roles.escalate,
          task: toRef(t),
          bounces: t.bounces,
        });
      } else {
        const role = (t.owner && ctx.roles.worker[t.owner]) || ctx.roles.escalate;
        actions.push({
          kind: "rework",
          role,
          task: toRef(t),
          bounces: t.bounces,
          onDone: { toPhase: Phase.NEEDS_REVIEW },
        });
      }
    }
  }

  // 4) Promote — backlog tasks whose blockers are all done → frontier. -------
  for (const t of tasks) {
    if (t.phase === Phase.BACKLOG) {
      const unmet = t.blockedBy.filter((b) => !depDone.has(b.phase));
      if (unmet.length === 0) {
        actions.push({ kind: "promote", task: toRef(t), to: { toPhase: Phase.READY } });
      }
    }
  }

  // 5) Dispatch — each worker under its concurrency limit claims the lowest-order READY task of its type.
  const readyByOwner: Record<string, NormalizedTask[]> = Object.fromEntries(
    workerTypes.map((w) => [w, []]),
  );
  for (const t of tasks) {
    if (t.phase === Phase.READY && t.owner) {
      const queue = readyByOwner[t.owner];
      if (queue) queue.push(t);
    }
  }
  for (const w of workerTypes) {
    let slots = concurrency - (inFlight[w]?.length ?? 0);
    if (slots <= 0) continue;
    const queue = (readyByOwner[w] ?? []).slice().sort((a, b) => a.order - b.order);
    for (const pick of queue) {
      if (slots <= 0) break;
      actions.push({
        kind: "dispatch",
        worker: w,
        role: ctx.roles.worker[w] ?? ctx.roles.escalate,
        task: toRef(pick),
        onStart: { toPhase: Phase.IN_PROGRESS },
        onDone: { toPhase: Phase.NEEDS_REVIEW },
      });
      slots--;
    }
  }

  // 6) Completion — every task released/terminal, but not all DONE yet. ------
  const complete =
    counts.total > 0 && tasks.every((t) => satisfied.has(t.phase) || t.phase === Phase.CANCELED);
  if (complete && byPhase[Phase.DONE] < counts.total) {
    actions.push({ kind: "complete" });
  }

  return { counts, inFlight, complete, anomalies, actionCount: actions.length, actions };
}
