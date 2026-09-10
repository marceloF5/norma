import type { EpicPlan, EpicTask, NormaConfig } from "@norma/config";
import { type TrackerAdapter, supportsIntrospection } from "@norma/tracker";

/** The owner + batch labels a task carries, derived from the config's prefixes. */
export function taskLabels(task: EpicTask, config: NormaConfig): string[] {
  const labels = [`${config.phaseMapping.owner.fromLabelPrefix}${task.owner}`];
  if (task.batch) labels.push(`${config.phaseMapping.batch.fromLabelPrefix}${task.batch}`);
  return labels;
}

/** Every distinct routing label a plan needs to exist on the board. */
export function labelsForPlan(plan: EpicPlan, config: NormaConfig): string[] {
  return [...new Set(plan.tasks.flatMap((t) => taskLabels(t, config)))];
}

/** The instruction given to the planner agent; it must WRITE the plan JSON to `outPath`. */
export function buildPlannerPrompt(brief: string, config: NormaConfig, outPath: string): string {
  const workers = config.policy.workerTypes.join(" | ");
  return [
    "You are the planner. Decompose the demand below into a tracker-neutral epic plan.",
    "",
    "## Demand",
    brief.trim(),
    "",
    "## Rules",
    `- Each task has an owner (worker lane): one of [${workers}].`,
    "- Prefer few tasks; a shallow dependency DAG; each task a single cohesive unit.",
    "- Give every task tight acceptance criteria in its description.",
    "- Group tasks into qa-batches (the minimum set testable together).",
    "- NEVER put a blocking edge between two SAME-owner tasks in the SAME qa-batch (deadlock).",
    "",
    "## Output — write EXACTLY this JSON to the file, nothing else:",
    `File path: ${outPath}`,
    "Schema:",
    JSON.stringify(
      {
        name: "<epic name>",
        slug: "<optional-kebab>",
        brief: "<one-paragraph summary>",
        tasks: [
          {
            id: "<local-id>",
            title: "<task title>",
            owner: `<${workers}>`,
            description: "<scope + acceptance criteria>",
            batch: "<qa-batch key, e.g. 1>",
            blockedBy: ["<local-id>"],
          },
        ],
      },
      null,
      2,
    ),
  ].join("\n");
}

export interface MaterializeResult {
  projectId: string;
  url?: string;
  created: { localId: string; id: string; ref: string; title: string }[];
}

/**
 * Create the project, its issues (with owner/batch labels), and the dependency
 * DAG in the tracker. Provisions any missing routing labels first when the
 * adapter supports it (Linear); freeform-label trackers (Jira) need no setup.
 */
export async function materializeEpic(
  plan: EpicPlan,
  adapter: TrackerAdapter,
  config: NormaConfig,
): Promise<MaterializeResult> {
  // 1) ensure routing labels exist (best-effort; only where supported).
  if (supportsIntrospection(adapter) && adapter.createLabel) {
    const have = new Set((await adapter.listLabels()).map((l) => l.name.toLowerCase()));
    for (const label of labelsForPlan(plan, config)) {
      if (!have.has(label.toLowerCase())) await adapter.createLabel({ name: label });
    }
  }

  // 2) create the project.
  const project = await adapter.createProject({
    name: plan.name,
    summary: plan.brief,
    description: plan.description,
  });

  // 3) create the issues, remembering local-id → tracker id.
  const created: MaterializeResult["created"] = [];
  const idByLocal = new Map<string, string>();
  for (const task of plan.tasks) {
    const issue = await adapter.createIssue({
      projectId: project.id,
      title: task.title,
      description: task.description,
      labels: taskLabels(task, config),
      estimate: task.estimate,
    });
    idByLocal.set(task.id, issue.id);
    created.push({ localId: task.id, id: issue.id, ref: issue.ref, title: task.title });
  }

  // 4) wire the dependency DAG.
  for (const task of plan.tasks) {
    for (const dep of task.blockedBy) {
      const issueId = idByLocal.get(task.id);
      const blockedById = idByLocal.get(dep);
      if (issueId && blockedById) await adapter.addDependency({ issueId, blockedById });
    }
  }

  return { projectId: project.id, url: project.url, created };
}

/** Render a human-readable PLAN.md from the plan (durable context / source of truth). */
export function renderPlanDoc(plan: EpicPlan, result?: MaterializeResult): string {
  const refOf = (localId: string) =>
    result?.created.find((c) => c.localId === localId)?.ref ?? localId;
  const lines: string[] = [`# Epic: ${plan.name}`, ""];
  if (plan.brief) lines.push(plan.brief, "");
  lines.push("## Tasks", "", "| task | owner | qa-batch | blocked-by |", "|---|---|---|---|");
  for (const t of plan.tasks) {
    const deps = t.blockedBy.map(refOf).join(", ") || "—";
    lines.push(`| ${refOf(t.id)} ${t.title} | ${t.owner} | ${t.batch ?? "—"} | ${deps} |`);
  }
  return `${lines.join("\n")}\n`;
}
