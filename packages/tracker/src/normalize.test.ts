import { githubConfig, softwareDevConfig } from "@norma/config";
import { Phase } from "@norma/core";
import { describe, expect, it } from "vitest";
import { MemoryTracker } from "./memory.js";
import { batchOf, classifyPhase, normalize, ownerOf } from "./normalize.js";
import type { RawIssue } from "./types.js";

const m = softwareDevConfig.phaseMapping;

describe("normalize — classify", () => {
  it("maps tracker (state,label) pairs to canonical phases", () => {
    expect(classifyPhase("Backlog", [], m)).toBe(Phase.BACKLOG);
    expect(classifyPhase("Todo", ["ready-for-dev"], m)).toBe(Phase.READY);
    expect(classifyPhase("In Progress", [], m)).toBe(Phase.IN_PROGRESS);
    expect(classifyPhase("In Progress", ["changes-requested"], m)).toBe(Phase.NEEDS_REWORK);
    expect(classifyPhase("In Review", ["needs-review"], m)).toBe(Phase.NEEDS_REVIEW);
    expect(classifyPhase("In Review", ["needs-qa"], m)).toBe(Phase.NEEDS_QA);
    expect(classifyPhase("Ready for PR", ["qa-approved"], m)).toBe(Phase.RELEASED);
    expect(classifyPhase("Done", [], m)).toBe(Phase.DONE);
    expect(classifyPhase("Canceled", [], m)).toBe(Phase.CANCELED);
  });

  it("derives owner and batch from label prefixes", () => {
    expect(ownerOf(["agent:api", "harness"], m)).toBe("api");
    expect(ownerOf(["harness"], m)).toBeNull();
    expect(batchOf(["qa-batch:2"], m)).toBe("qa-batch:2");
  });
});

describe("normalize — full issue", () => {
  it("produces engine tasks with classified blocker phases", () => {
    const raw: RawIssue[] = [
      {
        id: "a",
        ref: "MEM-1",
        title: "api",
        state: "Ready for PR",
        labels: ["agent:api", "qa-approved"],
        blockedBy: [],
        order: 1,
      },
      {
        id: "b",
        ref: "MEM-2",
        title: "web",
        state: "Backlog",
        labels: ["agent:web", "qa-batch:1"],
        blockedBy: [{ id: "a", ref: "MEM-1", state: "Ready for PR" }],
        order: 2,
      },
    ];
    const tasks = normalize(raw, m);
    expect(tasks[1]?.owner).toBe("web");
    expect(tasks[1]?.batch).toBe("qa-batch:1");
    expect(tasks[1]?.blockedBy[0]?.phase).toBe(Phase.RELEASED);
  });

  it("classifies a label-driven blocker (GitHub: released = open + qa-approved)", () => {
    const gh = githubConfig.phaseMapping;
    const raw: RawIssue[] = [
      {
        id: "b",
        ref: "#2",
        title: "web",
        state: "open",
        labels: ["agent:web", "blocked-by:1"],
        blockedBy: [{ id: "1", ref: "#1", state: "open", labels: ["qa-approved"] }],
        order: 2,
      },
    ];
    // State alone ("open") would be backlog; with the blocker's labels it's released.
    expect(normalize(raw, gh)[0]?.blockedBy[0]?.phase).toBe(Phase.RELEASED);
  });
});

describe("MemoryTracker", () => {
  it("applies a transition (state + labels) and reflects it in listIssues", async () => {
    const t = new MemoryTracker({
      seed: [
        {
          id: "x",
          ref: "MEM-1",
          title: "t",
          state: "Todo",
          labels: ["ready-for-dev", "agent:api"],
          blockedBy: [],
          order: 1,
        },
      ],
    });
    await t.transition("x", { state: "In Progress", removeLabels: ["ready-for-dev"] });
    const [issue] = await t.listIssues({ projectId: "p" });
    expect(issue?.state).toBe("In Progress");
    expect(issue?.labels).not.toContain("ready-for-dev");
    expect(issue?.labels).toContain("agent:api");
  });

  it("creates issues and wires dependencies", async () => {
    const t = new MemoryTracker();
    const a = await t.createIssue({ projectId: "p", title: "blocker" });
    const b = await t.createIssue({ projectId: "p", title: "dependent" });
    await t.addDependency({ issueId: b.id, blockedById: a.id });
    const issues = await t.listIssues({ projectId: "p" });
    const dep = issues.find((i) => i.id === b.id);
    expect(dep?.blockedBy[0]?.ref).toBe(a.ref);
  });
});
