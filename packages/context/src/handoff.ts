import type { TaskRef } from "@norma/core";

export interface HandoffInput {
  stage: "dispatch" | "review" | "rework" | "qa" | "escalate";
  /** Epic brief (goal / scope), re-read every run. */
  brief?: string | null;
  /** PLAN.md (DAG, qa-batches, QA plans). */
  plan?: string | null;
  /** The task(s) in play, with their descriptions/acceptance criteria. */
  tasks: (TaskRef & { description?: string })[];
  /** Batch key when stage === "qa". */
  batch?: string;
  /** Prior reviewer/QA feedback for a rework/escalation. */
  feedback?: string;
  /** Absolute worktree path where the work happens. */
  worktree?: string;
  /** Soft cap on characters for the PLAN/brief sections (token discipline). */
  maxSection?: number;
}

const clamp = (s: string, n: number) =>
  s.length <= n ? s : `${s.slice(0, n)}\n… [truncated ${s.length - n} chars]`;

const STAGE_INSTRUCTION: Record<HandoffInput["stage"], string> = {
  dispatch:
    "Implement this task to completion in the worktree. Finish only when lint + build + tests are green, then commit.",
  review:
    "Review the task's worktree diff against standards (lint, build, types, design system). Pass or fail with specific findings.",
  rework:
    "Address the feedback below, re-run the gate green, and commit. Do not expand scope beyond the fix.",
  qa: "Test this batch end-to-end against its QA plan and acceptance criteria. Approve, or bounce the specific failing task(s) with a reproducible defect.",
  escalate:
    "This task has bounced repeatedly. Re-scope it: tighten acceptance criteria, split it, or fix a wrong dependency. Comment the decision.",
};

/**
 * Assemble the engineered handoff prompt for one stage — the durable, minimal
 * context the next agent needs. Order and brevity are deliberate: brief first,
 * then plan, then the concrete task(s), then any feedback.
 */
export function composeHandoff(input: HandoffInput): string {
  const cap = input.maxSection ?? 6000;
  const parts: string[] = [];
  parts.push(`# Stage: ${input.stage}`);
  parts.push(STAGE_INSTRUCTION[input.stage]);
  if (input.worktree) parts.push(`\n**Worktree:** \`${input.worktree}\` — all work happens here.`);
  if (input.brief) parts.push(`\n## Epic brief\n${clamp(input.brief.trim(), cap)}`);
  if (input.plan)
    parts.push(`\n## Plan (DAG · qa-batches · QA plans)\n${clamp(input.plan.trim(), cap)}`);
  if (input.batch) parts.push(`\n## QA batch: ${input.batch}`);

  parts.push("\n## Task(s)");
  for (const t of input.tasks) {
    parts.push(`\n### ${t.ref} — ${t.title}${t.owner ? ` _(owner: ${t.owner})_` : ""}`);
    if (t.url) parts.push(t.url);
    if (t.description) parts.push(clamp(t.description.trim(), cap));
  }

  if (input.feedback)
    parts.push(`\n## Prior feedback (address this)\n${clamp(input.feedback.trim(), cap)}`);
  return parts.join("\n");
}
