# Norma

**Norma turns a described piece of work into reviewed, verified, done work — with AI
agents doing the work and a deterministic engine deciding what happens next.**

You describe an epic. Norma breaks it into tasks with dependencies, then drives each one
through your team's real workflow — build → review → QA → done — using agents for the
creative steps. Your issue tracker (Linear, Jira, GitHub) stays the source of truth, so
you watch it all happen on the board you already use.

```
 describe an epic ──► tasks on your board (with a dependency graph)
        │
        ▼   norma cycle  (on demand or on a schedule)
   build ──► review ──► QA        (agents; humans optional at any step)
        ↑______ rework ______|
        ▼
   all done ──► report ──► ship
```

The one idea that makes it reliable: **a pure, tested engine decides orchestration; an
LLM only does the creative work of one task at a time.** The engine enforces the
dependency graph, the "one task in flight per lane" rule, and the QA gates — the same way
every run. → [why deterministic](docs/WHY-DETERMINISTIC.md) ·
[how it works](docs/ARCHITECTURE.md) · [the squad mental model](docs/AGILE-MAPPING.md) ·
[what Norma is *not*](docs/POSITIONING.md)

## Try it in 30 seconds

No credentials needed — this runs the whole loop against an in-memory board:

```bash
pnpm install
pnpm build
pnpm --filter @norma/cli exec tsx src/index.ts demo
```

## Set it up on your project

One interactive command connects to your tracker, reads your **real board columns**, and
generates everything Norma needs:

```bash
export LINEAR_API_KEY=lin_api_xxx     # or Jira / GitHub credentials
cd your-project
norma init
```

It writes `norma.config.json` (how your board maps to Norma's workflow) and
`.norma/agents/*.md` (your agents, editable Markdown) — and offers to create any missing
board columns/labels. Prefer non-interactive? `norma init --yes --tracker linear
--team Acme --workers api,web`.

Then plan an epic and let it run:

```bash
norma epic --brief "Add referral tiers to the product"   # → tasks + graph on your board
norma cycle <projectId> --slug referral-tiers            # advance one cycle
```

## Commands

| Command | What it does |
|---|---|
| `norma init` | Onboard a project: map the board, pick agents + runtime, generate config. |
| `norma epic` | Turn a brief (or a `--plan-file`) into a project + tasks + dependency graph. |
| `norma cycle <id>` | Advance an epic: plan → run agents → write back, to a fixed point. |
| `norma status <id>` | The board at a glance (per-task phase/owner/batch). |
| `norma plan <id>` | Print the engine's next actions — read-only, no writes. |
| `norma report <id>` | Generate the delivery report (also runs at completion; `cycle --pr` opens a PR). |
| `norma doctor` | Validate config, credentials, board mapping, and agent files. |
| `norma agents` · `worktree` · `complete` · `whoami` · `demo` | Manage agents, per-epic git worktrees, finish, verify auth, offline demo. |

Config is auto-discovered from `norma.config.json`; point elsewhere with `--config`.

## Watch it live

```bash
norma serve --demo        # offline: seeded epic + echo agents, open http://localhost:4680
norma serve <projectId>   # against your tracker
```

A live dashboard lays your tasks out in columns by phase and **animates them as the
epic runs** — highlighting what's in flight and what's next. `norma serve` ships a
zero-dependency page; `apps/web` is the richer client (React + shadcn/ui + TanStack)
that talks to the same API.

## Works with your stack

- **Trackers:** Linear · Jira · GitHub Issues · in-memory (offline). Adding one is an
  adapter + a mapping — no engine change.
- **Agent runtimes:** Claude Code · any command/script · humans (review/QA by comment) ·
  echo (offline). The agent *definition* is separate from *how it runs*, so switching
  runtimes touches nothing else.
- **Pipelines:** ships a `software-dev` preset (and `content`, `github`); write your own
  as config.

## Install the CLI globally

`@norma/cli` bundles the whole workspace into a self-contained binary:

```bash
pnpm --filter @norma/cli build
npm i -g "apps/cli/$(cd apps/cli && npm pack | tail -1)"   # provides `norma`
```

## Docs

- **[Getting started](docs/GETTING-STARTED.md)** — install → init → epic → cycle → ship.
- [Architecture](docs/ARCHITECTURE.md) — the engine, the phase model, packages, and the
  mapping from the original harness.
- [Why deterministic](docs/WHY-DETERMINISTIC.md) · [Agile mapping](docs/AGILE-MAPPING.md)
  · [Positioning](docs/POSITIONING.md) · [Live validation](docs/VALIDATION.md)
- Full index: [docs/](docs/README.md). Autonomous runs (cron + sandbox): see `tooling/`.

## Apps

- `apps/cli` — the `norma` command.
- `apps/web` — the live dashboard (React + shadcn/ui + TanStack), served by `norma serve`.
- `apps/site` — the product/landing site (**norma.team**).

## Status

Extracted and generalized from a working autonomous dev harness. 14 packages, ~84 tests,
CI green. GitHub is validated end-to-end against a live repo; Linear/Jira are unit-tested
against mocked APIs and pending a live run (see [validation](docs/VALIDATION.md)).
