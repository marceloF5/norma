# Getting started

From zero to watching an epic run. ~5 minutes.

## 1. Prerequisites

- **Node ≥ 20** and **pnpm 9** (`corepack enable` provides pnpm).
- Optional, for real agent work: the **Claude Code CLI** (`claude`) authenticated.
- A tracker account when you go live: **Linear**, **Jira Cloud**, or **GitHub**.

## 2. Install

```bash
git clone https://github.com/marceloF5/norma.git
cd norma
pnpm install
pnpm build
```

Get the `norma` command (self-contained CLI):

```bash
npm i -g "apps/cli/$(cd apps/cli && npm pack | tail -1)"
# or run in-repo without installing: node apps/cli/dist/index.js <cmd>
```

## 3. See it work — offline, no credentials

```bash
norma demo            # runs the whole loop against an in-memory board
norma serve --demo    # same, but a live dashboard at http://localhost:4680
```

Open the dashboard and hit **▶ auto** — tasks move across the phases as the engine
runs. (Build the richer UI first with `pnpm --filter @norma/web build`; `serve`
auto-detects it.)

## 4. Set up your project

Run the wizard in your repo. It reads your real board columns and generates config +
agents:

```bash
export LINEAR_API_KEY=lin_api_xxx        # or JIRA_* / GITHUB_TOKEN
cd your-project
norma init
```

It writes:

- `norma.config.json` — tracker, runtime, policy, roles, and the phase mapping.
- `.norma/agents/*.md` — your agents (editable Markdown + frontmatter).

Validate anytime:

```bash
norma doctor          # config + credentials + board mapping + agent files
```

Non-interactive (CI):

```bash
norma init --yes --tracker linear --team Acme --workers api,web --runtime claude-code
```

## 5. Plan an epic

```bash
# from a demand (planner agent decomposes it):
norma epic --brief "Add referral tiers to the product"

# …or deterministically from a plan file:
norma epic --plan-file plan.json
```

This creates the project, the tasks (with owner + qa-batch labels), and the dependency
graph in your tracker, and records the brief + PLAN in `.norma/epics/<slug>/`.

## 6. Run the loop

```bash
norma plan <projectId>                     # what the engine will do (read-only)
norma cycle <projectId> --slug my-epic     # advance one cycle
norma cycle <projectId> --slug my-epic --auto-worktree   # + isolated git worktree
norma status <projectId>                   # the board at a glance
```

Each cycle promotes ready tasks, dispatches an agent per free lane, reviews, QAs (per
batch), and reworks/escalates bounces — to a fixed point. Run it on demand, on a cron
(`tooling/scripts/norma-cycle.sh`), or watch it in `norma serve <projectId>`.

## 7. Ship

When every task is released:

```bash
norma report <projectId> --slug my-epic    # writes report.md (also runs at completion)
norma cycle <projectId> --slug my-epic --pr  # open the PR with the report as its body
norma complete <projectId>                 # flip released tasks → done
```

## Where things live

```
norma.config.json          # your pipeline (Zod-validated)
.norma/agents/*.md         # your agents
.norma/epics/<slug>/       # brief.md · PLAN.md · report.md
.norma/logs/runs.jsonl     # a record of each cycle
```

## Next

- [Architecture](ARCHITECTURE.md) — the engine, phases, packages.
- [Why deterministic](WHY-DETERMINISTIC.md) · [Agile mapping](AGILE-MAPPING.md)
- [Validation](VALIDATION.md) — live-API status per adapter.
