import { describe, expect, it } from "vitest";
import { Phase } from "./phase.js";
import { type PlanContext, computePlan } from "./plan.js";
import type { Intent, NormalizedTask } from "./types.js";

const CTX: PlanContext = {
  policy: { workerTypes: ["api", "web"], concurrency: 1, escalateAtBounces: 2 },
  roles: {
    worker: { api: "api-engineer", web: "web-engineer" },
    review: "code-reviewer",
    qa: "qa-engineer",
    escalate: "principal-engineer",
  },
};

let seq = 0;
function mk(o: Partial<NormalizedTask> & { num: number; phase: Phase }): NormalizedTask {
  return {
    id: `uuid-${++seq}`,
    ref: `RED-${o.num}`,
    title: o.title ?? `task ${o.num}`,
    url: undefined,
    phase: o.phase,
    owner: o.owner ?? null,
    batch: o.batch ?? null,
    bounces: o.bounces ?? 0,
    blockedBy: o.blockedBy ?? [],
    order: o.order ?? o.num,
  };
}

const of = <K extends Intent["kind"]>(p: { actions: Intent[] }, kind: K) =>
  p.actions.filter((a): a is Extract<Intent, { kind: K }> => a.kind === kind);

describe("computePlan — DAG frontier", () => {
  it("promotes unblocked backlog tasks and does not dispatch them first", () => {
    const p = computePlan(
      [
        mk({ num: 1, phase: Phase.BACKLOG, owner: "api" }),
        mk({ num: 2, phase: Phase.BACKLOG, owner: "web" }),
      ],
      CTX,
    );
    expect(of(p, "promote")).toHaveLength(2);
    expect(of(p, "dispatch")).toHaveLength(0);
  });

  it("does not promote a task with an open blocker; releases it when the blocker is done/canceled", () => {
    const open = computePlan(
      [
        mk({
          num: 2,
          phase: Phase.BACKLOG,
          owner: "web",
          blockedBy: [{ ref: "RED-1", phase: Phase.IN_PROGRESS }],
        }),
      ],
      CTX,
    );
    expect(of(open, "promote")).toHaveLength(0);

    const released = computePlan(
      [
        mk({
          num: 2,
          phase: Phase.BACKLOG,
          owner: "web",
          blockedBy: [{ ref: "RED-1", phase: Phase.RELEASED }],
        }),
      ],
      CTX,
    );
    expect(of(released, "promote")).toHaveLength(1);

    const canceled = computePlan(
      [
        mk({
          num: 2,
          phase: Phase.BACKLOG,
          owner: "web",
          blockedBy: [{ ref: "RED-1", phase: Phase.CANCELED }],
        }),
      ],
      CTX,
    );
    expect(of(canceled, "promote")).toHaveLength(1);
  });
});

describe("computePlan — dispatch & concurrency gate", () => {
  it("dispatches the lowest-order ready task per free worker", () => {
    const p = computePlan(
      [
        mk({ num: 3, phase: Phase.READY, owner: "api" }),
        mk({ num: 1, phase: Phase.READY, owner: "api" }),
        mk({ num: 5, phase: Phase.READY, owner: "web" }),
      ],
      CTX,
    );
    const disp = of(p, "dispatch");
    expect(disp).toHaveLength(2);
    expect(disp.find((a) => a.worker === "api")?.task.ref).toBe("RED-1");
  });

  it("one-in-flight gate blocks a second dispatch for the same worker", () => {
    const p = computePlan(
      [
        mk({ num: 1, phase: Phase.IN_PROGRESS, owner: "api" }),
        mk({ num: 2, phase: Phase.READY, owner: "api" }),
        mk({ num: 3, phase: Phase.READY, owner: "web" }),
      ],
      CTX,
    );
    const disp = of(p, "dispatch");
    expect(disp).toHaveLength(1);
    expect(disp[0]?.worker).toBe("web");
    expect(p.inFlight.api).toEqual(["RED-1"]);
  });

  it("respects a concurrency limit > 1", () => {
    const ctx: PlanContext = { ...CTX, policy: { ...CTX.policy, concurrency: 2 } };
    const p = computePlan(
      [
        mk({ num: 1, phase: Phase.IN_PROGRESS, owner: "api" }),
        mk({ num: 2, phase: Phase.READY, owner: "api" }),
        mk({ num: 3, phase: Phase.READY, owner: "api" }),
      ],
      ctx,
    );
    expect(of(p, "dispatch")).toHaveLength(1); // 1 slot left (2 - 1 in-flight)
  });
});

describe("computePlan — review / rework / escalate", () => {
  it("emits a review action for a task needing review", () => {
    const p = computePlan([mk({ num: 1, phase: Phase.NEEDS_REVIEW, owner: "api" })], CTX);
    expect(of(p, "review")).toHaveLength(1);
  });

  it("reworks below the threshold and escalates at/above it", () => {
    const base = { num: 1, phase: Phase.NEEDS_REWORK, owner: "web" as const };
    expect(of(computePlan([mk({ ...base, bounces: 1 })], CTX), "rework")).toHaveLength(1);
    expect(of(computePlan([mk({ ...base, bounces: 2 })], CTX), "escalate")).toHaveLength(1);
  });

  it("routes rework back to the owning worker's role", () => {
    const p = computePlan(
      [mk({ num: 1, phase: Phase.NEEDS_REWORK, owner: "api", bounces: 0 })],
      CTX,
    );
    expect(of(p, "rework")[0]?.role).toBe("api-engineer");
  });
});

describe("computePlan — QA batches", () => {
  it("gates QA on the whole batch being ready", () => {
    const notReady = computePlan(
      [
        mk({ num: 1, phase: Phase.NEEDS_QA, owner: "api", batch: "b1" }),
        mk({ num: 2, phase: Phase.NEEDS_REVIEW, owner: "web", batch: "b1" }),
      ],
      CTX,
    );
    expect(of(notReady, "qa")).toHaveLength(0);

    const ready = computePlan(
      [
        mk({ num: 1, phase: Phase.NEEDS_QA, owner: "api", batch: "b1" }),
        mk({ num: 2, phase: Phase.NEEDS_QA, owner: "web", batch: "b1" }),
      ],
      CTX,
    );
    const qa = of(ready, "qa");
    expect(qa).toHaveLength(1);
    expect(qa[0]?.tasks).toHaveLength(2);
  });

  it("ignores a canceled batch member (does not stall the batch)", () => {
    const p = computePlan(
      [
        mk({ num: 1, phase: Phase.NEEDS_QA, owner: "api", batch: "b1" }),
        mk({ num: 2, phase: Phase.CANCELED, owner: "api", batch: "b1" }),
      ],
      CTX,
    );
    const qa = of(p, "qa");
    expect(qa).toHaveLength(1);
    expect(qa[0]?.tasks).toHaveLength(1);
  });
});

describe("computePlan — completion & determinism", () => {
  it("completes only when all tasks are released/terminal", () => {
    const partial = computePlan(
      [
        mk({ num: 1, phase: Phase.RELEASED, owner: "api" }),
        mk({ num: 2, phase: Phase.NEEDS_QA, owner: "web" }),
      ],
      CTX,
    );
    expect(partial.complete).toBe(false);

    const done = computePlan(
      [
        mk({ num: 1, phase: Phase.RELEASED, owner: "api" }),
        mk({ num: 2, phase: Phase.RELEASED, owner: "web" }),
      ],
      CTX,
    );
    expect(done.complete).toBe(true);
    expect(of(done, "complete")).toHaveLength(1);
  });

  it("is deterministic — identical input yields byte-identical output", () => {
    const tasks = [
      mk({ num: 1, phase: Phase.READY, owner: "api" }),
      mk({ num: 2, phase: Phase.NEEDS_REVIEW, owner: "web" }),
    ];
    expect(JSON.stringify(computePlan(tasks, CTX))).toBe(JSON.stringify(computePlan(tasks, CTX)));
  });

  it("flags an unrouted task as an anomaly", () => {
    const p = computePlan([mk({ num: 1, phase: Phase.BACKLOG, owner: null })], CTX);
    expect(p.anomalies.some((a) => a.includes("no owner"))).toBe(true);
  });
});
