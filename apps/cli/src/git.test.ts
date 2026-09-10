import { execFile } from "node:child_process";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { branchFor, ensureWorktree, isGitRepo, worktreePathFor } from "./git.js";

const run = promisify(execFile);
let repo: string;

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), "norma-git-"));
  const git = (args: string[]) => run("git", ["-C", repo, ...args]);
  await git(["init", "-b", "main"]);
  await git(["config", "user.email", "t@t.com"]);
  await git(["config", "user.name", "t"]);
  await writeFile(join(repo, "README.md"), "x");
  await git(["add", "-A"]);
  await git(["commit", "-m", "init"]);
});

afterAll(async () => {
  if (repo) await rm(repo, { recursive: true, force: true });
});

describe("git helpers", () => {
  it("pure path/branch helpers", () => {
    expect(branchFor("my-epic")).toBe("epic/my-epic");
    expect(worktreePathFor("/r", "my-epic")).toBe("/r/.norma/worktrees/epic-my-epic");
  });

  it("detects a git repo", async () => {
    expect(await isGitRepo(repo)).toBe(true);
    expect(await isGitRepo(tmpdir())).toBe(false);
  });

  it("creates then reuses a worktree (idempotent)", async () => {
    const first = await ensureWorktree({ repoRoot: repo, slug: "feat-x" });
    expect(first.created).toBe(true);
    expect(first.branch).toBe("epic/feat-x");
    expect((await stat(first.path)).isDirectory()).toBe(true);

    const second = await ensureWorktree({ repoRoot: repo, slug: "feat-x" });
    expect(second.created).toBe(false);
    expect(second.path).toBe(first.path);
  });
});
