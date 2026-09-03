import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { JiraAdapter } from "@norma/adapter-jira";
import { LinearAdapter } from "@norma/adapter-linear";
import { type AgentRunner, ClaudeCodeRunner, EchoRunner } from "@norma/agent-runtime";
import { type HarnessConfig, parseConfig, softwareDevConfig } from "@norma/config";
import { FsContextStore } from "@norma/context";
import { MemoryTracker, type TrackerAdapter } from "@norma/tracker";

/** Load a config from a JSON file, or fall back to the software-dev preset. */
export async function loadConfig(path?: string): Promise<HarnessConfig> {
  if (!path) return parseConfig(softwareDevConfig);
  const raw = await readFile(resolve(path), "utf8");
  return parseConfig(JSON.parse(raw));
}

/** Build a tracker adapter from config + environment. */
export function makeTracker(config: HarnessConfig): TrackerAdapter {
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

/** Build an agent runner from config. */
export function makeRunner(config: HarnessConfig): AgentRunner {
  const o = config.runtime.options as Record<string, unknown>;
  switch (config.runtime.kind) {
    case "claude-code":
      return new ClaudeCodeRunner({ model: o.model as string | undefined });
    case "echo":
      return new EchoRunner();
    default:
      throw new Error(`Unknown runtime kind: ${config.runtime.kind}`);
  }
}

/** Build the filesystem context store (durable brief/PLAN/report). */
export function makeContext(root = ".harness"): FsContextStore {
  return new FsContextStore(resolve(root));
}
