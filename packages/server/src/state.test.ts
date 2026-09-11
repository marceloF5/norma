import { softwareDevConfig } from "@norma/config";
import { MemoryTracker, type RawIssue } from "@norma/tracker";
import { describe, expect, it } from "vitest";
import { buildState } from "./state.js";

const seed: RawIssue[] = [
  {
    id: "iss-1",
    ref: "MEM-1",
    title: "API",
    state: "Backlog",
    labels: ["agent:api", "qa-batch:1"],
    blockedBy: [],
    order: 1,
  },
  {
    id: "iss-2",
    ref: "MEM-2",
    title: "Web",
    state: "Backlog",
    labels: ["agent:web", "qa-batch:2"],
    blockedBy: [{ id: "iss-1", ref: "MEM-1", state: "Backlog" }],
    order: 2,
  },
];

describe("buildState", () => {
  it("returns the task graph, edges, and what's next", async () => {
    const tracker = new MemoryTracker({
      seed,
      bounceMarker: softwareDevConfig.phaseMapping.bounceMarker,
    });
    const s = await buildState(tracker, softwareDevConfig, "p");
    expect(s.tasks.map((t) => t.ref).sort()).toEqual(["MEM-1", "MEM-2"]);
    expect(s.edges).toEqual([{ from: "MEM-1", to: "MEM-2" }]);
    // MEM-1 is unblocked → the engine wants to promote it; MEM-2 is blocked.
    expect(s.next).toContain("MEM-1");
    expect(s.next).not.toContain("MEM-2");
    expect(s.actions.some((a) => a.kind === "promote")).toBe(true);
  });
});
