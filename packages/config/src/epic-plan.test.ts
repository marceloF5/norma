import { describe, expect, it } from "vitest";
import { type EpicPlan, parseEpicPlan, slugify, validateEpicPlan } from "./epic-plan.js";

const base: EpicPlan = {
  name: "Referral tiers",
  tasks: [
    { id: "a", title: "API endpoint", owner: "api", batch: "1", blockedBy: [] },
    { id: "b", title: "Web page", owner: "web", batch: "2", blockedBy: ["a"] },
  ],
};

describe("epic-plan schema", () => {
  it("parses a valid plan and defaults blockedBy", () => {
    const p = parseEpicPlan({ name: "X", tasks: [{ id: "a", title: "T", owner: "api" }] });
    expect(p.tasks[0]?.blockedBy).toEqual([]);
  });

  it("rejects an unknown field", () => {
    expect(() => parseEpicPlan({ name: "X", tasks: [], nope: 1 })).toThrow();
  });
});

describe("validateEpicPlan", () => {
  it("accepts a well-formed plan", () => {
    expect(validateEpicPlan(base, { workerTypes: ["api", "web"] })).toEqual([]);
  });

  it("flags unknown dependency, self-block, and duplicate id", () => {
    const bad: EpicPlan = {
      name: "X",
      tasks: [
        { id: "a", title: "A", owner: "api", blockedBy: ["ghost", "a"] },
        { id: "a", title: "dup", owner: "api", blockedBy: [] },
      ],
    };
    const errs = validateEpicPlan(bad);
    expect(errs.some((e) => e.includes("unknown task"))).toBe(true);
    expect(errs.some((e) => e.includes("blocks itself"))).toBe(true);
    expect(errs.some((e) => e.includes("duplicate task id"))).toBe(true);
  });

  it("flags a same-owner blocking edge inside one qa-batch (deadlock)", () => {
    const dead: EpicPlan = {
      name: "X",
      tasks: [
        { id: "a", title: "A", owner: "web", batch: "1", blockedBy: [] },
        { id: "b", title: "B", owner: "web", batch: "1", blockedBy: ["a"] },
      ],
    };
    expect(validateEpicPlan(dead).some((e) => e.includes("deadlock"))).toBe(true);
  });

  it("flags an owner outside the configured worker types", () => {
    expect(
      validateEpicPlan(base, { workerTypes: ["api"] }).some((e) =>
        e.includes("not a configured worker type"),
      ),
    ).toBe(true);
  });
});

describe("slugify", () => {
  it("makes a url-safe slug", () => {
    expect(slugify("Refer-a-Friend Admin Dashboard!")).toBe("refer-a-friend-admin-dashboard");
  });
});
