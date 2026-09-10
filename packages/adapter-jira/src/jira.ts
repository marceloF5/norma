import type {
  ApplyInstruction,
  CreateIssueInput,
  CreateProjectInput,
  RawIssue,
  TrackerAdapter,
  TrackerIdentity,
  TrackerIntrospection,
  TrackerLabel,
  TrackerState,
} from "@norma/tracker";
import { JiraRest, adf, adfToText } from "./rest.js";

export interface JiraAdapterOptions {
  /** Site base URL, e.g. https://acme.atlassian.net. Defaults to $JIRA_BASE_URL. */
  baseUrl?: string;
  /** Account email. Defaults to $JIRA_EMAIL. */
  email?: string;
  /** API token (https://id.atlassian.com/manage/api-tokens). Defaults to $JIRA_API_TOKEN. */
  apiToken?: string;
  /** Project key used when creating issues / listing by project. Defaults to $JIRA_PROJECT. */
  projectKey?: string;
  /** Issue type for created tasks (default "Task"). */
  taskIssueType?: string;
  /** Issue type used to represent an epic (default "Epic"). */
  epicIssueType?: string;
  /** Regex (string) marking a bounce comment; counted for escalation. */
  bounceMarker?: string;
}

interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    labels: string[];
    status?: { name: string };
    issuelinks?: JiraLink[];
    comment?: { comments: { body: unknown }[] };
  };
}

interface JiraLink {
  type: { name: string; inward: string; outward: string };
  inwardIssue?: { id: string; key: string; fields?: { status?: { name: string } } };
  outwardIssue?: { id: string; key: string; fields?: { status?: { name: string } } };
}

const FIELDS = ["summary", "labels", "status", "issuelinks", "comment"];
const isIssueKey = (s: string) => /^[A-Z][A-Z0-9]+-\d+$/.test(s);

/** Jira Cloud implementation of the tracker port. */
export class JiraAdapter implements TrackerAdapter, TrackerIntrospection {
  readonly kind = "jira";
  private rest: JiraRest;
  private projectKey?: string;
  private taskType: string;
  private epicType: string;
  private bounceRe: RegExp;

  constructor(opts: JiraAdapterOptions = {}) {
    const baseUrl = opts.baseUrl ?? process.env.JIRA_BASE_URL;
    const email = opts.email ?? process.env.JIRA_EMAIL;
    const apiToken = opts.apiToken ?? process.env.JIRA_API_TOKEN;
    if (!baseUrl || !email || !apiToken) {
      throw new Error(
        "JiraAdapter: baseUrl, email and apiToken are required (or $JIRA_BASE_URL/$JIRA_EMAIL/$JIRA_API_TOKEN)",
      );
    }
    this.rest = new JiraRest(baseUrl, email, apiToken);
    this.projectKey = opts.projectKey ?? process.env.JIRA_PROJECT;
    this.taskType = opts.taskIssueType ?? "Task";
    this.epicType = opts.epicIssueType ?? "Epic";
    this.bounceRe = new RegExp(opts.bounceMarker ?? "🔁\\s*bounce", "i");
  }

  async whoami(): Promise<TrackerIdentity> {
    const me = await this.rest.get<{
      accountId: string;
      displayName: string;
      emailAddress?: string;
    }>("/rest/api/3/myself");
    return {
      id: me.accountId,
      name: me.displayName,
      email: me.emailAddress,
      context: { kind: this.kind, projectKey: this.projectKey },
    };
  }

  private shape(issue: JiraIssue): RawIssue {
    const blockedBy = (issue.fields.issuelinks ?? [])
      .filter((l) => l.type.name.toLowerCase() === "blocks" && l.inwardIssue)
      .map((l) => ({
        id: l.inwardIssue!.id,
        ref: l.inwardIssue!.key,
        state: l.inwardIssue!.fields?.status?.name ?? "Backlog",
      }));
    const bounces = (issue.fields.comment?.comments ?? []).filter((c) =>
      this.bounceRe.test(JSON.stringify(c.body ?? "")),
    ).length;
    return {
      id: issue.id,
      ref: issue.key,
      title: issue.fields.summary,
      url: undefined,
      state: issue.fields.status?.name ?? "Backlog",
      labels: issue.fields.labels ?? [],
      blockedBy,
      order: Number((issue.key.match(/(\d+)$/) ?? [])[1] ?? 0),
      bounces,
    };
  }

  async listIssues(query: { projectId: string }): Promise<RawIssue[]> {
    // projectId may be a Jira project key OR an epic issue key.
    const jql = isIssueKey(query.projectId)
      ? `parent = "${query.projectId}" ORDER BY created ASC`
      : `project = "${query.projectId}" ORDER BY created ASC`;
    const out: RawIssue[] = [];
    let nextPageToken: string | undefined;
    do {
      const page = await this.rest.post<{ issues: JiraIssue[]; nextPageToken?: string }>(
        "/rest/api/3/search/jql",
        { jql, fields: FIELDS, maxResults: 100, nextPageToken },
      );
      for (const i of page.issues ?? []) out.push(this.shape(i));
      nextPageToken = page.nextPageToken;
    } while (nextPageToken);
    return out;
  }

  private async findTransitionId(issueId: string, targetState: string): Promise<string> {
    const d = await this.rest.get<{
      transitions: { id: string; name: string; to: { name: string } }[];
    }>(`/rest/api/3/issue/${issueId}/transitions`);
    const t = d.transitions.find((x) => x.to.name.toLowerCase() === targetState.toLowerCase());
    if (!t) {
      throw new Error(
        `JiraAdapter: no transition to "${targetState}" from ${issueId}. Available: ${d.transitions
          .map((x) => x.to.name)
          .join(", ")}`,
      );
    }
    return t.id;
  }

  async transition(issueId: string, apply: ApplyInstruction): Promise<void> {
    if (apply.addLabels?.length || apply.removeLabels?.length) {
      const update = {
        labels: [
          ...(apply.addLabels ?? []).map((l) => ({ add: l })),
          ...(apply.removeLabels ?? []).map((l) => ({ remove: l })),
        ],
      };
      await this.rest.put(`/rest/api/3/issue/${issueId}`, { update });
    }
    if (apply.state) {
      const transitionId = await this.findTransitionId(issueId, apply.state);
      await this.rest.post(`/rest/api/3/issue/${issueId}/transitions`, {
        transition: { id: transitionId },
      });
    }
  }

  async bulkTransition(issueIds: string[], apply: ApplyInstruction): Promise<void> {
    for (const id of issueIds) await this.transition(id, apply);
  }

  async comment(issueId: string, body: string): Promise<void> {
    await this.rest.post(`/rest/api/3/issue/${issueId}/comment`, { body: adf(body) });
  }

  async listComments(issueId: string): Promise<string[]> {
    const d = await this.rest.get<{ comments: { body: unknown }[] }>(
      `/rest/api/3/issue/${issueId}/comment`,
    );
    return (d.comments ?? []).map((c) => adfToText(c.body));
  }

  async createProject(input: CreateProjectInput): Promise<{ id: string; url?: string }> {
    // Represent an epic as a Jira Epic issue; its key becomes the "projectId".
    if (!this.projectKey) throw new Error("JiraAdapter.createProject: projectKey is required");
    const created = await this.rest.post<{ id: string; key: string }>("/rest/api/3/issue", {
      fields: {
        project: { key: this.projectKey },
        issuetype: { name: this.epicType },
        summary: input.name,
        ...(input.description ? { description: adf(input.description) } : {}),
      },
    });
    return { id: created.key, url: undefined };
  }

  async createIssue(input: CreateIssueInput): Promise<{ id: string; ref: string; url?: string }> {
    if (!this.projectKey) throw new Error("JiraAdapter.createIssue: projectKey is required");
    const fields: Record<string, unknown> = {
      project: { key: this.projectKey },
      issuetype: { name: this.taskType },
      summary: input.title,
    };
    if (input.description) fields.description = adf(input.description);
    if (input.labels?.length) fields.labels = input.labels;
    // parentId carries either the epic key or a parent task key.
    if (input.parentId) fields.parent = { key: input.parentId };
    const created = await this.rest.post<{ id: string; key: string }>("/rest/api/3/issue", {
      fields,
    });
    return { id: created.id, ref: created.key };
  }

  async addDependency(input: { issueId: string; blockedById: string }): Promise<void> {
    // issue is blocked-by blocker ⇒ blocker "blocks" issue.
    await this.rest.post("/rest/api/3/issueLink", {
      type: { name: "Blocks" },
      inwardIssue: { id: input.issueId }, // "is blocked by"
      outwardIssue: { id: input.blockedById }, // "blocks"
    });
  }

  // --- introspection (read-only; Jira status/label creation is admin-managed) ---

  async listStates(): Promise<TrackerState[]> {
    if (!this.projectKey) throw new Error("JiraAdapter.listStates: projectKey is required");
    // Statuses are grouped per issue type; flatten to a unique set.
    const groups = await this.rest.get<
      { statuses: { id: string; name: string; statusCategory?: { key: string } }[] }[]
    >(`/rest/api/3/project/${this.projectKey}/statuses`);
    const seen = new Map<string, TrackerState>();
    for (const g of groups) {
      for (const s of g.statuses ?? []) {
        if (!seen.has(s.name))
          seen.set(s.name, { id: s.id, name: s.name, type: s.statusCategory?.key });
      }
    }
    return [...seen.values()];
  }

  async listLabels(): Promise<TrackerLabel[]> {
    const out: TrackerLabel[] = [];
    let startAt = 0;
    for (;;) {
      const page = await this.rest.get<{ values: string[]; isLast: boolean; total: number }>(
        `/rest/api/3/label?startAt=${startAt}&maxResults=1000`,
      );
      for (const name of page.values ?? []) out.push({ id: name, name });
      if (page.isLast || !page.values?.length) break;
      startAt += page.values.length;
    }
    return out;
  }
}
