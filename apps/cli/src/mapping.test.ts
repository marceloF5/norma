import { parseConfig } from "@norma/config";
import type { TrackerState } from "@norma/tracker";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LABELS,
  buildConfig,
  buildPhaseMapping,
  defaultSlots,
  matchSlot,
} from "./mapping.js";

const LINEAR_STATES: TrackerState[] = [
  { id: "1", name: "Backlog", type: "backlog" },
  { id: "2", name: "Todo", type: "unstarted" },
  { id: "3", name: "In Progress", type: "started" },
  { id: "4", name: "In Review", type: "started" },
  { id: "5", name: "Ready for PR", type: "started" },
  { id: "6", name: "Done", type: "completed" },
  { id: "7", name: "Canceled", type: "canceled" },
];

describe("matchSlot / defaultSlots", () => {
  it("matches a canonical Linear board", () => {
    expect(matchSlot("backlog", LINEAR_STATES)).toBe("Backlog");
    expect(matchSlot("ready", LINEAR_STATES)).toBe("Todo");
    expect(matchSlot("in_review", LINEAR_STATES)).toBe("In Review");
    expect(matchSlot("released", LINEAR_STATES)).toBe("Ready for PR");
    expect(matchSlot("done", LINEAR_STATES)).toBe("Done");
    expect(matchSlot("canceled", LINEAR_STATES)).toBe("Canceled");
  });

  it("falls back to preset names for an unknown board", () => {
    const slots = defaultSlots([{ id: "a", name: "Weird" }]);
    expect(slots.done).toBe("Done"); // preset fallback
  });
});

describe("buildConfig", () => {
  it("produces a valid NormaConfig the schema accepts", () => {
    const cfg = buildConfig({
      name: "my-team",
      tracker: { kind: "linear", options: { team: "Acme" } },
      runtime: { kind: "claude-code", options: {} },
      workers: ["api", "web"],
      concurrency: 1,
      escalateAtBounces: 2,
      roles: {
        worker: { api: "api-engineer", web: "web-engineer" },
        review: "code-reviewer",
        qa: "qa-engineer",
        escalate: "principal-engineer",
      },
      slots: defaultSlots(LINEAR_STATES),
      labels: DEFAULT_LABELS,
    });
    expect(() => parseConfig(cfg)).not.toThrow();
    expect(cfg.policy.workerTypes).toEqual(["api", "web"]);
  });

  it("mapping discriminates review vs qa within the review column", () => {
    const m = buildPhaseMapping(defaultSlots(LINEAR_STATES), DEFAULT_LABELS);
    const qaRule = m.classify.find((r) => r.phase === "needs_qa");
    const reviewRule = m.classify.find((r) => r.phase === "needs_review" && r.when.label);
    expect(qaRule?.when.state).toBe("In Review");
    expect(qaRule?.when.label).toBe("needs-qa");
    expect(reviewRule?.when.label).toBe("needs-review");
  });
});
