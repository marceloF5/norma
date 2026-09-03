import type { TrackerAdapter } from "./port.js";
import type {
  ApplyInstruction,
  CreateIssueInput,
  CreateProjectInput,
  RawIssue,
  TrackerIdentity,
} from "./types.js";

interface MemoryProject {
  id: string;
  name: string;
  url: string;
}

/**
 * A fully in-memory tracker — the reference adapter. No network, deterministic,
 * ideal for orchestrator tests and `norma plan` demos. It stores raw issues
 * (state names + labels) exactly like a real tracker and mutates them on
 * `transition`, so the same normalizer + engine path is exercised end-to-end.
 */
export class MemoryTracker implements TrackerAdapter {
  readonly kind = "memory";
  private issues = new Map<string, RawIssue>();
  private projects = new Map<string, MemoryProject>();
  readonly comments = new Map<string, string[]>();
  private seq = 0;
  private prefix: string;
  private bounceRe: RegExp;

  constructor(
    opts: {
      prefix?: string;
      seed?: RawIssue[];
      projects?: MemoryProject[];
      bounceMarker?: string;
    } = {},
  ) {
    this.prefix = opts.prefix ?? "MEM";
    this.bounceRe = new RegExp(opts.bounceMarker ?? "🔁\\s*bounce", "i");
    for (const p of opts.projects ?? []) this.projects.set(p.id, p);
    for (const i of opts.seed ?? []) {
      this.issues.set(i.id, { ...i, labels: [...i.labels], blockedBy: [...i.blockedBy] });
      const n = Number((i.ref.match(/(\d+)$/) ?? [])[1] ?? 0);
      if (n > this.seq) this.seq = n;
    }
  }

  async whoami(): Promise<TrackerIdentity> {
    return { id: "memory-user", name: "Memory User", context: { kind: this.kind } };
  }

  async listIssues(query: { projectId: string }): Promise<RawIssue[]> {
    // `projectId` is carried on the raw issue via description-less convention:
    // the memory store keys everything to one namespace, so we return all seeded
    // issues (tests seed one project at a time). Real adapters filter by project.
    void query;
    return [...this.issues.values()].map((i) => ({
      ...i,
      labels: [...i.labels],
      blockedBy: i.blockedBy.map((b) => ({ ...b })),
      bounces: (this.comments.get(i.id) ?? []).filter((c) => this.bounceRe.test(c)).length,
    }));
  }

  private mutate(issueId: string, apply: ApplyInstruction) {
    const issue = this.issues.get(issueId);
    if (!issue) throw new Error(`MemoryTracker: unknown issue ${issueId}`);
    if (apply.state) issue.state = apply.state;
    const remove = new Set((apply.removeLabels ?? []).map((l) => l.toLowerCase()));
    issue.labels = issue.labels.filter((l) => !remove.has(l.toLowerCase()));
    for (const l of apply.addLabels ?? []) {
      if (!issue.labels.some((x) => x.toLowerCase() === l.toLowerCase())) issue.labels.push(l);
    }
    // keep blocker snapshots consistent for other issues that depend on this one
    for (const other of this.issues.values()) {
      for (const b of other.blockedBy) if (b.id === issueId) b.state = issue.state;
    }
  }

  async transition(issueId: string, apply: ApplyInstruction): Promise<void> {
    this.mutate(issueId, apply);
  }

  async bulkTransition(issueIds: string[], apply: ApplyInstruction): Promise<void> {
    for (const id of issueIds) this.mutate(id, apply);
  }

  async comment(issueId: string, body: string): Promise<void> {
    const arr = this.comments.get(issueId) ?? [];
    arr.push(body);
    this.comments.set(issueId, arr);
  }

  async createProject(input: CreateProjectInput): Promise<{ id: string; url?: string }> {
    const id = `proj-${this.projects.size + 1}`;
    const url = `memory://project/${id}`;
    this.projects.set(id, { id, name: input.name, url });
    return { id, url };
  }

  async createIssue(input: CreateIssueInput): Promise<{ id: string; ref: string; url?: string }> {
    const n = ++this.seq;
    const id = `iss-${n}`;
    const ref = `${this.prefix}-${n}`;
    this.issues.set(id, {
      id,
      ref,
      title: input.title,
      description: input.description,
      url: `memory://issue/${ref}`,
      state: "Backlog",
      labels: [...(input.labels ?? [])],
      blockedBy: [],
      order: n,
      bounces: 0,
    });
    return { id, ref, url: `memory://issue/${ref}` };
  }

  async addDependency(input: { issueId: string; blockedById: string }): Promise<void> {
    const issue = this.issues.get(input.issueId);
    const blocker = this.issues.get(input.blockedById);
    if (!issue || !blocker) throw new Error("MemoryTracker: addDependency on unknown issue");
    if (!issue.blockedBy.some((b) => b.id === blocker.id)) {
      issue.blockedBy.push({ id: blocker.id, ref: blocker.ref, state: blocker.state });
    }
  }
}
