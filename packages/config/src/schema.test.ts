import { computePlan } from "@norma/core";
import { describe, expect, it } from "vitest";
import { softwareDevConfig } from "./presets/software-dev.js";
import { parseConfig, toPlanContext } from "./schema.js";

describe("config", () => {
  it("validates the software-dev preset", () => {
    expect(() => parseConfig(softwareDevConfig)).not.toThrow();
  });

  it("rejects an unknown phase in a classify rule", () => {
    const bad = JSON.parse(JSON.stringify(softwareDevConfig)) as {
      phaseMapping: { classify: { phase: string }[] };
    };
    const rule = bad.phaseMapping.classify[0];
    if (rule) rule.phase = "nope";
    expect(() => parseConfig(bad)).toThrow();
  });

  it("produces a PlanContext the engine accepts", () => {
    const ctx = toPlanContext(parseConfig(softwareDevConfig));
    expect(ctx.policy.workerTypes).toEqual(["api", "web"]);
    expect(ctx.roles.review).toBe("code-reviewer");
    // Smoke: the engine runs with the derived context.
    const plan = computePlan([], ctx);
    expect(plan.actionCount).toBe(0);
  });
});
