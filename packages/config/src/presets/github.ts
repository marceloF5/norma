import type { NormaConfig } from "../schema.js";

/**
 * The "github" pipeline — software-dev on GitHub Issues. GitHub has only
 * open/closed states, so phases are carried in LABELS (done = closed), and the
 * dependency DAG is encoded by the adapter as `blocked-by:<n>` labels. Same
 * engine + orchestrator; only this config differs.
 */
export const githubConfig: NormaConfig = {
  name: "github",
  description:
    "software-dev on GitHub Issues (epic = milestone; phases via labels; done = closed).",
  tracker: {
    kind: "github",
    options: { repo: "owner/repo" },
  },
  runtime: { kind: "claude-code", options: {} },
  policy: {
    workerTypes: ["api", "web"],
    concurrency: 1,
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
    // GitHub state is only open/closed → classify by label first; closed = done.
    classify: [
      { when: { label: "phase:canceled" }, phase: "canceled" },
      { when: { state: "closed" }, phase: "done" },
      { when: { label: "changes-requested" }, phase: "needs_rework" },
      { when: { label: "needs-qa" }, phase: "needs_qa" },
      { when: { label: "needs-review" }, phase: "needs_review" },
      { when: { label: "qa-approved" }, phase: "released" },
      { when: { label: "in-progress" }, phase: "in_progress" },
      { when: { label: "ready-for-dev" }, phase: "ready" },
      { when: { state: "open" }, phase: "backlog" },
    ],
    apply: {
      ready: { state: "open", addLabels: ["ready-for-dev"], removeLabels: ["in-progress"] },
      in_progress: { state: "open", addLabels: ["in-progress"], removeLabels: ["ready-for-dev"] },
      needs_review: {
        state: "open",
        addLabels: ["needs-review"],
        removeLabels: ["in-progress", "changes-requested", "needs-qa"],
      },
      needs_qa: { state: "open", addLabels: ["needs-qa"], removeLabels: ["needs-review"] },
      needs_rework: {
        state: "open",
        addLabels: ["changes-requested"],
        removeLabels: ["needs-review", "needs-qa", "in-progress"],
      },
      released: {
        state: "open",
        addLabels: ["qa-approved"],
        removeLabels: ["needs-qa", "needs-review"],
      },
      done: { state: "closed", addLabels: [], removeLabels: ["qa-approved"] },
    },
    owner: { fromLabelPrefix: "agent:" },
    batch: { fromLabelPrefix: "qa-batch:" },
    bounceMarker: "🔁\\s*bounce",
  },
};

export default githubConfig;
