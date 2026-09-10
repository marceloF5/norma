import { z } from "zod";

/**
 * A tracker-neutral epic plan — the intake artifact. `norma epic` either reads
 * one from a file (deterministic path) or has the planner agent produce one,
 * then materializes it into the tracker (project + issues + dependency DAG).
 *
 * `id` is a LOCAL identifier used only to wire dependencies within the plan; the
 * tracker assigns the real ref (RED-12, PROJ-3…) at creation time.
 */
export const EpicTaskSchema = z
  .object({
    id: z.string().min(1).describe("local id, referenced by other tasks' blockedBy"),
    title: z.string().min(1),
    owner: z.string().min(1).describe("worker type/lane, e.g. api | web"),
    description: z.string().optional(),
    batch: z.string().optional().describe("QA batch key (without prefix), e.g. '1'"),
    estimate: z.number().optional(),
    blockedBy: z.array(z.string()).default([]).describe("local ids of blockers"),
  })
  .strict();

export const EpicPlanSchema = z
  .object({
    name: z.string().min(1),
    slug: z.string().optional(),
    brief: z.string().optional(),
    description: z.string().optional(),
    tasks: z.array(EpicTaskSchema).min(1),
  })
  .strict();

export type EpicTask = z.infer<typeof EpicTaskSchema>;
export type EpicPlan = z.infer<typeof EpicPlanSchema>;

export function parseEpicPlan(input: unknown): EpicPlan {
  return EpicPlanSchema.parse(input);
}

/** Derive a URL-safe slug from an epic name when the plan omits one. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Semantic validation beyond the schema. Returns a list of human-readable
 * problems (empty = valid). Mirrors the principal-engineer's hard rules:
 *  - unique task ids
 *  - every blockedBy references an existing task
 *  - no task blocks itself
 *  - owners are within the configured worker types (when provided)
 *  - NEVER a blocking edge between two same-owner tasks in the SAME qa-batch
 *    (the one-in-flight gate + batch-readiness would deadlock).
 */
export function validateEpicPlan(plan: EpicPlan, opts: { workerTypes?: string[] } = {}): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const t of plan.tasks) {
    if (ids.has(t.id)) errors.push(`duplicate task id: ${t.id}`);
    ids.add(t.id);
  }
  const byId = new Map(plan.tasks.map((t) => [t.id, t]));
  const workerTypes = opts.workerTypes ? new Set(opts.workerTypes) : null;

  for (const t of plan.tasks) {
    if (workerTypes && !workerTypes.has(t.owner)) {
      errors.push(`${t.id}: owner "${t.owner}" is not a configured worker type`);
    }
    for (const dep of t.blockedBy) {
      if (dep === t.id) errors.push(`${t.id} blocks itself`);
      const blocker = byId.get(dep);
      if (!blocker) {
        errors.push(`${t.id}: blockedBy references unknown task "${dep}"`);
        continue;
      }
      if (t.batch && blocker.batch && t.batch === blocker.batch && t.owner === blocker.owner) {
        errors.push(
          `${t.id} ↔ ${dep}: same-owner blocking edge inside qa-batch "${t.batch}" would deadlock; put the dependency across batches or split the batch`,
        );
      }
    }
  }
  return errors;
}
