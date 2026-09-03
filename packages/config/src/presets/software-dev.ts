import type { HarnessConfig } from "../schema.js";

/**
 * The "software-dev" pipeline — a faithful, provider-agnostic port of the
 * original Redisco autonomous dev harness, expressed entirely as config.
 *
 * Nothing here is hardcoded in the engine: swap the states/labels for another
 * tracker's vocabulary, or the roles for another team, without touching core.
 */
export const softwareDevConfig: HarnessConfig = {
  name: "software-dev",
  description:
    "Epic → tasks (DAG + qa-batches) → dev → code-review → QA → released, one-in-flight per engineer.",
  tracker: {
    kind: "linear",
    options: { team: "Redisco" },
  },
  runtime: { kind: "claude-code", options: {} },
  policy: {
    workerTypes: ["api", "web"],
    concurrency: 1, // the one-in-flight gate
    escalateAtBounces: 2,
    satisfiedPhases: ["released", "done"],
    depDonePhases: ["released", "done", "canceled"],
  },
  roles: {
    worker: { api: "api-engineer", web: "web-engineer" },
    review: "code-reviewer",
    qa: "qa-engineer",
    escalate: "principal-engineer",
  },
  phaseMapping: {
    // (state, label) → canonical phase. First match wins; order matters.
    classify: [
      { when: { state: "Backlog" }, phase: "backlog" },
      { when: { state: "Todo", label: "ready-for-dev" }, phase: "ready" },
      { when: { state: "In Progress", label: "changes-requested" }, phase: "needs_rework" },
      { when: { state: "In Progress" }, phase: "in_progress" },
      { when: { state: "In Review", label: "needs-qa" }, phase: "needs_qa" },
      { when: { state: "In Review", label: "needs-review" }, phase: "needs_review" },
      { when: { state: "In Review" }, phase: "needs_review" },
      { when: { state: "Ready for PR" }, phase: "released" },
      { when: { state: "Done" }, phase: "done" },
      { when: { state: "Canceled" }, phase: "canceled" },
    ],
    // phase → tracker write (state + label add/remove).
    apply: {
      ready: { state: "Todo", addLabels: ["ready-for-dev"], removeLabels: [] },
      in_progress: { state: "In Progress", addLabels: [], removeLabels: ["ready-for-dev"] },
      needs_review: {
        state: "In Review",
        addLabels: ["needs-review"],
        removeLabels: ["changes-requested", "needs-qa"],
      },
      needs_qa: { state: "In Review", addLabels: ["needs-qa"], removeLabels: ["needs-review"] },
      needs_rework: {
        state: "In Progress",
        addLabels: ["changes-requested"],
        removeLabels: ["needs-review", "needs-qa"],
      },
      released: { state: "Ready for PR", addLabels: ["qa-approved"], removeLabels: ["needs-qa"] },
      done: { state: "Done", addLabels: [], removeLabels: [] },
    },
    owner: { fromLabelPrefix: "agent:" }, // agent:api → "api"
    batch: { fromLabelPrefix: "qa-batch:" }, // qa-batch:1 → "qa-batch:1"
    bounceMarker: "^\\s*🔁\\s*bounce",
  },
};

export default softwareDevConfig;
