/** The pipeline stage a role serves. Mirrors the engine's intent kinds. */
export type AgentStage = "worker" | "review" | "qa" | "escalate";

/**
 * A runtime-neutral agent definition. The SAME spec runs on any AgentRunner —
 * each runner translates it into its own world (a Claude Code subagent, an Agent
 * SDK agent, an OpenAI system message…). Never couple a spec to a runtime.
 */
export interface AgentSpec {
  /** Role id, e.g. "api-engineer". Matches config `roles`. */
  role: string;
  /** Which stage this role handles. */
  stage: AgentStage;
  /** One-line description (for the catalog + generated frontmatter). */
  description: string;
  /** The agent's system prompt / instructions (markdown body). */
  instructions: string;
  /** Suggested model (a hint; the runner decides whether to honor it). */
  suggestedModel?: string;
  /** Suggested tool/capability names (advisory). */
  tools?: string[];
}
