import { ALL_PHASES } from "@norma/core";
import { z } from "zod";

/** A canonical phase name, validated against the core enum. */
export const PhaseName = z.enum(ALL_PHASES as [string, ...string[]]);

/** Role naming — who handles each stage. Mirrors core's RoleMap. */
export const RoleMapSchema = z
  .object({
    worker: z
      .record(z.string(), z.string())
      .describe("owner-type → agent role for dispatch & rework"),
    review: z.string(),
    qa: z.string(),
    escalate: z.string(),
  })
  .strict();

/** Tunable engine knobs. Mirrors core's PlanPolicy. */
export const PolicySchema = z
  .object({
    workerTypes: z.array(z.string()).min(1),
    concurrency: z.number().int().positive().default(1),
    escalateAtBounces: z.number().int().positive().default(2),
    satisfiedPhases: z.array(PhaseName).optional(),
    depDonePhases: z.array(PhaseName).optional(),
  })
  .strict();

// --- phase mapping: tracker (state, labels) <-> canonical Phase -------------

/** One classification rule: match a raw issue's state (+ optional label) → phase. */
export const ClassifyRuleSchema = z
  .object({
    when: z
      .object({
        state: z.string().optional().describe("tracker state name (case-insensitive)"),
        label: z.string().optional().describe("required label for this rule to match"),
      })
      .strict(),
    phase: PhaseName,
  })
  .strict();

/** How to write a phase back to the tracker: target state + label add/remove. */
export const ApplyRuleSchema = z
  .object({
    state: z.string().optional(),
    addLabels: z.array(z.string()).default([]),
    removeLabels: z.array(z.string()).default([]),
  })
  .strict();

export const PhaseMappingSchema = z
  .object({
    /** Ordered rules; first match wins. */
    classify: z.array(ClassifyRuleSchema).min(1),
    /** Per-phase write instructions (partial — only phases the engine transitions to). */
    apply: z.record(PhaseName, ApplyRuleSchema),
    /** Derive owner (worker type) from a label prefix, e.g. "agent:" → agent:api ⇒ "api". */
    owner: z.object({ fromLabelPrefix: z.string() }).strict(),
    /** Derive batch key from a label prefix, e.g. "qa-batch:". Full label kept as key. */
    batch: z.object({ fromLabelPrefix: z.string() }).strict(),
    /** Regex (as string) matching a bounce marker in a comment body; counted for escalation. */
    bounceMarker: z.string().default("^\\s*🔁\\s*bounce"),
  })
  .strict();

/** Which tracker backs this harness, plus its connection options. */
export const TrackerSchema = z
  .object({
    kind: z.enum(["linear", "jira", "github", "memory"]),
    /** Adapter-specific options (team key, project prefix, base URL…). */
    options: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

/** Which agent runtime executes the roles. */
export const RuntimeSchema = z
  .object({
    kind: z.enum(["claude-code", "opencode", "echo", "command", "human"]).default("claude-code"),
    options: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const NormaConfigSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    tracker: TrackerSchema,
    runtime: RuntimeSchema.default({ kind: "claude-code", options: {} }),
    policy: PolicySchema,
    roles: RoleMapSchema,
    phaseMapping: PhaseMappingSchema,
  })
  .strict();

export type NormaConfig = z.infer<typeof NormaConfigSchema>;
export type PhaseMapping = z.infer<typeof PhaseMappingSchema>;
export type ClassifyRule = z.infer<typeof ClassifyRuleSchema>;
export type ApplyRule = z.infer<typeof ApplyRuleSchema>;
export type TrackerConfig = z.infer<typeof TrackerSchema>;
export type RuntimeConfig = z.infer<typeof RuntimeSchema>;

/** Parse + validate an unknown value into a NormaConfig (throws on invalid). */
export function parseConfig(input: unknown): NormaConfig {
  return NormaConfigSchema.parse(input);
}

/** Build the core PlanContext from a validated config. */
export function toPlanContext(config: NormaConfig): {
  policy: import("@norma/core").PlanPolicy;
  roles: import("@norma/core").RoleMap;
} {
  return {
    policy: {
      workerTypes: config.policy.workerTypes,
      concurrency: config.policy.concurrency,
      escalateAtBounces: config.policy.escalateAtBounces,
      satisfiedPhases: config.policy.satisfiedPhases as import("@norma/core").Phase[] | undefined,
      depDonePhases: config.policy.depDonePhases as import("@norma/core").Phase[] | undefined,
    },
    roles: config.roles,
  };
}
