import { describe, expect, it } from "vitest";
import { EchoRunner } from "./echo.js";

describe("EchoRunner", () => {
  it("returns green verdicts per stage by default", async () => {
    const r = new EchoRunner();
    expect((await r.run({ kind: "dispatch", role: "api", context: "" })).verdict).toBe("ok");
    expect((await r.run({ kind: "review", role: "rev", context: "" })).verdict).toBe("pass");
    expect((await r.run({ kind: "qa", role: "qa", context: "" })).verdict).toBe("approve");
    expect((await r.run({ kind: "escalate", role: "pe", context: "" })).verdict).toBe("ok");
  });

  it("honours a decide override", async () => {
    const r = new EchoRunner({ decide: (req) => (req.kind === "review" ? "fail" : undefined) });
    expect((await r.run({ kind: "review", role: "rev", context: "" })).verdict).toBe("fail");
    expect((await r.run({ kind: "dispatch", role: "api", context: "" })).verdict).toBe("ok");
  });
});
