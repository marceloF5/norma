import type { AgentRunner } from "@norma/agent-runtime";
import { type HarnessConfig, toPlanContext } from "@norma/config";
import { type ContextStore, composeHandoff } from "@norma/context";
import {
  type CompleteIntent,
  type DispatchIntent,
  type EscalateIntent,
  type Intent,
  type Phase,
  type Plan,
  type PromoteIntent,
  type QaIntent,
  type ReviewIntent,
  type ReworkIntent,
  computePlan,
} from "@norma/core";
import { type RawIssue, type TrackerAdapter, applyFor, normalize } from "@norma/tracker";

export interface OrchestratorDeps {
  config: HarnessConfig;
  tracker: TrackerAdapter;
  runner: AgentRunner;
  context?: ContextStore;
  logger?: (msg: string) => void;
  /** Literal prefix for bounce comments (must match config bounceMarker). Default "🔁 bounce". */
  bouncePrefix?: string;
}

export interface RunCycleInput {
  projectId: string;
  /** Epic slug for context-store lookups (brief/plan). */
  slug?: string;
  /** Worktree path handed to agents. */
  worktree?: string;
  /** Safety cap on loop iterations. Default 100. */
  maxSteps?: number;
  /** Plan only — no tracker writes, no agent runs. */
  dryRun?: boolean;
  /** Called once when the epic is fully released (generate report + PR upstream). */
  onComplete?: (info: { projectId: string; slug?: string; plan: Plan }) => Promise<void> | void;
}

export interface ExecutedStep {
  kind: Intent["kind"];
  ref?: string;
  batch?: string;
  verdict?: string;
  note?: string;
}

export interface CycleResult {
  steps: number;
  complete: boolean;
  finalPlan: Plan;
  executed: ExecutedStep[];
  anomalies: string[];
}

/**
 * The operator. It does NOT decide orchestration — `computePlan` does. The
 * orchestrator only: reads tracker state, normalizes it, asks the engine for the
 * next intents, runs the specialist agents for the creative work, and writes the
 * resulting phase transitions back to the tracker. Then it re-plans, to a fixed point.
 */
export class Orchestrator {
  private readonly bouncePrefix: string;
  constructor(private readonly deps: OrchestratorDeps) {
    this.bouncePrefix = deps.bouncePrefix ?? "🔁 bounce";
  }

  private log(msg: string) {
    this.deps.logger?.(msg);
  }

  private mapping() {
    return this.deps.config.phaseMapping;
  }

  /** Translate a target phase into the tracker write for it. */
  private applyOf(phase: Phase) {
    const apply = applyFor(phase, this.mapping());
    if (!apply) throw new Error(`No apply rule configured for phase "${phase}"`);
    return apply;
  }

  async runCycle(input: RunCycleInput): Promise<CycleResult> {
    const planCtx = toPlanContext(this.deps.config);
    const maxSteps = input.maxSteps ?? 100;
    const executed: ExecutedStep[] = [];
    let steps = 0;
    let lastSignature = "";
    let plan: Plan;

    for (;;) {
      const raw = await this.deps.tracker.listIssues({ projectId: input.projectId });
      const rawById = new Map(raw.map((r) => [r.id, r]));
      const tasks = normalize(raw, this.mapping());
      plan = computePlan(tasks, planCtx);

      if (plan.anomalies.length) for (const a of plan.anomalies) this.log(`⚠️  ${a}`);

      if (plan.actionCount === 0) break;
      if (steps >= maxSteps) {
        this.log(`reached maxSteps (${maxSteps}); stopping`);
        break;
      }
      const signature = JSON.stringify(plan.actions);
      if (signature === lastSignature) {
        this.log("plan did not change after execution — stopping to avoid a spin loop");
        break;
      }
      lastSignature = signature;

      for (const action of plan.actions) {
        if (action.kind === "complete") {
          this.log("epic complete — all tasks released");
          if (!input.dryRun)
            await input.onComplete?.({ projectId: input.projectId, slug: input.slug, plan });
          executed.push({ kind: "complete" });
          continue;
        }
        const step = await this.execute(action, { input, rawById });
        executed.push(step);
      }
      steps++;
    }

    return {
      steps,
      complete: plan.complete,
      finalPlan: plan,
      executed,
      anomalies: plan.anomalies,
    };
  }

  private async execute(
    action: Exclude<Intent, CompleteIntent>,
    ctx: { input: RunCycleInput; rawById: Map<string, RawIssue> },
  ): Promise<ExecutedStep> {
    const { input } = ctx;
    const dry = input.dryRun ?? false;
    const t = this.deps.tracker;

    switch (action.kind) {
      case "promote": {
        const a = action as PromoteIntent;
        this.log(`promote ${a.task.ref} → ready`);
        if (!dry) await t.transition(a.task.id, this.applyOf(a.to.toPhase));
        return { kind: "promote", ref: a.task.ref };
      }

      case "dispatch": {
        const a = action as DispatchIntent;
        this.log(`dispatch ${a.task.ref} → ${a.role}`);
        if (dry) return { kind: "dispatch", ref: a.task.ref, note: "dry-run" };
        await t.transition(a.task.id, this.applyOf(a.onStart.toPhase));
        const context = await this.handoff("dispatch", a.task, ctx);
        const out = await this.deps.runner.run({
          kind: "dispatch",
          role: a.role,
          task: a.task,
          worktree: input.worktree,
          context,
        });
        if (out.verdict === "ok") {
          await t.transition(a.task.id, this.applyOf(a.onDone.toPhase));
        } else {
          await t.comment(a.task.id, `dispatch could not complete: ${out.summary}`);
        }
        return { kind: "dispatch", ref: a.task.ref, verdict: out.verdict };
      }

      case "review": {
        const a = action as ReviewIntent;
        this.log(`review ${a.task.ref}`);
        if (dry) return { kind: "review", ref: a.task.ref, note: "dry-run" };
        const context = await this.handoff("review", a.task, ctx);
        const out = await this.deps.runner.run({
          kind: "review",
          role: a.role,
          task: a.task,
          worktree: input.worktree,
          context,
        });
        if (out.verdict === "pass") {
          await t.transition(a.task.id, this.applyOf(a.onPass.toPhase));
        } else {
          await t.transition(a.task.id, this.applyOf(a.onFail.toPhase));
          await t.comment(a.task.id, `${this.bouncePrefix} by review: ${out.summary}`);
        }
        return { kind: "review", ref: a.task.ref, verdict: out.verdict };
      }

      case "rework": {
        const a = action as ReworkIntent;
        this.log(`rework ${a.task.ref} (bounces ${a.bounces})`);
        if (dry) return { kind: "rework", ref: a.task.ref, note: "dry-run" };
        const context = await this.handoff("rework", a.task, ctx);
        const out = await this.deps.runner.run({
          kind: "rework",
          role: a.role,
          task: a.task,
          bounces: a.bounces,
          worktree: input.worktree,
          context,
        });
        if (out.verdict === "ok") {
          await t.transition(a.task.id, this.applyOf(a.onDone.toPhase));
        } else {
          await t.comment(a.task.id, `rework could not complete: ${out.summary}`);
        }
        return { kind: "rework", ref: a.task.ref, verdict: out.verdict };
      }

      case "escalate": {
        const a = action as EscalateIntent;
        this.log(`escalate ${a.task.ref} (bounces ${a.bounces})`);
        if (dry) return { kind: "escalate", ref: a.task.ref, note: "dry-run" };
        const context = await this.handoff("escalate", a.task, ctx);
        const out = await this.deps.runner.run({
          kind: "escalate",
          role: a.role,
          task: a.task,
          bounces: a.bounces,
          worktree: input.worktree,
          context,
        });
        await t.comment(a.task.id, `escalation: ${out.summary}`);
        return { kind: "escalate", ref: a.task.ref, verdict: out.verdict };
      }

      case "qa": {
        const a = action as QaIntent;
        this.log(`qa ${a.batch} (${a.tasks.length} tasks)`);
        if (dry) return { kind: "qa", batch: a.batch, note: "dry-run" };
        const context = await this.handoffBatch(a, ctx);
        const out = await this.deps.runner.run({
          kind: "qa",
          role: a.role,
          tasks: a.tasks,
          batch: a.batch,
          worktree: input.worktree,
          context,
        });
        if (out.verdict === "approve") {
          for (const task of a.tasks)
            await t.transition(task.id, this.applyOf(a.onApprove.toPhase));
          return { kind: "qa", batch: a.batch, verdict: "approve" };
        }
        // bounce: only the named tasks go back; the rest wait at needs-qa.
        const bounced = out.bounced ?? [];
        for (const b of bounced) {
          const task = a.tasks.find((x) => x.ref === b.ref);
          if (!task) continue;
          await t.transition(task.id, this.applyOf(a.onBounce.toPhase));
          await t.comment(task.id, `${this.bouncePrefix} by QA: ${b.defect}`);
        }
        return {
          kind: "qa",
          batch: a.batch,
          verdict: "bounce",
          note: bounced.map((b) => b.ref).join(", "),
        };
      }
    }
  }

  private async handoff(
    stage: "dispatch" | "review" | "rework" | "escalate",
    task: { id: string; ref: string; title: string; owner: string | null; url?: string },
    ctx: { input: RunCycleInput; rawById: Map<string, RawIssue> },
  ): Promise<string> {
    const { input, rawById } = ctx;
    const [brief, plan] = input.slug
      ? await Promise.all([
          this.deps.context?.readBrief(input.slug) ?? null,
          this.deps.context?.readPlan(input.slug) ?? null,
        ])
      : [null, null];
    const raw = rawById.get(task.id);
    return composeHandoff({
      stage,
      brief,
      plan,
      worktree: input.worktree,
      tasks: [{ ...task, description: raw?.description }],
    });
  }

  private async handoffBatch(
    a: QaIntent,
    ctx: { input: RunCycleInput; rawById: Map<string, RawIssue> },
  ): Promise<string> {
    const { input, rawById } = ctx;
    const [brief, plan] = input.slug
      ? await Promise.all([
          this.deps.context?.readBrief(input.slug) ?? null,
          this.deps.context?.readPlan(input.slug) ?? null,
        ])
      : [null, null];
    return composeHandoff({
      stage: "qa",
      brief,
      plan,
      batch: a.batch,
      worktree: input.worktree,
      tasks: a.tasks.map((t) => ({ ...t, description: rawById.get(t.id)?.description })),
    });
  }
}
