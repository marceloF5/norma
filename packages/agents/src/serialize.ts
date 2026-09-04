import type { AgentSpec, AgentStage } from "./spec.js";

const STAGES = new Set<AgentStage>(["worker", "review", "qa", "escalate"]);

/** Serialize an AgentSpec to a markdown file with a small YAML-style frontmatter. */
export function specToMarkdown(spec: AgentSpec): string {
  const fm: string[] = ["---", `role: ${spec.role}`, `stage: ${spec.stage}`];
  fm.push(`description: ${spec.description}`);
  if (spec.suggestedModel) fm.push(`model: ${spec.suggestedModel}`);
  if (spec.tools?.length) fm.push(`tools: [${spec.tools.join(", ")}]`);
  fm.push("---", "");
  return `${fm.join("\n")}\n${spec.instructions.trim()}\n`;
}

/**
 * Parse a generated agent markdown back into an AgentSpec. Tolerant of the small
 * frontmatter subset we emit (role/stage/description/model/tools). The body after
 * the frontmatter is the instructions.
 */
export function markdownToSpec(md: string): AgentSpec {
  const match = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("agent file has no frontmatter block");
  }
  const [, front, body] = match;
  const fields: Record<string, string> = {};
  for (const line of (front ?? "").split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) fields[key] = value;
  }
  const role = fields.role;
  const stageRaw = fields.stage as AgentStage | undefined;
  if (!role) throw new Error("agent file missing `role`");
  if (!stageRaw || !STAGES.has(stageRaw)) {
    throw new Error(`agent file has invalid stage: ${fields.stage ?? "(none)"}`);
  }
  const tools = fields.tools
    ? fields.tools
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : undefined;
  return {
    role,
    stage: stageRaw,
    description: fields.description ?? "",
    suggestedModel: fields.model || undefined,
    tools,
    instructions: (body ?? "").trim(),
  };
}
