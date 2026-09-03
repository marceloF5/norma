# Harness CORE

A **provider-agnostic orchestration engine for AI agent pipelines**. It turns a
described unit of work into reviewed, verified, done work — with agents playing fixed
roles, a **deterministic engine** deciding order, and any issue tracker (Linear, Jira,
…) as the source of truth for state.

It is the generalized, decoupled core extracted from a working autonomous dev harness:
the proven mechanics (a DAG frontier, a loop with concurrency/batch gates, context
handoff) are kept; the coupling to one tracker, one vocabulary, and one team is gone —
everything specific is now **config + adapters**.

```
 intake ──► planner agent ──► tracker (project + tasks: DAG + qa-batches)
                                    │
        ┌───────────  harness cycle (cron or on-demand)  ───────────┐
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
| **`@norma/context`** | The `ContextStore` (durable brief / PLAN / report) + the handoff prompt composer. |
| **`@norma/orchestrator`** | The operator loop: plan → execute → write-back → re-plan, to a fixed point. |
| **`@norma/cli`** (`harness`) | `whoami · plan · cycle · complete · demo`, wiring config → adapter → runner. |

Ports & adapters throughout: swap the tracker, the agent runtime, or the pipeline
definition independently — the engine and orchestrator never change.

## Quick start

```bash
pnpm install
pnpm build
pnpm test          # 29 tests across the engine, normalizer, and full loop

# Run the whole loop offline — no credentials, memory tracker + echo agents:
pnpm --filter @norma/cli exec tsx src/index.ts demo
```

Against a real tracker:

```bash
export LINEAR_API_KEY=lin_api_xxx           # or JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN
harness whoami                              # verify credentials
harness plan <projectId>                    # print the deterministic plan (no writes)
harness cycle <projectId> --slug my-epic    # advance the epic one cycle
harness complete <projectId>                # flip released tasks → done
```

Use a different pipeline/tracker with `--config`:

```bash
harness --config examples/jira.config.json plan <epicKey>
```

## Autonomous runs (optional)

`tooling/scripts/harness-cycle.sh` runs one cycle headlessly with a lock + log;
`install-cron.sh` schedules it daily (macOS launchd). For unattended runs, the
`tooling/sandbox/` container is the jail: only the repo is mounted, egress is
allowlisted, auth is injected as env, and the agent runs `--permission-mode
bypassPermissions` safely inside it.

## Extending

- **New tracker** → implement `TrackerAdapter` (5 read/write methods) + a `phaseMapping`.
- **New pipeline** → write a `HarnessConfig` (workers, roles, gates, mapping). The
  `software-dev` preset is the reference.
- **New agent runtime** → implement `AgentRunner` (`run(request) → outcome`).

See `docs/ARCHITECTURE.md` for the full design and the mapping from the original harness.
