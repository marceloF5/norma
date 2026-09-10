import { Phase } from "@norma/core";
import { describe, expect, it } from "vitest";
import { renderReport } from "./report.js";

describe("renderReport", () => {
  const body = renderReport({
    title: "referral-tiers",
    brief: "Add referral tiers.",
    url: "https://tracker/epic/1",
    date: "2026-09-10",
    tasks: [
      {
        ref: "RED-1",
        title: "Tier endpoint",
        owner: "api",
        batch: "qa-batch:1",
        phase: Phase.RELEASED,
      },
      {
        ref: "RED-2",
        title: "Tier page",
        owner: "web",
        batch: "qa-batch:2",
        phase: Phase.RELEASED,
      },
    ],
  });

  it("includes summary, per-owner build list, batches, and status", () => {
    expect(body).toContain("# referral-tiers — Delivery Report");
    expect(body).toContain("Add referral tiers.");
    expect(body).toContain("### api");
    expect(body).toContain("**RED-1** Tier endpoint");
    expect(body).toContain("## QA batches");
    expect(body).toContain("released: 2");
  });

  it("stays compact (≤200 lines)", () => {
    expect(body.split("\n").length).toBeLessThanOrEqual(200);
  });
});
