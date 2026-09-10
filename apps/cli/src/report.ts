import type { NormaConfig } from "@norma/config";
import { type NormalizedTask, Phase } from "@norma/core";
import { type TrackerAdapter, normalize } from "@norma/tracker";

export interface ReportData {
  title: string;
  brief?: string;
  url?: string;
  date?: string;
  tasks: Pick<NormalizedTask, "ref" | "title" | "owner" | "batch" | "phase">[];
}

const PHASE_LABEL: Record<Phase, string> = {
  [Phase.BACKLOG]: "backlog",
  [Phase.READY]: "ready",
  [Phase.IN_PROGRESS]: "in progress",
  [Phase.NEEDS_REWORK]: "rework",
  [Phase.NEEDS_REVIEW]: "review",
  [Phase.NEEDS_QA]: "qa",
  [Phase.RELEASED]: "released",
  [Phase.DONE]: "done",
  [Phase.CANCELED]: "canceled",
};

/**
 * Render the epic delivery report (becomes the PR body). Pure + deterministic;
 * kept concise (grouped by owner lane, then by QA batch). ≤200 lines by design.
 */
export function renderReport(data: ReportData): string {
  const lines: string[] = [`# ${data.title} — Delivery Report`, ""];
  const meta = [
    data.url ? `**Epic:** ${data.url}` : null,
    data.date ? `**Date:** ${data.date}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  if (meta) lines.push(meta, "");
  if (data.brief) lines.push("## Summary", data.brief.trim(), "");

  // What was built — grouped by owner lane.
  lines.push("## What was built");
  const byOwner = new Map<string, ReportData["tasks"]>();
  for (const t of data.tasks) {
    const key = t.owner ?? "unassigned";
    const arr = byOwner.get(key) ?? [];
    arr.push(t);
    byOwner.set(key, arr);
  }
  for (const [owner, tasks] of [...byOwner.entries()].sort()) {
    lines.push("", `### ${owner}`);
    for (const t of tasks) lines.push(`- **${t.ref}** ${t.title}`);
  }

  // QA batches.
  const byBatch = new Map<string, ReportData["tasks"]>();
  for (const t of data.tasks) {
    if (!t.batch) continue;
    const arr = byBatch.get(t.batch) ?? [];
    arr.push(t);
    byBatch.set(t.batch, arr);
  }
  if (byBatch.size) {
    lines.push("", "## QA batches");
    for (const [batch, tasks] of [...byBatch.entries()].sort()) {
      lines.push(`- **${batch}** — ${tasks.map((t) => t.ref).join(", ")}`);
    }
  }

  // Status line.
  const counts = new Map<Phase, number>();
  for (const t of data.tasks) counts.set(t.phase, (counts.get(t.phase) ?? 0) + 1);
  const status = [...counts.entries()].map(([p, n]) => `${PHASE_LABEL[p]}: ${n}`).join(" · ");
  lines.push("", "## Status", status, "");
  return `${lines.join("\n")}\n`;
}

/** Fetch the tracker's issues and shape them into report data. */
export async function gatherReportData(
  tracker: TrackerAdapter,
  config: NormaConfig,
  projectId: string,
  opts: { title: string; brief?: string; date?: string } = { title: projectId },
): Promise<ReportData> {
  const raw = await tracker.listIssues({ projectId });
  const tasks = normalize(raw, config.phaseMapping).map((t) => ({
    ref: t.ref,
    title: t.title,
    owner: t.owner,
    batch: t.batch,
    phase: t.phase,
  }));
  return { title: opts.title, brief: opts.brief, date: opts.date, tasks };
}
