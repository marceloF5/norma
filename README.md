# Norma

A **provider-agnostic orchestration engine for AI agent pipelines**. It turns a
described unit of work into reviewed, verified, done work — with agents playing fixed
roles, a **deterministic engine** deciding order, and any issue tracker (Linear, Jira,
…) as the source of truth for state.

It is the generalized, decoupled core extracted from a working autonomous dev harness:
the proven mechanics (a DAG frontier, a loop with concurrency/batch gates, context
handoff) are kept; the coupling to one tracker, one vocabulary, and one team is gone —
everything specific is now **config + adapters**.

> **What Norma is — and what it deliberately is not.** See
> [`docs/POSITIONING.md`](docs/POSITIONING.md) for the scope boundaries and how Norma
> compares to tools it is often confused with (Hermes, LangChain/LangGraph, Orca), and
> [`docs/WHY-DETERMINISTIC.md`](docs/WHY-DETERMINISTIC.md) for why a deterministic
> orchestrator (token economy, predictability, auditability) beats an LLM-driven one on
> already-determined pipelines.

```
 intake ──► planner agent ──► tracker (project + tasks: DAG + qa-batches)
                                    │
        ┌───────────  norma cycle (cron or on-demand)  ───────────┐
        │                                                            │
   worker agents  ──►  reviewer  ──►  QA (per batch)                 │
        ▲          (rework loop on bounce; escalate at N)     │      │
        └──────────────────────────────────────────────────────┘      │
                                                                       ▼
                          all tasks released ──► report ──► ship ──► done
```

## The one idea

> **A pure engine decides orchestration; an LLM only does the creative work.**

`computePlan(tasks, ctx)` is a pure, unit-tested function. Given the current tasks it
returns the exact ordered **intents** — promote, dispatch, review, rework, escalate,
qa, complete — enforcing the dependency DAG, the one-in-flight gate, and batch
readiness. The **orchestrator** is just the operator: it reads the tracker, asks the
engine, runs the specialist agent for each intent, and writes the result back. The LLM
never decides *what* happens next — only *how* to implement/review/test one task.

## Canonical phases (the seam)

The engine reasons over provider-agnostic **phases**, never a tracker's state names:

```
backlog → ready → in_progress → needs_review → needs_qa → released → done
                        ↑______ needs_rework ______|         (canceled = side exit)
```

Each adapter's **normalizer** maps a raw issue `(state, labels)` onto one phase — and a
phase transition back onto `(state, labels)` writes — using a declarative
**phaseMapping** in config. That single indirection is what makes the core open to any
tracker: to support a new one you write an adapter (API calls) + a mapping (data). No
engine change.

## Packages

| Package | Responsibility |
|---|---|
| **`@norma/core`** | The pure engine (`computePlan`), canonical `Phase`, domain types, intents. Zero I/O. |
| **`@norma/config`** | Zod-validated pipeline definition (roles, gates, policy, phase mapping) + the `software-dev` preset. |
| **`@norma/tracker`** | The `TrackerAdapter` port, the declarative normalizer, and an in-memory adapter. |
| **`@norma/adapter-linear`** | `TrackerAdapter` over the Linear GraphQL API. |
| **`@norma/adapter-jira`** | `TrackerAdapter` over the Jira Cloud REST API. |
| **`@norma/agent-runtime`** | The `AgentRunner` port + a Claude Code runner (`claude -p`) and an offline echo runner. |
| **`@norma/agents`** | Runtime-neutral `AgentSpec`, the pre-established agent catalog, and Markdown (de)serialization. |
| **`@norma/context`** | The `ContextStore` (durable brief / PLAN / report) + the handoff prompt composer. |
| **`@norma/orchestrator`** | The operator loop: plan → execute → write-back → re-plan, to a fixed point. |
| **`@norma/cli`** (`norma`) | `init · doctor · agents · whoami · plan · cycle · complete · demo`, wiring everything together. |

Ports & adapters throughout: swap the tracker, the agent runtime, or the pipeline
definition independently — the engine and orchestrator never change.

## Quick start

```bash
pnpm install
pnpm build
pnpm test          # engine, normalizer, mapping, agents & the full loop

# Run the whole loop offline — no credentials, memory tracker + echo agents:
pnpm --filter @norma/cli exec tsx src/index.ts demo
```

## Onboarding — `norma init`

Install Norma into an existing project with one interactive command. It connects to
your tracker, reads your **real board columns**, and walks you through mapping them onto
Norma's canonical phases, choosing your worker lanes and agents, and picking the
execution runtime. It then writes everything out.

```bash
export LINEAR_API_KEY=lin_api_xxx      # so init can read your Linear board
cd your-project
norma init                             # interactive wizard
```

It produces, in your project:

```
norma.config.json          # tracker + runtime + policy + roles + phaseMapping (Zod-validated)
.norma/agents/*.md         # the chosen agents (editable Markdown + frontmatter)
```

and, if your board is missing any states/labels the pipeline needs, offers to **create
them** for you.

Non-interactive (CI / scripted):

```bash
norma init --yes --tracker linear --team Acme --workers api,web --runtime claude-code
```

Supporting commands:

```bash
norma doctor            # validate config + tracker auth + board mapping + agent files
norma agents list       # catalog: which agents are installed vs available
norma agents add <role> # install another catalog agent into .norma/agents
```

## Everyday use

Once initialized (config is auto-discovered upward from the cwd):

```bash
norma whoami                              # verify credentials
norma plan <projectId>                    # print the deterministic plan (no writes)
norma cycle <projectId> --slug my-epic    # advance the epic one cycle
norma complete <projectId>                # flip released tasks → done
```

Point at a different config explicitly with `--config`:

```bash
norma --config examples/jira.config.json plan <epicKey>
```

### Execution-model agnostic

The agent *definition* (`AgentSpec`: role, instructions, model, tools) is separate from
the *execution runtime* (`AgentRunner`). The same `.norma/agents/*.md` run on any
runtime — `norma init` writes `runtime: { kind }` (today `claude-code` or `echo`);
adding another (Agent SDK, OpenAI, a human queue) is a new `AgentRunner`, with zero
changes to the engine, the orchestrator, or your agents.

## Autonomous runs (optional)

`tooling/scripts/norma-cycle.sh` runs one cycle headlessly with a lock + log;
`install-cron.sh` schedules it daily (macOS launchd). For unattended runs, the
`tooling/sandbox/` container is the jail: only the repo is mounted, egress is
allowlisted, auth is injected as env, and the agent runs `--permission-mode
bypassPermissions` safely inside it.

## Extending

- **New tracker** → implement `TrackerAdapter` (5 read/write methods) + a `phaseMapping`.
- **New pipeline** → run `norma init`, or write a `NormaConfig` (workers, roles, gates,
  mapping). The `software-dev` preset is the reference.
- **New agent runtime** → implement `AgentRunner` (`run(request) → outcome`).

See `docs/ARCHITECTURE.md` for the full design and the mapping from the original
harness, and [`docs/POSITIONING.md`](docs/POSITIONING.md) for scope boundaries and
comparisons to adjacent tools.
