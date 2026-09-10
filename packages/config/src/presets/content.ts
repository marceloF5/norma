import type { NormaConfig } from "../schema.js";

/**
 * The "content" pipeline — a second, non-dev pipeline that proves Norma is
 * pipeline-agnostic. The engine, orchestrator and adapters are UNCHANGED; only
 * this config differs from `software-dev` (different lanes, roles, states, labels).
 *
 * Flow: draft → edit → fact-check → publish, one-in-flight per writer lane.
 */
export const contentConfig: NormaConfig = {
  name: "content",
  description: "Brief → pieces (DAG + fact-check batches) → draft → edit → fact-check → published.",
  tracker: {
    kind: "linear",
    options: { team: "Content" },
  },
  runtime: { kind: "claude-code", options: {} },
  policy: {
    workerTypes: ["longform", "social"],
    concurrency: 1,
    escalateAtBounces: 2,
    satisfiedPhases: ["released", "done"],
    depDonePhases: ["released", "done", "canceled"],
  },
  roles: {
    worker: { longform: "writer", social: "social-writer" },
    review: "editor",
    qa: "fact-checker",
    escalate: "editor-in-chief",
  },
  phaseMapping: {
    classify: [
      { when: { state: "Backlog" }, phase: "backlog" },
      { when: { state: "To Do", label: "ready-to-write" }, phase: "ready" },
      { when: { state: "Drafting", label: "changes-requested" }, phase: "needs_rework" },
      { when: { state: "Drafting" }, phase: "in_progress" },
      { when: { state: "Editing", label: "needs-factcheck" }, phase: "needs_qa" },
      { when: { state: "Editing", label: "needs-edit" }, phase: "needs_review" },
      { when: { state: "Editing" }, phase: "needs_review" },
      { when: { state: "Ready to Publish" }, phase: "released" },
      { when: { state: "Published" }, phase: "done" },
      { when: { state: "Canceled" }, phase: "canceled" },
    ],
    apply: {
      ready: { state: "To Do", addLabels: ["ready-to-write"], removeLabels: [] },
      in_progress: { state: "Drafting", addLabels: [], removeLabels: ["ready-to-write"] },
      needs_review: {
        state: "Editing",
        addLabels: ["needs-edit"],
        removeLabels: ["changes-requested", "needs-factcheck"],
      },
      needs_qa: { state: "Editing", addLabels: ["needs-factcheck"], removeLabels: ["needs-edit"] },
      needs_rework: {
        state: "Drafting",
        addLabels: ["changes-requested"],
        removeLabels: ["needs-edit", "needs-factcheck"],
      },
      released: {
        state: "Ready to Publish",
        addLabels: ["approved"],
        removeLabels: ["needs-factcheck"],
      },
      done: { state: "Published", addLabels: [], removeLabels: [] },
    },
    owner: { fromLabelPrefix: "lane:" }, // lane:longform → "longform"
    batch: { fromLabelPrefix: "batch:" },
    bounceMarker: "🔁\\s*bounce",
  },
};

export default contentConfig;
