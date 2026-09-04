import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CATALOG, catalogByStage, getAgent } from "./catalog.js";
import { markdownToSpec, specToMarkdown } from "./serialize.js";
import type { AgentSpec } from "./spec.js";
import { listAgents, readAgent, writeAgents } from "./store.js";

describe("catalog", () => {
  it("exposes the pre-established roles", () => {
    expect(getAgent("api-engineer")?.stage).toBe("worker");
    expect(getAgent("code-reviewer")?.stage).toBe("review");
    expect(getAgent("qa-engineer")?.stage).toBe("qa");
    expect(getAgent("principal-engineer")?.stage).toBe("escalate");
    expect(catalogByStage("worker").length).toBeGreaterThanOrEqual(2);
  });

  it("every catalog entry round-trips through markdown", () => {
    for (const spec of CATALOG) {
      const parsed = markdownToSpec(specToMarkdown(spec));
      expect(parsed.role).toBe(spec.role);
      expect(parsed.stage).toBe(spec.stage);
      expect(parsed.suggestedModel).toBe(spec.suggestedModel);
      expect(parsed.tools).toEqual(spec.tools);
      expect(parsed.instructions).toBe(spec.instructions.trim());
    }
  });
});

describe("serialize", () => {
  it("throws on a file without frontmatter", () => {
    expect(() => markdownToSpec("just a body")).toThrow();
  });

  it("rejects an invalid stage", () => {
    const md = "---\nrole: x\nstage: nope\n---\nbody";
    expect(() => markdownToSpec(md)).toThrow();
  });
});

describe("store", () => {
  it("writes and reads agent files in a directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "norma-agents-"));
    const specs: AgentSpec[] = [getAgent("api-engineer"), getAgent("code-reviewer")].filter(
      (s): s is AgentSpec => Boolean(s),
    );
    const paths = await writeAgents(dir, specs);
    expect(paths).toHaveLength(2);
    expect(await readFile(join(dir, "api-engineer.md"), "utf8")).toContain("role: api-engineer");
    expect((await readAgent(dir, "api-engineer"))?.stage).toBe("worker");
    expect(await readAgent(dir, "missing")).toBeNull();
    expect((await listAgents(dir)).map((s) => s.role).sort()).toEqual([
      "api-engineer",
      "code-reviewer",
    ]);
  });
});
