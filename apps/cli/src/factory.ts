import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { JiraAdapter } from "@norma/adapter-jira";
import { LinearAdapter } from "@norma/adapter-linear";
import { type AgentRunner, ClaudeCodeRunner, EchoRunner } from "@norma/agent-runtime";
import { type NormaConfig, parseConfig, softwareDevConfig } from "@norma/config";
import { FsContextStore } from "@norma/context";
import { MemoryTracker, type TrackerAdapter } from "@norma/tracker";

export const CONFIG_FILENAME = "norma.config.json";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Walk up from `startDir` looking for norma.config.json. Returns its path or null. */
export async function findConfigPath(startDir = process.cwd()): Promise<string | null> {
  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, CONFIG_FILENAME);
    if (await exists(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export interface ResolvedConfig {
  config: NormaConfig;
  /** Absolute path of the config file, or null when the built-in preset is used. */
  configPath: string | null;
  /** Project root (config dir, or cwd for the preset). */
  root: string;
  /** Where durable brief/PLAN/report live. */
  contextRoot: string;
  /** Where `.md` agent definitions live. */
  agentsDir: string;
}

/**
 * Resolve the active config: an explicit `--config` path wins; otherwise discover
 * norma.config.json upward from cwd; otherwise fall back to the software-dev preset.
 */
export async function resolveConfig(explicitPath?: string): Promise<ResolvedConfig> {
  let configPath: string | null = null;
  let config: NormaConfig;

  if (explicitPath) {
    configPath = resolve(explicitPath);
    config = parseConfig(JSON.parse(await readFile(configPath, "utf8")));
  } else {
    configPath = await findConfigPath();
    if (configPath) {
      config = parseConfig(JSON.parse(await readFile(configPath, "utf8")));
    } else {
      config = parseConfig(softwareDevConfig);
    }
  }

  const root = configPath ? dirname(configPath) : process.cwd();
  return {
    config,
    configPath,
    root,
    contextRoot: join(root, ".norma"),
    agentsDir: join(root, ".norma", "agents"),
  };
}

/** Build a tracker adapter from config + environment. */
export function makeTracker(config: NormaConfig): TrackerAdapter {
  const bounceMarker = config.phaseMapping.bounceMarker;
  const o = config.tracker.options as Record<string, unknown>;
  switch (config.tracker.kind) {
    case "linear":
      return new LinearAdapter({ team: o.team as string | undefined, bounceMarker });
    case "jira":
      return new JiraAdapter({
        baseUrl: o.baseUrl as string | undefined,
        projectKey: o.projectKey as string | undefined,
        bounceMarker,
      });
    case "memory":
      return new MemoryTracker({ bounceMarker });
    default:
      throw new Error(`Unknown tracker kind: ${config.tracker.kind}`);
  }
}

/** Build an agent runner from config, wiring the agents dir for the Claude Code runtime. */
export function makeRunner(config: NormaConfig, agentsDir?: string): AgentRunner {
  const o = config.runtime.options as Record<string, unknown>;
  switch (config.runtime.kind) {
    case "claude-code":
      return new ClaudeCodeRunner({ model: o.model as string | undefined, agentsDir });
    case "echo":
      return new EchoRunner();
    default:
      throw new Error(`Unknown runtime kind: ${config.runtime.kind}`);
  }
}

/** Build the filesystem context store (durable brief/PLAN/report). */
export function makeContext(root: string): FsContextStore {
  return new FsContextStore(resolve(root));
}
