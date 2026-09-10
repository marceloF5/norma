import { describe, expect, it } from "vitest";
import { HumanRunner } from "./human.js";
import type { AgentRequest } from "./port.js";

const req: AgentRequest = {
  kind: "review",
  role: "editor",
  context: "",
  task: { id: "iss-1", ref: "RED-1", title: "t", owner: "web" },
};

describe("HumanRunner", () => {
  it("posts a request once and returns pending when no human verdict exists", async () => {
    const comments: string[] = [];
    const r = new HumanRunner({
      readComments: async () => comments,
      postComment: async (_id, body) => void comments.push(body),
    });
    const out = await r.run(req);
    expect(out.verdict).toBe("pending");
    expect(comments).toHaveLength(1);
    expect(comments[0]).toContain("awaiting editor");
  });

  it("returns the human's verdict once they reply", async () => {
    const comments = ["🧑 awaiting editor (review) — reply…", "looks good\nNORMA_VERDICT: pass"];
    const r = new HumanRunner({
      readComments: async () => comments,
      postComment: async () => {
        throw new Error("should not post again");
      },
    });
    const out = await r.run(req);
    expect(out.verdict).toBe("pass");
  });
});
