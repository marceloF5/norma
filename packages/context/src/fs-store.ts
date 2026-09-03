import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ContextStore } from "./port.js";

async function readMaybe(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function writeFileMkdir(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

/**
 * Filesystem-backed context store, laid out exactly like the original harness:
 *   <root>/epics/<slug>/{brief.md, PLAN.md, report.md}
 *   <root>/logs/<slug>/<name>
 */
export class FsContextStore implements ContextStore {
  readonly kind = "fs";
  constructor(private readonly root: string) {}

  private epicDir(slug: string) {
    return join(this.root, "epics", slug);
  }

  readBrief(slug: string) {
    return readMaybe(join(this.epicDir(slug), "brief.md"));
  }
  writeBrief(slug: string, content: string) {
    return writeFileMkdir(join(this.epicDir(slug), "brief.md"), content);
  }

  readPlan(slug: string) {
    return readMaybe(join(this.epicDir(slug), "PLAN.md"));
  }
  writePlan(slug: string, content: string) {
    return writeFileMkdir(join(this.epicDir(slug), "PLAN.md"), content);
  }

  readReport(slug: string) {
    return readMaybe(join(this.epicDir(slug), "report.md"));
  }
  writeReport(slug: string, content: string) {
    return writeFileMkdir(join(this.epicDir(slug), "report.md"), content);
  }

  async appendLog(slug: string, name: string, content: string): Promise<void> {
    const path = join(this.root, "logs", slug, name);
    const prev = (await readMaybe(path)) ?? "";
    await writeFileMkdir(path, prev + content);
  }
}
