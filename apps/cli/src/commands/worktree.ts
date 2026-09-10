import type { Command } from "commander";
import type { ResolvedConfig } from "../factory.js";
import { ensureWorktree, removeWorktree, worktreePathFor } from "../git.js";

type Resolver = () => Promise<ResolvedConfig>;

/** `norma worktree create|remove|path <slug>` — manage per-epic git worktrees. */
export function registerWorktree(program: Command, resolved: Resolver): void {
  const cmd = program.command("worktree").description("manage per-epic git worktrees");

  cmd
    .command("create")
    .argument("<slug>", "epic slug")
    .option("--base <branch>", "base branch to fork from (default: current branch)")
    .description("create (or reuse) .norma/worktrees/epic-<slug> on branch epic/<slug>")
    .action(async (slug: string, opts: { base?: string }) => {
      const r = await resolved();
      const res = await ensureWorktree({ repoRoot: r.root, slug, base: opts.base });
      console.log(`${res.created ? "created" : "reused"} ${res.path} (branch ${res.branch})`);
    });

  cmd
    .command("remove")
    .argument("<slug>", "epic slug")
    .description("remove the epic's worktree")
    .action(async (slug: string) => {
      const r = await resolved();
      await removeWorktree(r.root, slug);
      console.log(`removed ${worktreePathFor(r.root, slug)}`);
    });

  cmd
    .command("path")
    .argument("<slug>", "epic slug")
    .description("print the epic's worktree path")
    .action(async (slug: string) => {
      const r = await resolved();
      console.log(worktreePathFor(r.root, slug));
    });
}
