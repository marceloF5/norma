import { describe, expect, it } from "vitest";
import { CliAgentRunner } from "./cli-agent.js";

const node = process.execPath;
// echoes the selected model, then a verdict — lets us assert the selector is forwarded.
const script =
  "const a=process.argv.find(x=>x.startsWith('sel='));console.log('MODEL:'+(a?a.slice(4):'none'));console.log('NORMA_VERDICT: pass');";

describe("CliAgentRunner", () => {
  it("forwards the model selector to the CLI and parses the verdict", async () => {
    const runner = new CliAgentRunner({
      kind: "test",
      bin: node,
      model: "openai/gpt-4o",
      buildArgs: (_prompt, model) => ["-e", script, `sel=${model ?? "none"}`],
    });
    const out = await runner.run({ kind: "review", role: "reviewer", context: "" });
    expect(out.verdict).toBe("pass");
    expect(out.raw).toContain("MODEL:openai/gpt-4o");
  });

  it("returns error when the CLI cannot spawn", async () => {
    const runner = new CliAgentRunner({
      kind: "nope",
      bin: "definitely-not-a-real-agent-cli-xyz",
      buildArgs: () => [],
    });
    const out = await runner.run({ kind: "review", role: "r", context: "" });
    expect(out.verdict).toBe("error");
  });
});
