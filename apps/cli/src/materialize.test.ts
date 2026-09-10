import { type EpicPlan, softwareDevConfig, toPlanContext } from "@norma/config";
import { computePlan } from "@norma/core";
import { MemoryTracker, normalize } from "@norma/tracker";
import { describe, expect, it } from "vitest";
import { labelsForPlan, materializeEpic, taskLabels } from "./materialize.js";

const plan: EpicPlan = {
  name: "Referral tiers",
  brief: "Add referral tiers.",
  tasks: [
    { id: "api", title: "Tier endpoint", owner: "api", batch: "1", blockedBy: [] },
    { id: "web", title: "Tier page", owner: "web", batch: "2", blockedBy: ["api"] },
  ],
};

describe("taskLabels / labelsForPlan", () => {
  it("derives owner + batch labels from the config prefixes", () => {
    expect(taskLabels(plan.tasks[1]!, softwareDevConfig)).toEqual(["agent:web", "qa-batch:2"]);
    expect(labelsForPlan(plan, softwareDevConfig).sort()).toEqual([
      "agent:api",
      "agent:web",
      "qa-batch:1",
      "qa-batch:2",
    ]);
  });
});

describe("materializeEpic (memory tracker)", () => {
  it("creates the project, labelled issues, and the dependency DAG", async () => {
    const tracker = new MemoryTracker({
      bounceMarker: softwareDevConfig.phaseMapping.bounceMarker,
    });
    const result = await materializeEpic(plan, tracker, softwareDevConfig);

    expect(result.created).toHaveLength(2);
    const issues = await tracker.listIssues({ projectId: result.projectId });
    const web = issues.find((i) => i.title === "Tier page");
    const api = issues.find((i) => i.title === "Tier endpoint");
    expect(web?.labels).toContain("agent:web");
    expect(web?.labels).toContain("qa-batch:2");
    // dependency wired: web is blocked by api
    expect(web?.blockedBy.map((b) => b.id)).toContain(api?.id);

    // The engine sees a promotable frontier (api has no blockers) and a blocked task.
    const tasks = normalize(issues, softwareDevConfig.phaseMapping);
    const engine = computePlan(tasks, toPlanContext(softwareDevConfig));
    const promoted = engine.actions.filter((a) => a.kind === "promote");
    expect(promoted).toHaveLength(1);
    expect(promoted[0]?.task.title).toBe("Tier endpoint");
  });
});
