import type { NormaConfig, PhaseMapping } from "@norma/config";
import type { TrackerState } from "@norma/tracker";

/**
 * The 8 board "slots" the pipeline needs mapped to real tracker states/columns.
 * needs_review / needs_qa / needs_rework are label-discriminated within
 * in_review / in_progress, so they don't need their own column.
 */
export interface BoardSlots {
  backlog: string;
  ready: string;
  in_progress: string;
  in_review: string;
  released: string;
  done: string;
  canceled: string;
}

export interface LabelConventions {
  readyForDev: string;
  needsReview: string;
  needsQa: string;
  changesRequested: string;
  qaApproved: string;
  ownerPrefix: string;
  batchPrefix: string;
  bounceMarker: string;
}

export const DEFAULT_LABELS: LabelConventions = {
  readyForDev: "ready-for-dev",
  needsReview: "needs-review",
  needsQa: "needs-qa",
  changesRequested: "changes-requested",
  qaApproved: "qa-approved",
  ownerPrefix: "agent:",
  batchPrefix: "qa-batch:",
  bounceMarker: "🔁\\s*bounce",
};

/** Preset column names used as defaults when a board has no obvious match. */
export const DEFAULT_SLOTS: BoardSlots = {
  backlog: "Backlog",
  ready: "Todo",
  in_progress: "In Progress",
  in_review: "In Review",
  released: "Ready for PR",
  done: "Done",
  canceled: "Canceled",
};

const includesAny = (name: string, needles: string[]) =>
  needles.some((n) => name.toLowerCase().includes(n));

/** Best-guess a board state for a slot from the tracker's real states. */
export function matchSlot(slot: keyof BoardSlots, states: TrackerState[]): string | undefined {
  const byType = (t: string) => states.find((s) => s.type === t)?.name;
  const byName = (needles: string[]) => states.find((s) => includesAny(s.name, needles))?.name;
  switch (slot) {
    case "backlog":
      return byType("backlog") ?? byName(["backlog"]);
    case "ready":
      return byName(["to do", "todo", "ready"]) ?? byType("unstarted");
    case "in_progress":
      return byName(["in progress", "doing"]) ?? byType("started");
    case "in_review":
      return byName(["review"]);
    case "released":
      return byName(["ready for pr", "ready for release", "staging", "merged"]);
    case "done":
      return byType("completed") ?? byName(["done", "closed", "complete"]);
    case "canceled":
      return byType("canceled") ?? byName(["cancel"]);
  }
}

/** Fill a full BoardSlots from real states, falling back to preset names. */
export function defaultSlots(states: TrackerState[]): BoardSlots {
  const out = { ...DEFAULT_SLOTS };
  for (const slot of Object.keys(out) as (keyof BoardSlots)[]) {
    out[slot] = matchSlot(slot, states) ?? DEFAULT_SLOTS[slot];
  }
  return out;
}

/** Assemble the declarative phaseMapping from chosen slots + label conventions. */
export function buildPhaseMapping(slots: BoardSlots, labels: LabelConventions): PhaseMapping {
  return {
    classify: [
      { when: { state: slots.backlog }, phase: "backlog" },
      { when: { state: slots.ready, label: labels.readyForDev }, phase: "ready" },
      { when: { state: slots.in_progress, label: labels.changesRequested }, phase: "needs_rework" },
      { when: { state: slots.in_progress }, phase: "in_progress" },
      { when: { state: slots.in_review, label: labels.needsQa }, phase: "needs_qa" },
      { when: { state: slots.in_review, label: labels.needsReview }, phase: "needs_review" },
      { when: { state: slots.in_review }, phase: "needs_review" },
      { when: { state: slots.released }, phase: "released" },
      { when: { state: slots.done }, phase: "done" },
      { when: { state: slots.canceled }, phase: "canceled" },
    ],
    apply: {
      ready: { state: slots.ready, addLabels: [labels.readyForDev], removeLabels: [] },
      in_progress: { state: slots.in_progress, addLabels: [], removeLabels: [labels.readyForDev] },
      needs_review: {
        state: slots.in_review,
        addLabels: [labels.needsReview],
        removeLabels: [labels.changesRequested, labels.needsQa],
      },
      needs_qa: {
        state: slots.in_review,
        addLabels: [labels.needsQa],
        removeLabels: [labels.needsReview],
      },
      needs_rework: {
        state: slots.in_progress,
        addLabels: [labels.changesRequested],
        removeLabels: [labels.needsReview, labels.needsQa],
      },
      released: {
        state: slots.released,
        addLabels: [labels.qaApproved],
        removeLabels: [labels.needsQa],
      },
      done: { state: slots.done, addLabels: [], removeLabels: [] },
    },
    owner: { fromLabelPrefix: labels.ownerPrefix },
    batch: { fromLabelPrefix: labels.batchPrefix },
    bounceMarker: labels.bounceMarker,
  };
}

export interface BuildConfigInput {
  name: string;
  tracker: NormaConfig["tracker"];
  runtime: NormaConfig["runtime"];
  workers: string[];
  concurrency: number;
  escalateAtBounces: number;
  roles: NormaConfig["roles"];
  slots: BoardSlots;
  labels: LabelConventions;
}

/** Assemble a full NormaConfig from the wizard's answers. */
export function buildConfig(input: BuildConfigInput): NormaConfig {
  return {
    name: input.name,
    tracker: input.tracker,
    runtime: input.runtime,
    policy: {
      workerTypes: input.workers,
      concurrency: input.concurrency,
      escalateAtBounces: input.escalateAtBounces,
      satisfiedPhases: ["released", "done"],
      depDonePhases: ["released", "done", "canceled"],
    },
    roles: input.roles,
    phaseMapping: buildPhaseMapping(input.slots, input.labels),
  };
}

/** Every distinct tracker state name the mapping references (for board provisioning). */
export function statesUsed(slots: BoardSlots): string[] {
  return [...new Set(Object.values(slots))];
}

/** Every label the mapping writes (for board provisioning). */
export function labelsUsed(labels: LabelConventions): string[] {
  return [
    labels.readyForDev,
    labels.needsReview,
    labels.needsQa,
    labels.changesRequested,
    labels.qaApproved,
  ];
}
