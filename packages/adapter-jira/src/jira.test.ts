import { afterEach, describe, expect, it, vi } from "vitest";
import { JiraAdapter } from "./jira.js";

interface Call {
  method: string;
  path: string;
  body?: unknown;
}

/** Route a Jira REST call to canned data by method + path. */
function install(route: (method: string, path: string, body?: unknown) => unknown) {
  const calls: Call[] = [];
  const mock = vi.fn(async (url: string, init: { method: string; body?: string }) => {
    const path = url.replace("https://acme.atlassian.net", "");
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

const adapter = () =>
  new JiraAdapter({
    baseUrl: "https://acme.atlassian.net",
    email: "e@x.com",
    apiToken: "t",
    projectKey: "ENG",
  });

describe("JiraAdapter.listIssues", () => {
  it("shapes issues → RawIssue (status, labels, blockedBy from inwardIssue, bounces)", async () => {
    install((method, path) => {
      if (method === "POST" && path === "/rest/api/3/search/jql") {
        return {
          issues: [
            {
              id: "10002",
              key: "ENG-2",
              fields: {
                summary: "Web",
                labels: ["agent:web", "needs-qa"],
                status: { name: "In Review" },
                issuelinks: [
                  {
                    type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
                    inwardIssue: {
                      id: "10001",
                      key: "ENG-1",
                      fields: { status: { name: "Done" } },
                    },
                  },
                ],
                comment: {
                  comments: [{ body: { content: [{ content: [{ text: "🔁 bounce by QA" }] }] } }],
                },
              },
            },
          ],
        };
      }
      return {};
    });

    const issues = await adapter().listIssues({ projectId: "ENG" });
    const i = issues[0]!;
    expect(i.ref).toBe("ENG-2");
    expect(i.state).toBe("In Review");
    expect(i.labels).toContain("needs-qa");
    expect(i.blockedBy[0]).toMatchObject({ ref: "ENG-1", state: "Done" });
    expect(i.order).toBe(2);
    expect(i.bounces).toBe(1);
  });
});

describe("JiraAdapter.transition", () => {
  it("updates labels then finds + posts the transition to the target status", async () => {
    const calls = install((method, path) => {
      if (method === "PUT" && path === "/rest/api/3/issue/ENG-2") return undefined;
      if (method === "GET" && path.includes("/transitions")) {
        return { transitions: [{ id: "31", name: "Review", to: { name: "In Review" } }] };
      }
      if (method === "POST" && path.endsWith("/transitions")) return undefined;
      return {};
    });

    await adapter().transition("ENG-2", {
      state: "In Review",
      addLabels: ["needs-qa"],
      removeLabels: ["needs-review"],
    });
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.body).toMatchObject({
      update: { labels: [{ add: "needs-qa" }, { remove: "needs-review" }] },
    });
    const post = calls.find((c) => c.method === "POST" && c.path.endsWith("/transitions"));
    expect(post?.body).toMatchObject({ transition: { id: "31" } });
  });
});

describe("JiraAdapter.addDependency", () => {
  it("creates a Blocks link (inward = blocked issue, outward = blocker)", async () => {
    const calls = install(() => undefined);
    await adapter().addDependency({ issueId: "A", blockedById: "B" });
    const link = calls.find((c) => c.path === "/rest/api/3/issueLink");
    expect(link?.body).toMatchObject({
      type: { name: "Blocks" },
      inwardIssue: { id: "A" },
      outwardIssue: { id: "B" },
    });
  });
});

describe("JiraAdapter introspection", () => {
  it("lists unique statuses and paginates labels", async () => {
    install((method, path) => {
      if (path.includes("/statuses")) {
        return [
          {
            statuses: [
              { id: "1", name: "To Do", statusCategory: { key: "new" } },
              { id: "3", name: "Done", statusCategory: { key: "done" } },
            ],
          },
          { statuses: [{ id: "1", name: "To Do", statusCategory: { key: "new" } }] },
        ];
      }
      if (path.startsWith("/rest/api/3/label"))
        return { values: ["needs-qa", "agent:api"], isLast: true, total: 2 };
      return {};
    });
    const a = adapter();
    const states = await a.listStates();
    expect(states.map((s) => s.name)).toEqual(["To Do", "Done"]); // deduped
    const labels = await a.listLabels();
    expect(labels.map((l) => l.name)).toEqual(["needs-qa", "agent:api"]);
  });
});
