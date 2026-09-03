import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FsContextStore } from "./fs-store.js";
import { composeHandoff } from "./handoff.js";

describe("composeHandoff", () => {
  it("assembles brief → plan → task → feedback for the stage", () => {
    const out = composeHandoff({
      stage: "rework",
      brief: "Goal: ship X",
      plan: "DAG: A → B",
      worktree: "/wt/epic-x",
      tasks: [{ id: "1", ref: "RED-1", title: "Do A", owner: "api", description: "Implement A" }],
      feedback: "reviewer: missing Zod schema",
    });
    expect(out).toContain("Stage: rework");
    expect(out).toContain("Goal: ship X");
    expect(out).toContain("DAG: A → B");
    expect(out).toContain("RED-1 — Do A");
    expect(out).toContain("missing Zod schema");
    expect(out).toContain("/wt/epic-x");
  });

  it("truncates oversized sections for token discipline", () => {
    const out = composeHandoff({
      stage: "dispatch",
      brief: "x".repeat(10000),
      tasks: [{ id: "1", ref: "RED-1", title: "T", owner: null }],
      maxSection: 100,
    });
    expect(out).toContain("[truncated");
  });
});

describe("FsContextStore", () => {
  it("round-trips brief / plan / report per epic slug", async () => {
    const root = await mkdtemp(join(tmpdir(), "harness-ctx-"));
    const store = new FsContextStore(root);
    await store.writeBrief("epic-x", "the brief");
    await store.writePlan("epic-x", "the plan");
    await store.writeReport("epic-x", "the report");
    expect(await store.readBrief("epic-x")).toBe("the brief");
    expect(await store.readPlan("epic-x")).toBe("the plan");
    expect(await store.readReport("epic-x")).toBe("the report");
    expect(await store.readBrief("missing")).toBeNull();
    // written where the original harness expects it
    expect(await readFile(join(root, "epics", "epic-x", "PLAN.md"), "utf8")).toBe("the plan");
  });
});
