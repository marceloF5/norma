import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubAdapter } from "./github.js";

interface Call {
  method: string;
  path: string;
  body?: unknown;
}

function install(route: (method: string, path: string, body?: unknown) => unknown) {
  const calls: Call[] = [];
  const mock = vi.fn(async (url: string, init: { method: string; body?: string }) => {
    const path = url.replace("https://api.github.com", "");
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init.method, path, body });
    const data = route(init.method, path, body);
    return {
      ok: true,
      status: data === undefined ? 204 : 200,
      statusText: "OK",
      headers: { get: () => "application/json" },
      json: async () => data,
      text: async () => "",
    };
  });
  vi.stubGlobal("fetch", mock);
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const adapter = () => new GitHubAdapter({ repo: "acme/app", token: "t" });

describe("GitHubAdapter.listIssues", () => {
  it("maps issues (labels, blocked-by DAG, closed state, bounces)", async () => {
    install((method, path) => {
      if (method === "GET" && path.startsWith("/repos/acme/app/issues?milestone")) {
        return [
          {
            number: 1,
            title: "API",
            state: "closed",
            labels: [{ name: "agent:api" }],
            comments: 0,
          },
          {
            number: 2,
            title: "Web",
            state: "open",
            labels: [{ name: "agent:web" }, { name: "needs-review" }, { name: "blocked-by:1" }],
            comments: 1,
          },
        ];
      }
      if (method === "GET" && path === "/repos/acme/app/issues/2/comments?per_page=100") {
        return [{ body: "🔁 bounce by review: fix" }];
      }
      return {};
    });

    const issues = await adapter().listIssues({ projectId: "5" });
    expect(issues).toHaveLength(2);
    const web = issues.find((i) => i.ref === "#2")!;
    expect(web.state).toBe("open");
    expect(web.labels).toContain("needs-review");
    expect(web.blockedBy[0]).toMatchObject({ ref: "#1", state: "closed" });
    expect(web.bounces).toBe(1);
  });
});

describe("GitHubAdapter.transition", () => {
  it("PATCHes merged labels + open/closed state", async () => {
    const calls = install((method, path) => {
      if (method === "GET" && path === "/repos/acme/app/issues/2") {
        return {
          number: 2,
          title: "Web",
          state: "open",
          labels: [{ name: "needs-review" }, { name: "agent:web" }],
          comments: 0,
        };
      }
      if (method === "PATCH") return { number: 2 };
      return {};
    });
    await adapter().transition("2", {
      state: "closed",
      addLabels: ["qa-approved"],
      removeLabels: ["needs-review"],
    });
    const patch = calls.find((c) => c.method === "PATCH");
    const b = patch?.body as { labels: string[]; state: string };
    expect(b.state).toBe("closed");
    expect(b.labels).toContain("qa-approved");
    expect(b.labels).toContain("agent:web");
    expect(b.labels).not.toContain("needs-review");
  });
});

describe("GitHubAdapter.addDependency", () => {
  it("ensures a blocked-by label and adds it to the issue", async () => {
    const calls = install((method, path) => {
      if (method === "POST" && path === "/repos/acme/app/labels")
        return { id: 9, name: "blocked-by:1" };
      if (method === "POST" && path === "/repos/acme/app/issues/2/labels")
        return [{ name: "blocked-by:1" }];
      return {};
    });
    await adapter().addDependency({ issueId: "2", blockedById: "1" });
    expect(calls.find((c) => c.path === "/repos/acme/app/labels")?.body).toMatchObject({
      name: "blocked-by:1",
    });
    expect(calls.find((c) => c.path === "/repos/acme/app/issues/2/labels")?.body).toMatchObject({
      labels: ["blocked-by:1"],
    });
  });
});

describe("GitHubAdapter introspection", () => {
  it("exposes open/closed states and lists labels", async () => {
    install((method, path) => {
      if (method === "GET" && path.startsWith("/repos/acme/app/labels")) {
        return [
          { id: 1, name: "agent:api" },
          { id: 2, name: "needs-qa" },
        ];
      }
      return {};
    });
    const a = adapter();
    expect((await a.listStates()).map((s) => s.name)).toEqual(["open", "closed"]);
    expect((await a.listLabels()).map((l) => l.name)).toEqual(["agent:api", "needs-qa"]);
  });
});
