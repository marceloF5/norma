import type { AgentRequest } from "@norma/agent-runtime";
import { EchoRunner } from "@norma/agent-runtime";
import { softwareDevConfig } from "@norma/config";
import { MemoryTracker, type RawIssue } from "@norma/tracker";
import { describe, expect, it } from "vitest";
import { Orchestrator } from "./orchestrator.js";

function seedEpic(): RawIssue[] {
  return [
    {
      id: "iss-1",
      ref: "MEM-1",
      title: "API endpoint",
      state: "Backlog",
      labels: ["agent:api", "qa-batch:1", "harness"],
      blockedBy: [],
      order: 1,
    },
    {
      id: "iss-2",
      ref: "MEM-2",
      title: "Web page",
      state: "Backlog",
      labels: ["agent:web", "qa-batch:2", "harness"],
      blockedBy: [{ id: "iss-1", ref: "MEM-1", state: "Backlog" }],
      order: 2,
    },
  ];
}

describe("Orchestrator — full loop (memory tracker + echo runner)", () => {
  it("drives an epic from backlog to fully released", async () => {
    const tracker = new MemoryTracker({ seed: seedEpic() });
    const orch = new Orchestrator({
      config: softwareDevConfig,
      tracker,
      runner: new EchoRunner(),
    });

    let completed = false;
    const result = await orch.runCycle({
      projectId: "p1",
      onComplete: () => {
        completed = true;
      },
    });

    expect(completed).toBe(true);
    expect(result.complete).toBe(true);

    const issues = await tracker.listIssues({ projectId: "p1" });
    expect(issues.every((i) => i.state === "Ready for PR")).toBe(true);
    expect(issues.every((i) => i.labels.includes("qa-approved"))).toBe(true);
    // The dependency was respected: MEM-1 (blocker) and MEM-2 both released.
    expect(result.executed.some((s) => s.kind === "dispatch" && s.ref === "MEM-1")).toBe(true);
    expect(result.executed.some((s) => s.kind === "qa")).toBe(true);
  });

  it("bounces a task on review failure, then escalates after repeated bounces", async () => {
    const tracker = new MemoryTracker({ seed: [seedEpic()[0] as RawIssue] });
    // Review always fails → the task bounces, reworks, bounces again → escalates at 2.
    const runner = new EchoRunner({
      decide: (req: AgentRequest) => (req.kind === "review" ? "fail" : undefined),
    });
    const orch = new Orchestrator({ config: softwareDevConfig, tracker, runner });

    const result = await orch.runCycle({ projectId: "p1", maxSteps: 20 });

    expect(result.executed.some((s) => s.kind === "review" && s.verdict === "fail")).toBe(true);
    expect(result.executed.some((s) => s.kind === "escalate")).toBe(true);
  });

  it("injects the last bounce comment into the rework handoff", async () => {
    const tracker = new MemoryTracker({
      bounceMarker: softwareDevConfig.phaseMapping.bounceMarker,
      seed: [
        {
          id: "iss-1",
          ref: "MEM-1",
          title: "API endpoint",
          state: "In Progress",
          labels: ["agent:api", "changes-requested", "qa-batch:1"],
          blockedBy: [],
          order: 1,
        },
      ],
    });
    await tracker.comment("iss-1", "🔁 bounce by review: missing Zod schema on the body");

    let reworkContext = "";
    const runner = new EchoRunner({
      decide: (req: AgentRequest) => {
        if (req.kind === "rework") reworkContext = req.context;
        return undefined;
      },
    });
    const orch = new Orchestrator({ config: softwareDevConfig, tracker, runner });
    await orch.runCycle({ projectId: "p1", maxSteps: 3 });

    expect(reworkContext).toContain("Prior feedback");
    expect(reworkContext).toContain("missing Zod schema");
  });

  it("dry-run plans without mutating the tracker", async () => {
    const tracker = new MemoryTracker({ seed: seedEpic() });
    const orch = new Orchestrator({
      config: softwareDevConfig,
      tracker,
      runner: new EchoRunner(),
    });
    await orch.runCycle({ projectId: "p1", dryRun: true, maxSteps: 3 });
    const issues = await tracker.listIssues({ projectId: "p1" });
    // Nothing was written back.
    expect(issues.every((i) => i.state === "Backlog")).toBe(true);
  });
});
