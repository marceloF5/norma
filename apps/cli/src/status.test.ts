import { Phase } from "@norma/core";
import { describe, expect, it } from "vitest";
import { type StatusRow, renderStatus } from "./commands/status.js";

const rows: StatusRow[] = [
  { ref: "RED-1", phase: Phase.RELEASED, owner: "api", batch: "qa-batch:1", title: "Endpoint" },
  { ref: "RED-2", phase: Phase.NEEDS_REVIEW, owner: "web", batch: null, title: "Page" },
];

describe("renderStatus", () => {
  it("renders an aligned table + phase summary", () => {
    const out = renderStatus(rows);
    expect(out).toContain("RED-1");
    expect(out).toContain("released");
    expect(out).toContain("Endpoint");
    expect(out).toContain("2 tasks");
    expect(out).toContain("released: 1");
    expect(out).toContain("needs_review: 1");
  });

  it("handles an empty project", () => {
    expect(renderStatus([])).toBe("no tasks in this project.");
  });
});
