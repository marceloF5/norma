import { describe, expect, it } from "vitest";
import { CommandRunner } from "./command.js";

const node = process.execPath;
// A tiny agent: drains stdin, then prints a verdict (and a bounce when asked).
const script = `let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  const req=JSON.parse(d||'{}');
  if(req.kind==='qa'){console.log('NORMA_VERDICT: bounce');console.log('NORMA_BOUNCE: RED-1: broken');}
  else{console.log('NORMA_VERDICT: pass');}
});`;

describe("CommandRunner", () => {
  it("runs a command, passes the request on stdin, and parses the verdict", async () => {
    const r = new CommandRunner({ command: node, args: ["-e", script] });
    const out = await r.run({
      kind: "review",
      role: "reviewer",
      context: "",
      task: { id: "1", ref: "RED-1", title: "t", owner: "api" },
    });
    expect(out.verdict).toBe("pass");
  });

  it("parses QA bounces", async () => {
    const r = new CommandRunner({ command: node, args: ["-e", script] });
    const out = await r.run({
      kind: "qa",
      role: "qa",
      context: "",
      batch: "qa-batch:1",
      tasks: [{ id: "1", ref: "RED-1", title: "t", owner: "api" }],
    });
    expect(out.verdict).toBe("bounce");
    expect(out.bounced?.[0]).toEqual({ ref: "RED-1", defect: "broken" });
  });

  it("returns error when the command cannot spawn", async () => {
    const r = new CommandRunner({ command: "definitely-not-a-real-binary-xyz" });
    const out = await r.run({ kind: "review", role: "r", context: "" });
    expect(out.verdict).toBe("error");
  });
});
