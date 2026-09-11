import { type NormaConfig, toPlanContext } from "@norma/config";
import { type Intent, type Phase, computePlan } from "@norma/core";
import { type TrackerAdapter, normalize } from "@norma/tracker";

export interface DashboardTask {
  id: string;
  ref: string;
  title: string;
  phase: Phase;
  owner: string | null;
  batch: string | null;
}

export interface DashboardEdge {
  /** blocker ref → dependent ref */
  from: string;
  to: string;
}

export interface DashboardAction {
  kind: Intent["kind"];
  refs: string[];
}

export interface DashboardState {
  tasks: DashboardTask[];
  edges: DashboardEdge[];
  actions: DashboardAction[];
  /** Refs the engine is about to act on this cycle ("what's next"). */
  next: string[];
  inFlight: Record<string, string[]>;
  complete: boolean;
  counts: Record<string, number>;
}

const refsOf = (a: Intent): string[] => {
  switch (a.kind) {
    case "promote":
    case "dispatch":
    case "review":
    case "rework":
    case "escalate":
      return [a.task.ref];
    case "qa":
      return a.tasks.map((t) => t.ref);
    default:
      return [];
  }
};

/** Read the tracker and shape a snapshot for the dashboard: the task graph + what's next. */
export async function buildState(
  tracker: TrackerAdapter,
  config: NormaConfig,
  projectId: string,
): Promise<DashboardState> {
  const raw = await tracker.listIssues({ projectId });
  const tasks = normalize(raw, config.phaseMapping);
  const plan = computePlan(tasks, toPlanContext(config));

  const byRef = new Map(tasks.map((t) => [t.ref, t]));
  const edges: DashboardEdge[] = [];
  for (const t of tasks) {
    for (const b of t.blockedBy) {
      if (byRef.has(b.ref)) edges.push({ from: b.ref, to: t.ref });
    }
  }

  const actions: DashboardAction[] = plan.actions.map((a) => ({ kind: a.kind, refs: refsOf(a) }));
  const next = [...new Set(actions.flatMap((a) => a.refs))];
  const counts: Record<string, number> = {};
  for (const t of tasks) counts[t.phase] = (counts[t.phase] ?? 0) + 1;

  return {
    tasks: tasks.map((t) => ({
      id: t.id,
      ref: t.ref,
      title: t.title,
      phase: t.phase,
      owner: t.owner,
      batch: t.batch,
    })),
    edges,
    actions,
    next,
    inFlight: plan.inFlight,
    complete: plan.complete,
    counts,
  };
}
