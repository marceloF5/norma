import { computePlan } from "@norma/core";
import { describe, expect, it } from "vitest";
import { parseConfig, toPlanContext } from "../schema.js";
import { contentConfig } from "./content.js";

describe("content preset", () => {
  it("is a valid NormaConfig", () => {
    expect(() => parseConfig(contentConfig)).not.toThrow();
  });

  it("drives the SAME engine with a different vocabulary", () => {
    const ctx = toPlanContext(contentConfig);
    // A drafted piece awaiting edit → the engine emits a review, routed to "editor".
    const plan = computePlan(
      [
        {
          id: "1",
          ref: "CON-1",
          title: "Launch post",
          phase: "needs_review",
          owner: "longform",
          batch: "batch:1",
          bounces: 0,
          blockedBy: [],
          order: 1,
        },
      ],
      ctx,
    );
    const review = plan.actions.find((a) => a.kind === "review");
    expect(review?.role).toBe("editor");
  });
});
