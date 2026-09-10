import { ALL_PHASES, type Phase } from "@norma/core";
import { normalize } from "@norma/tracker";
import type { Command } from "commander";
import { type ResolvedConfig, makeTracker } from "../factory.js";

type Resolver = () => Promise<ResolvedConfig>;

export interface StatusRow {
  ref: string;
  phase: Phase;
  owner: string | null;
  batch: string | null;
  title: string;
}

const pad = (s: string, n: number) => s.padEnd(n);

/** Render a per-task status table + a phase-count summary (pure, deterministic). */
export function renderStatus(rows: StatusRow[]): string {
  if (!rows.length) return "no tasks in this project.";
  const cols = {
    ref: Math.max(3, ...rows.map((r) => r.ref.length)),
    phase: Math.max(5, ...rows.map((r) => r.phase.length)),
    owner: Math.max(5, ...rows.map((r) => (r.owner ?? "—").length)),
    batch: Math.max(5, ...rows.map((r) => (r.batch ?? "—").length)),
  };
  const lines = rows.map(
    (r) =>
      `${pad(r.ref, cols.ref)}  ${pad(r.phase, cols.phase)}  ${pad(r.owner ?? "—", cols.owner)}  ${pad(
        r.batch ?? "—",
        cols.batch,
      )}  ${r.title}`,
  );
  const counts = new Map<Phase, number>();
  for (const r of rows) counts.set(r.phase, (counts.get(r.phase) ?? 0) + 1);
  const summary = ALL_PHASES.filter((p) => counts.has(p))
    .map((p) => `${p}: ${counts.get(p)}`)
    .join(" · ");
  return `${lines.join("\n")}\n\n${rows.length} tasks · ${summary}`;
}

/** `norma status <projectId>` — the board at a glance. */
export function registerStatus(program: Command, resolved: Resolver): void {
  program
    .command("status")
    .argument("<projectId>", "tracker project/epic id")
    .option("--json", "print the normalized tasks as JSON", false)
    .description("show per-task status (ref · phase · owner · batch · title)")
    .action(async (projectId: string, opts: { json: boolean }) => {
      const { config } = await resolved();
      const tracker = makeTracker(config);
      const raw = await tracker.listIssues({ projectId });
      const tasks = normalize(raw, config.phaseMapping);
      const rows: StatusRow[] = tasks
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((t) => ({
          ref: t.ref,
          phase: t.phase,
          owner: t.owner,
          batch: t.batch,
          title: t.title,
        }));
      console.log(opts.json ? JSON.stringify(rows, null, 2) : renderStatus(rows));
    });
}
