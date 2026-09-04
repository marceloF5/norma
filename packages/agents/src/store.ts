import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { markdownToSpec, specToMarkdown } from "./serialize.js";
import type { AgentSpec } from "./spec.js";

/** Write one agent spec to `<dir>/<role>.md`. */
export async function writeAgent(dir: string, spec: AgentSpec): Promise<string> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${spec.role}.md`);
  await writeFile(path, specToMarkdown(spec), "utf8");
  return path;
}

/** Write many specs; returns the written paths. */
export async function writeAgents(dir: string, specs: AgentSpec[]): Promise<string[]> {
  const out: string[] = [];
  for (const s of specs) out.push(await writeAgent(dir, s));
  return out;
}

/** Read one agent by role from `<dir>/<role>.md`, or null if absent. */
export async function readAgent(dir: string, role: string): Promise<AgentSpec | null> {
  try {
    return markdownToSpec(await readFile(join(dir, `${role}.md`), "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** List every agent spec present in a directory. */
export async function listAgents(dir: string): Promise<AgentSpec[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const specs: AgentSpec[] = [];
  for (const n of names) {
    if (!n.endsWith(".md")) continue;
    const md = await readFile(join(dir, n), "utf8");
    specs.push(markdownToSpec(md));
  }
  return specs;
}
