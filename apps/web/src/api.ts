export type Phase =
  | "backlog"
  | "ready"
  | "in_progress"
  | "needs_rework"
  | "needs_review"
  | "needs_qa"
  | "released"
  | "done"
  | "canceled";

export interface Task {
  id: string;
  ref: string;
  title: string;
  phase: Phase;
  owner: string | null;
  batch: string | null;
}
export interface Edge {
  from: string;
  to: string;
}
export interface Action {
  kind: string;
  refs: string[];
}
export interface DashboardState {
  project: string;
  tasks: Task[];
  edges: Edge[];
  actions: Action[];
  next: string[];
  inFlight: Record<string, string[]>;
  complete: boolean;
  counts: Record<string, number>;
}

export async function getState(): Promise<DashboardState> {
  const r = await fetch("/api/state");
  if (!r.ok) throw new Error(`state ${r.status}`);
  return r.json();
}

export async function step(): Promise<DashboardState> {
  const r = await fetch("/api/step", { method: "POST" });
  if (!r.ok) throw new Error(`step ${r.status}`);
  return r.json();
}
