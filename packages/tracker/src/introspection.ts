import type { TrackerAdapter } from "./port.js";

export interface TrackerState {
  id: string;
  name: string;
  /** Semantic type when the tracker exposes it (e.g. Linear: backlog|unstarted|started|completed|canceled). */
  type?: string;
}

export interface TrackerLabel {
  id: string;
  name: string;
}

/**
 * Optional capability: read (and optionally create) the tracker's board — its
 * workflow states/columns and labels. `norma init` uses this to map the user's
 * real columns onto canonical phases and to create anything missing.
 */
export interface TrackerIntrospection {
  listStates(): Promise<TrackerState[]>;
  listLabels(): Promise<TrackerLabel[]>;
  /** Create a workflow state/column (adapters that can't will omit this). */
  createState?(input: { name: string; type?: string; color?: string }): Promise<TrackerState>;
  /** Create a label (adapters that can't will omit this). */
  createLabel?(input: { name: string; color?: string }): Promise<TrackerLabel>;
}

/** True when an adapter also implements board introspection. */
export function supportsIntrospection(
  adapter: TrackerAdapter,
): adapter is TrackerAdapter & TrackerIntrospection {
  const a = adapter as Partial<TrackerIntrospection>;
  return typeof a.listStates === "function" && typeof a.listLabels === "function";
}

/** True when an adapter can create states + labels (full board setup). */
export function canProvisionBoard(
  adapter: TrackerAdapter,
): adapter is TrackerAdapter & Required<Pick<TrackerIntrospection, "createState" | "createLabel">> {
  const a = adapter as Partial<TrackerIntrospection>;
  return typeof a.createState === "function" && typeof a.createLabel === "function";
}
