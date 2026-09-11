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
import { GhRest, GitHubError } from "./rest.js";

export interface GitHubAdapterOptions {
  /** "owner/repo". Defaults to $GITHUB_REPO. */
  repo?: string;
  /** Token with repo scope. Defaults to $GITHUB_TOKEN or $GH_TOKEN. */
  token?: string;
  /** Regex (string) marking a bounce comment; counted for escalation. */
  bounceMarker?: string;
}

interface GhIssue {
  number: number;
  title: string;
  state: "open" | "closed";
  body?: string;
  html_url?: string;
  labels: { name: string }[];
  comments: number;
}

const BLOCKED_BY = /^blocked-by:(\d+)$/i;

/**
 * GitHub Issues implementation of the tracker port. An epic = a **milestone**;
 * phases are carried in labels (GitHub has only open/closed), and the dependency
 * DAG is encoded as `blocked-by:<number>` labels (GitHub Issues has no native
 * blockers). Use the `github` config preset, whose phaseMapping matches this.
 */
export class GitHubAdapter implements TrackerAdapter, TrackerIntrospection {
  readonly kind = "github";
  private rest: GhRest;
  private owner: string;
  private repo: string;
  private bounceRe: RegExp;

  constructor(opts: GitHubAdapterOptions = {}) {
    const token = opts.token ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
    const repo = opts.repo ?? process.env.GITHUB_REPO;
    if (!token) throw new Error("GitHubAdapter: token (or $GITHUB_TOKEN/$GH_TOKEN) is required");
    if (!repo || !repo.includes("/"))
      throw new Error('GitHubAdapter: repo "owner/repo" is required');
    this.rest = new GhRest(token);
    const [owner, name] = repo.split("/");
    this.owner = owner as string;
    this.repo = name as string;
    this.bounceRe = new RegExp(opts.bounceMarker ?? "🔁\\s*bounce", "i");
  }

  private base() {
    return `/repos/${this.owner}/${this.repo}`;
  }

  async whoami(): Promise<TrackerIdentity> {
    const me = await this.rest.request<{ id: number; login: string; name?: string }>(
      "GET",
      "/user",
    );
    return {
      id: String(me.id),
      name: me.name ?? me.login,
      context: { repo: `${this.owner}/${this.repo}` },
    };
  }

  async listIssues(query: { projectId: string }): Promise<RawIssue[]> {
    const milestone = query.projectId;
    const raw: GhIssue[] = [];
    for (let page = 1; ; page++) {
      const batch = await this.rest.request<GhIssue[]>(
        "GET",
        `${this.base()}/issues?milestone=${encodeURIComponent(milestone)}&state=all&per_page=100&page=${page}`,
      );
      raw.push(...batch);
      if (batch.length < 100) break;
    }
    const stateByNumber = new Map(raw.map((i) => [i.number, i.state]));
    const labelsByNumber = new Map(raw.map((i) => [i.number, i.labels.map((l) => l.name)]));
    const out: RawIssue[] = [];
    for (const i of raw) {
      const labels = i.labels.map((l) => l.name);
      const blockedBy = labels
        .map((l) => l.match(BLOCKED_BY))
        .filter((m): m is RegExpMatchArray => m !== null)
        .map((m) => {
          const num = Number(m[1]);
          // Phases are label-driven on GitHub, so the blocker must carry its labels
          // for correct dep-done classification.
          return {
            id: String(num),
            ref: `#${num}`,
            state: stateByNumber.get(num) ?? "open",
            labels: labelsByNumber.get(num) ?? [],
          };
        });
      out.push({
        id: String(i.number),
        ref: `#${i.number}`,
        title: i.title,
        url: i.html_url,
        description: i.body ?? "",
        state: i.state,
        labels,
        blockedBy,
        order: i.number,
        bounces: i.comments > 0 ? await this.countBounces(i.number) : 0,
      });
    }
    return out;
  }

  private async countBounces(n: number): Promise<number> {
    const comments = await this.listComments(String(n));
    return comments.filter((c) => this.bounceRe.test(c)).length;
  }

  async transition(issueId: string, apply: ApplyInstruction): Promise<void> {
    const cur = await this.rest.request<GhIssue>("GET", `${this.base()}/issues/${issueId}`);
    const remove = new Set((apply.removeLabels ?? []).map((l) => l.toLowerCase()));
    const labels = cur.labels.map((l) => l.name).filter((l) => !remove.has(l.toLowerCase()));
    for (const l of apply.addLabels ?? [])
      if (!labels.some((x) => x.toLowerCase() === l.toLowerCase())) labels.push(l);
    const patch: Record<string, unknown> = { labels };
    if (apply.state) patch.state = apply.state.toLowerCase() === "closed" ? "closed" : "open";
    await this.rest.request("PATCH", `${this.base()}/issues/${issueId}`, patch);
  }

  async bulkTransition(issueIds: string[], apply: ApplyInstruction): Promise<void> {
    for (const id of issueIds) await this.transition(id, apply);
  }

  async comment(issueId: string, body: string): Promise<void> {
    await this.rest.request("POST", `${this.base()}/issues/${issueId}/comments`, { body });
  }

  async listComments(issueId: string): Promise<string[]> {
    const comments = await this.rest.request<{ body: string }[]>(
      "GET",
      `${this.base()}/issues/${issueId}/comments?per_page=100`,
    );
    return comments.map((c) => c.body ?? "");
  }

  async createProject(input: CreateProjectInput): Promise<{ id: string; url?: string }> {
    const ms = await this.rest.request<{ number: number; html_url?: string }>(
      "POST",
      `${this.base()}/milestones`,
      { title: input.name, description: input.summary ?? input.description },
    );
    return { id: String(ms.number), url: ms.html_url };
  }

  async createIssue(input: CreateIssueInput): Promise<{ id: string; ref: string; url?: string }> {
    if (input.labels?.length) for (const l of input.labels) await this.ensureLabel(l);
    const created = await this.rest.request<{ number: number; html_url?: string }>(
      "POST",
      `${this.base()}/issues`,
      {
        title: input.title,
        body: input.description,
        labels: input.labels ?? [],
        milestone: Number(input.projectId),
      },
    );
    return { id: String(created.number), ref: `#${created.number}`, url: created.html_url };
  }

  async addDependency(input: { issueId: string; blockedById: string }): Promise<void> {
    const label = `blocked-by:${input.blockedById}`;
    await this.ensureLabel(label);
    await this.rest.request("POST", `${this.base()}/issues/${input.issueId}/labels`, {
      labels: [label],
    });
  }

  // --- introspection -------------------------------------------------------

  async listStates(): Promise<TrackerState[]> {
    return [
      { id: "open", name: "open", type: "started" },
      { id: "closed", name: "closed", type: "completed" },
    ];
  }

  async listLabels(): Promise<TrackerLabel[]> {
    const out: TrackerLabel[] = [];
    for (let page = 1; ; page++) {
      const batch = await this.rest.request<{ id: number; name: string }[]>(
        "GET",
        `${this.base()}/labels?per_page=100&page=${page}`,
      );
      for (const l of batch) out.push({ id: String(l.id), name: l.name });
      if (batch.length < 100) break;
    }
    return out;
  }

  async createLabel(input: { name: string; color?: string }): Promise<TrackerLabel> {
    return this.ensureLabel(input.name, input.color);
  }

  private async ensureLabel(name: string, color = "ededed"): Promise<TrackerLabel> {
    try {
      const l = await this.rest.request<{ id: number; name: string }>(
        "POST",
        `${this.base()}/labels`,
        {
          name,
          color,
        },
      );
      return { id: String(l.id), name: l.name };
    } catch (e) {
      if (e instanceof GitHubError && e.status === 422) return { id: name, name }; // already exists
      throw e;
    }
  }
}
