import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Branch name for an epic. */
export const branchFor = (slug: string): string => `epic/${slug}`;

/** Worktree path for an epic, under the repo's .norma/worktrees. */
export const worktreePathFor = (repoRoot: string, slug: string): string =>
  join(repoRoot, ".norma", "worktrees", `epic-${slug}`);

async function git(repoRoot: string, args: string[]): Promise<string> {
  const { stdout } = await run("git", ["-C", repoRoot, ...args]);
  return stdout.trim();
}

export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await git(dir, ["rev-parse", "--is-inside-work-tree"]);
    return true;
  } catch {
    return false;
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function currentBranch(repoRoot: string): Promise<string | undefined> {
  try {
    return (await git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"])) || undefined;
  } catch {
    return undefined;
  }
}

async function branchExists(repoRoot: string, branch: string): Promise<boolean> {
  try {
    await git(repoRoot, ["rev-parse", "--verify", "--quiet", branch]);
    return true;
  } catch {
    return false;
  }
}

export interface EnsureWorktreeResult {
  path: string;
  branch: string;
  created: boolean;
}

/**
 * Create (or reuse) a git worktree for an epic at .norma/worktrees/epic-<slug>
 * on branch epic/<slug>. Idempotent: reuses the dir/branch if they already exist.
 */
export async function ensureWorktree(opts: {
  repoRoot: string;
  slug: string;
  base?: string;
}): Promise<EnsureWorktreeResult> {
  const { repoRoot, slug } = opts;
  if (!(await isGitRepo(repoRoot))) {
    throw new Error(`${repoRoot} is not a git repository — cannot create a worktree`);
  }
  const path = worktreePathFor(repoRoot, slug);
  const branch = branchFor(slug);
  if (await pathExists(path)) return { path, branch, created: false };

  const base = opts.base ?? (await currentBranch(repoRoot)) ?? "main";
  if (await branchExists(repoRoot, branch)) {
    await git(repoRoot, ["worktree", "add", path, branch]);
  } else {
    await git(repoRoot, ["worktree", "add", "-b", branch, path, base]);
  }
  return { path, branch, created: true };
}

/** Remove an epic's worktree (best-effort). */
export async function removeWorktree(repoRoot: string, slug: string): Promise<void> {
  await git(repoRoot, ["worktree", "remove", worktreePathFor(repoRoot, slug), "--force"]);
}
