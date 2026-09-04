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
import { LinearGql } from "./gql.js";

export interface LinearAdapterOptions {
  /** Personal API key (https://linear.app/settings/api). Defaults to $LINEAR_API_KEY. */
  apiKey?: string;
  /** Team key or name. Defaults to $LINEAR_TEAM or "Redisco". */
  team?: string;
  /** Regex (string) marking a bounce comment; counted for escalation. */
  bounceMarker?: string;
}

interface TeamData {
  id: string;
  name: string;
  key: string;
  states: { nodes: { id: string; name: string; type: string; position: number }[] };
  labels: { nodes: { id: string; name: string }[] };
}

const ISSUE_FIELDS = `
  id identifier title url estimate description
  parent { id identifier }
  state { id name type }
  labels { nodes { id name } }
  comments { nodes { body } }
  inverseRelations { nodes { type issue { id identifier state { name type } } } }
`;

interface RawNode {
  id: string;
  identifier: string;
  title: string;
  url?: string;
  description?: string;
  state?: { name: string };
  labels: { nodes: { name: string }[] };
  comments?: { nodes: { body: string }[] };
  inverseRelations: {
    nodes: { type: string; issue?: { id: string; identifier: string; state?: { name: string } } }[];
  };
}

/** Linear implementation of the tracker port (GraphQL, headless-safe). */
export class LinearAdapter implements TrackerAdapter, TrackerIntrospection {
  readonly kind = "linear";
  private gql: LinearGql;
  private teamName: string;
  private bounceRe: RegExp;
  private _team?: TeamData;

  constructor(opts: LinearAdapterOptions = {}) {
    const apiKey = opts.apiKey ?? process.env.LINEAR_API_KEY;
    if (!apiKey) throw new Error("LinearAdapter: apiKey (or $LINEAR_API_KEY) is required");
    this.gql = new LinearGql(apiKey);
    this.teamName = opts.team ?? process.env.LINEAR_TEAM ?? "Redisco";
    this.bounceRe = new RegExp(opts.bounceMarker ?? "^\\s*🔁\\s*bounce", "i");
  }

  private async team(): Promise<TeamData> {
    if (this._team) return this._team;
    const d = await this.gql.query<{ teams: { nodes: TeamData[] } }>(
      `query($q:String!){ teams(filter:{ or:[{key:{eqIgnoreCase:$q}},{name:{eqIgnoreCase:$q}}] }){ nodes{
         id name key
         states{ nodes{ id name type position } }
         labels{ nodes{ id name } }
       } } }`,
      { q: this.teamName },
    );
    const t = d.teams.nodes[0];
    if (!t) throw new Error(`LinearAdapter: team "${this.teamName}" not found`);
    this._team = t;
    return t;
  }

  private async stateId(name: string): Promise<string> {
    const t = await this.team();
    const s = t.states.nodes.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!s) {
      throw new Error(
        `LinearAdapter: state "${name}" not found. Available: ${t.states.nodes.map((x) => x.name).join(", ")}`,
      );
    }
    return s.id;
  }

  private async labelIds(names: string[]): Promise<string[]> {
    const t = await this.team();
    return names.map((n) => {
      const l = t.labels.nodes.find((x) => x.name.toLowerCase() === n.toLowerCase());
      if (!l) throw new Error(`LinearAdapter: label "${n}" not found`);
      return l.id;
    });
  }

  async whoami(): Promise<TrackerIdentity> {
    const d = await this.gql.query<{ viewer: { id: string; name: string; email: string } }>(
      `{ viewer { id name email } }`,
    );
    const t = await this.team();
    return {
      id: d.viewer.id,
      name: d.viewer.name,
      email: d.viewer.email,
      context: { team: { id: t.id, name: t.name, key: t.key } },
    };
  }

  private shape(n: RawNode): RawIssue {
    const labels = n.labels.nodes.map((l) => l.name);
    const blockedBy = n.inverseRelations.nodes
      .filter((r) => r.type === "blocks" && r.issue)
      .map((r) => ({
        id: r.issue!.id,
        ref: r.issue!.identifier,
        state: r.issue!.state?.name ?? "Backlog",
      }));
    const bounces = (n.comments?.nodes ?? []).filter((c) =>
      this.bounceRe.test(c.body ?? ""),
    ).length;
    return {
      id: n.id,
      ref: n.identifier,
      title: n.title,
      url: n.url,
      description: n.description ?? "",
      state: n.state?.name ?? "Backlog",
      labels,
      blockedBy,
      order: Number((n.identifier.match(/(\d+)$/) ?? [])[1] ?? 0),
      bounces,
    };
  }

  async listIssues(query: { projectId: string }): Promise<RawIssue[]> {
    const t = await this.team();
    const filter = {
      and: [{ team: { id: { eq: t.id } } }, { project: { id: { eq: query.projectId } } }],
    };
    const out: RawIssue[] = [];
    let after: string | null = null;
    do {
      const d: {
        issues: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: RawNode[] };
      } = await this.gql.query(
        `query($filter:IssueFilter,$after:String){ issues(filter:$filter, first:100, after:$after){
             pageInfo{ hasNextPage endCursor } nodes{ ${ISSUE_FIELDS} } } }`,
        { filter, after },
      );
      for (const n of d.issues.nodes) out.push(this.shape(n));
      after = d.issues.pageInfo.hasNextPage ? d.issues.pageInfo.endCursor : null;
    } while (after);
    return out;
  }

  private async buildUpdateInput(issueId: string, apply: ApplyInstruction) {
    const input: { stateId?: string; labelIds?: string[] } = {};
    if (apply.state) input.stateId = await this.stateId(apply.state);
    const add = apply.addLabels ?? [];
    const remove = (apply.removeLabels ?? []).map((s) => s.toLowerCase());
    if (add.length || remove.length) {
      const cur = await this.gql.query<{
        issue: { labels: { nodes: { id: string; name: string }[] } };
      }>(`query($id:String!){ issue(id:$id){ labels{ nodes{ id name } } } }`, { id: issueId });
      const keep = cur.issue.labels.nodes
        .filter((l) => !remove.includes(l.name.toLowerCase()))
        .map((l) => l.id);
      const addIds = add.length ? await this.labelIds(add) : [];
      input.labelIds = [...new Set([...keep, ...addIds])];
    }
    return input;
  }

  async transition(issueId: string, apply: ApplyInstruction): Promise<void> {
    const input = await this.buildUpdateInput(issueId, apply);
    await this.gql.query(
      `mutation($id:String!,$input:IssueUpdateInput!){ issueUpdate(id:$id, input:$input){ success } }`,
      { id: issueId, input },
    );
  }

  async bulkTransition(issueIds: string[], apply: ApplyInstruction): Promise<void> {
    // Resolve the state once; labels are usually empty in bulk (e.g. epic-complete → Done).
    const stateId = apply.state ? await this.stateId(apply.state) : undefined;
    for (const id of issueIds) {
      const input =
        apply.addLabels?.length || apply.removeLabels?.length
          ? await this.buildUpdateInput(id, apply)
          : { stateId };
      await this.gql.query(
        `mutation($id:String!,$input:IssueUpdateInput!){ issueUpdate(id:$id, input:$input){ success } }`,
        { id, input },
      );
    }
  }

  async comment(issueId: string, body: string): Promise<void> {
    await this.gql.query(
      `mutation($input:CommentCreateInput!){ commentCreate(input:$input){ success } }`,
      { input: { issueId, body } },
    );
  }

  async createProject(input: CreateProjectInput): Promise<{ id: string; url?: string }> {
    const t = await this.team();
    const gqlInput: Record<string, unknown> = { name: input.name, teamIds: [t.id] };
    if (input.summary) gqlInput.description = input.summary;
    if (input.description) gqlInput.content = input.description;
    const d = await this.gql.query<{ projectCreate: { project: { id: string; url: string } } }>(
      `mutation($input:ProjectCreateInput!){ projectCreate(input:$input){ success project{ id name url } } }`,
      { input: gqlInput },
    );
    return { id: d.projectCreate.project.id, url: d.projectCreate.project.url };
  }

  async createIssue(input: CreateIssueInput): Promise<{ id: string; ref: string; url?: string }> {
    const t = await this.team();
    const gqlInput: Record<string, unknown> = {
      teamId: t.id,
      projectId: input.projectId,
      title: input.title,
    };
    if (input.description) gqlInput.description = input.description;
    if (input.parentId) gqlInput.parentId = input.parentId;
    if (input.estimate) gqlInput.estimate = input.estimate;
    if (input.labels?.length) gqlInput.labelIds = await this.labelIds(input.labels);
    const d = await this.gql.query<{
      issueCreate: { issue: { id: string; identifier: string; url: string } };
    }>(
      `mutation($input:IssueCreateInput!){ issueCreate(input:$input){ success issue{ id identifier url } } }`,
      { input: gqlInput },
    );
    const iss = d.issueCreate.issue;
    return { id: iss.id, ref: iss.identifier, url: iss.url };
  }

  async addDependency(input: { issueId: string; blockedById: string }): Promise<void> {
    // "issue is blocked-by blocker" ⇒ blocker blocks issue.
    await this.gql.query(
      `mutation($input:IssueRelationCreateInput!){ issueRelationCreate(input:$input){ success } }`,
      { input: { issueId: input.blockedById, relatedIssueId: input.issueId, type: "blocks" } },
    );
  }

  // --- introspection (board setup for `norma init`) -------------------------

  async listStates(): Promise<TrackerState[]> {
    const t = await this.team();
    return t.states.nodes
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ id: s.id, name: s.name, type: s.type }));
  }

  async listLabels(): Promise<TrackerLabel[]> {
    const t = await this.team();
    return t.labels.nodes.map((l) => ({ id: l.id, name: l.name }));
  }

  async createState(input: { name: string; type?: string; color?: string }): Promise<TrackerState> {
    const t = await this.team();
    const d = await this.gql.query<{
      workflowStateCreate: { workflowState: { id: string; name: string; type: string } };
    }>(
      `mutation($input:WorkflowStateCreateInput!){ workflowStateCreate(input:$input){ success workflowState{ id name type position } } }`,
      {
        input: {
          teamId: t.id,
          name: input.name,
          type: input.type ?? "started",
          color: input.color ?? "#00B8A9",
        },
      },
    );
    this._team = undefined; // cache is now stale
    const s = d.workflowStateCreate.workflowState;
    return { id: s.id, name: s.name, type: s.type };
  }

  async createLabel(input: { name: string; color?: string }): Promise<TrackerLabel> {
    const t = await this.team();
    const d = await this.gql.query<{
      issueLabelCreate: { issueLabel: { id: string; name: string } };
    }>(
      `mutation($input:IssueLabelCreateInput!){ issueLabelCreate(input:$input){ success issueLabel{ id name } } }`,
      { input: { teamId: t.id, name: input.name, color: input.color ?? "#9B51E0" } },
    );
    this._team = undefined;
    return d.issueLabelCreate.issueLabel;
  }
}
