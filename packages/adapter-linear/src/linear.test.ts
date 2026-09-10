import { afterEach, describe, expect, it, vi } from "vitest";
import { LinearAdapter } from "./linear.js";

const TEAM = {
  id: "team1",
  name: "Acme",
  key: "ACME",
  states: {
    nodes: [
      { id: "s-backlog", name: "Backlog", type: "backlog", position: 0 },
      { id: "s-review", name: "In Review", type: "started", position: 3 },
      { id: "s-done", name: "Done", type: "completed", position: 5 },
    ],
  },
  labels: {
    nodes: [
      { id: "l-qa", name: "needs-qa" },
      { id: "l-review", name: "needs-review" },
      { id: "l-cr", name: "changes-requested" },
    ],
  },
};

/** Route a GraphQL call to canned data by inspecting the query text. */
function install(route: (query: string, variables: Record<string, unknown>) => unknown) {
  const calls: { query: string; variables: Record<string, unknown> }[] = [];
  const mock = vi.fn(async (_url: string, init: { body: string }) => {
    const { query, variables } = JSON.parse(init.body);
    calls.push({ query, variables });
    return { json: async () => ({ data: route(query, variables) }) };
  });
  vi.stubGlobal("fetch", mock);
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const adapter = () => new LinearAdapter({ apiKey: "test", team: "Acme" });

describe("LinearAdapter.listIssues", () => {
  it("shapes issues → RawIssue (state, labels, blockedBy, order, bounces)", async () => {
    install((q) => {
      if (q.includes("teams(")) return { teams: { nodes: [TEAM] } };
      if (q.includes("issues(")) {
        return {
          issues: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                id: "i2",
                identifier: "ACME-2",
                title: "Web",
                url: "u",
                description: "",
                state: { name: "In Review", type: "started" },
                labels: { nodes: [{ name: "agent:web" }, { name: "needs-qa" }] },
                comments: { nodes: [{ body: "🔁 bounce #1 by review: x" }, { body: "note" }] },
                inverseRelations: {
                  nodes: [
                    {
                      type: "blocks",
                      issue: { id: "i1", identifier: "ACME-1", state: { name: "Done" } },
                    },
                  ],
                },
              },
            ],
          },
        };
      }
      return {};
    });

    const issues = await adapter().listIssues({ projectId: "p" });
    expect(issues).toHaveLength(1);
    const i = issues[0]!;
    expect(i.ref).toBe("ACME-2");
    expect(i.state).toBe("In Review");
    expect(i.labels).toContain("agent:web");
    expect(i.blockedBy[0]).toMatchObject({ ref: "ACME-1", state: "Done" });
    expect(i.order).toBe(2);
    expect(i.bounces).toBe(1);
  });
});

describe("LinearAdapter.transition", () => {
  it("resolves state + merges labels (keep − remove + add) into issueUpdate", async () => {
    const calls = install((q) => {
      if (q.includes("teams(")) return { teams: { nodes: [TEAM] } };
      if (q.includes("issue(id:$id){ labels")) {
        return {
          issue: {
            labels: {
              nodes: [
                { id: "l-review", name: "needs-review" },
                { id: "keep", name: "keep" },
              ],
            },
          },
        };
      }
      if (q.includes("issueUpdate")) return { issueUpdate: { success: true } };
      return {};
    });

    await adapter().transition("iss", {
      state: "In Review",
      addLabels: ["needs-qa"],
      removeLabels: ["needs-review"],
    });
    const update = calls.find((c) => c.query.includes("issueUpdate"));
    const input = (update?.variables.input ?? {}) as { stateId: string; labelIds: string[] };
    expect(input.stateId).toBe("s-review");
    expect(input.labelIds).toContain("keep"); // kept
    expect(input.labelIds).toContain("l-qa"); // added
    expect(input.labelIds).not.toContain("l-review"); // removed
  });
});

describe("LinearAdapter.addDependency", () => {
  it('records "blocker blocks issue" (correct direction)', async () => {
    const calls = install((q) => {
      if (q.includes("teams(")) return { teams: { nodes: [TEAM] } };
      if (q.includes("issueRelationCreate")) return { issueRelationCreate: { success: true } };
      return {};
    });
    await adapter().addDependency({ issueId: "A", blockedById: "B" });
    const rel = calls.find((c) => c.query.includes("issueRelationCreate"));
    expect(rel?.variables.input).toMatchObject({
      issueId: "B",
      relatedIssueId: "A",
      type: "blocks",
    });
  });
});

describe("LinearAdapter introspection", () => {
  it("lists states sorted by position and creates labels", async () => {
    const calls = install((q) => {
      if (q.includes("teams(")) return { teams: { nodes: [TEAM] } };
      if (q.includes("issueLabelCreate"))
        return { issueLabelCreate: { issueLabel: { id: "new", name: "agent:api" } } };
      return {};
    });
    const a = adapter();
    const states = await a.listStates();
    expect(states.map((s) => s.name)).toEqual(["Backlog", "In Review", "Done"]);
    const label = await a.createLabel({ name: "agent:api" });
    expect(label.name).toBe("agent:api");
    expect(calls.some((c) => c.query.includes("issueLabelCreate"))).toBe(true);
  });
});
