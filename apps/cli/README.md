# Norma

**Norma turns a described piece of work into reviewed, verified, done work — with AI
agents doing the work and a deterministic engine deciding what happens next.**

You describe an epic. Norma breaks it into tasks with dependencies, then drives each one
through your team's real workflow — build → review → QA → done — using agents for the
creative steps. Your issue tracker (Linear, Jira, GitHub) stays the source of truth.

The idea that makes it reliable: **a pure, tested engine decides orchestration; an LLM
only does the creative work of one task at a time.** Same dependency graph, same
"one task in flight per lane" rule, same QA gates — every run.

## Install

```bash
npm i -g @norma/cli     # provides the `norma` command
```

`@norma/cli` is a self-contained binary — the whole engine, adapters, and runtimes are
bundled in.

## Try it in 30 seconds

No credentials — runs the whole loop against an in-memory board:

```bash
norma demo
```

## Set it up on your project

```bash
export LINEAR_API_KEY=lin_api_xxx     # or Jira / GitHub credentials
cd your-project
norma init                            # maps your board, picks agents + runtime
norma epic --brief "Add referral tiers to the product"
norma cycle <projectId> --slug referral-tiers
```

## Commands

| Command | What it does |
|---|---|
| `norma init` | Onboard a project: map the board, pick agents + runtime, generate config. |
| `norma epic` | Turn a brief (or a `--plan-file`) into a project + tasks + dependency graph. |
| `norma cycle <id>` | Advance an epic: plan → run agents → write back, to a fixed point. |
| `norma status <id>` | The board at a glance (per-task phase/owner/batch). |
| `norma plan <id>` | Print the engine's next actions — read-only, no writes. |
| `norma report <id>` | Generate the delivery report (`cycle --pr` opens a PR). |
| `norma serve <id>` | Live dashboard: tasks in columns by phase, animated as the epic runs. |
| `norma doctor` | Validate config, credentials, board mapping, and agent files. |

## Works with your stack

- **Trackers:** Linear · Jira · GitHub Issues · in-memory (offline).
- **Agent runtimes:** Claude Code · OpenCode (multi-provider) · any command/script ·
  humans (review/QA by comment) · echo (offline). Norma *selects* the model; the runtime
  *accesses* it.

## Docs

Full documentation, architecture, and guides: **https://github.com/marceloF5/norma**

MIT © Marcelo Fortunato
