import { spawn } from "node:child_process";
import type { Command } from "commander";
import { type ResolvedConfig, makeContext, makeTracker } from "../factory.js";
import { gatherReportData, renderReport } from "../report.js";

type Resolver = () => Promise<ResolvedConfig>;

/** Build the epic report from the tracker + context and write it to .norma/epics/<slug>/report.md. */
export async function writeEpicReport(
  r: ResolvedConfig,
  projectId: string,
  slug: string,
): Promise<{ path: string; body: string }> {
  const tracker = makeTracker(r.config);
  const context = makeContext(r.contextRoot);
  const brief = (await context.readBrief(slug)) ?? undefined;
  const date = new Date().toISOString().slice(0, 10);
  const data = await gatherReportData(tracker, r.config, projectId, { title: slug, brief, date });
  const body = renderReport(data);
  await context.writeReport(slug, body);
  return { path: `${r.contextRoot}/epics/${slug}/report.md`, body };
}

/** Open a PR whose body is the report (best-effort; requires gh + a pushed branch). */
export function openPullRequest(
  bodyFile: string,
  opts: { title: string; base?: string; cwd?: string },
): Promise<number> {
  const args = [
    "pr",
    "create",
    "--title",
    opts.title,
    "--body-file",
    bodyFile,
    "--base",
    opts.base ?? "main",
  ];
  return new Promise((resolve) => {
    const child = spawn("gh", args, { cwd: opts.cwd ?? process.cwd(), stdio: "inherit" });
    child.on("error", () => resolve(1));
    child.on("close", (code) => resolve(code ?? 1));
  });
}

/** `norma report <projectId> --slug <slug>` — (re)generate the delivery report on demand. */
export function registerReport(program: Command, resolved: Resolver): void {
  program
    .command("report")
    .argument("<projectId>", "tracker project/epic id")
    .requiredOption("--slug <slug>", "epic slug (where the report is written)")
    .description("generate the epic delivery report (report.md) from the tracker + context")
    .action(async (projectId: string, opts: { slug: string }) => {
      const r = await resolved();
      const { path } = await writeEpicReport(r, projectId, opts.slug);
      console.log(`wrote ${path}`);
    });
}
