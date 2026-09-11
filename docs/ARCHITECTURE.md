# Architecture

Norma is the generalized extraction of a working autonomous dev harness that ran
on Linear. This document records the design and how each original concept maps onto the
decoupled core.

## Layers (ports & adapters)

```
                 ┌──────────────────────────────────────────────┐
                 │  @norma/core — computePlan (PURE, tested)   │
                 │  Phase model · intents · DAG · gates          │
                 └───────────────▲───────────────▲──────────────┘
                                 │ normalized     │ intents
                                 │ tasks          │
        ┌────────────────────────┴───────┐   ┌────┴───────────────────────┐
        │  @norma/tracker (port +       │   │  @norma/orchestrator      │
        │  normalizer + memory adapter)   │◄──┤  the operator loop          │
        └───▲───────────────▲─────────────┘   └───▲───────────────▲────────┘
            │               │                     │               │
   adapter-linear     adapter-jira        agent-runtime      context store
   (GraphQL)          (REST)              (claude-code|echo) (brief/PLAN/report)
                                 ▲
                                 │ config (Zod): roles · policy · phaseMapping
                          @norma/config (software-dev preset)
```

The engine sees only **normalized tasks** and emits only **abstract intents**. It has no
knowledge of Linear, Jira, labels, or command strings. Everything provider-specific is
config (`phaseMapping`, `roles`, `policy`) or an adapter.

## Mapping: original harness → CORE

| Original (Linear-coupled) | CORE |
|---|---|
| `computePlan` in `linear.mjs`, hardcoded state names & labels | `@norma/core` `computePlan`, over canonical `Phase` + injected policy |
| Actions embed `node linear.mjs issue-update …` strings | Intents carry abstract `PhaseTransition`; adapter applies via `phaseMapping` |
| Linear GraphQL bridge (same file) | `@norma/adapter-linear` implementing `TrackerAdapter` |
| `agent:api` / `agent:web` owner labels | `phaseMapping.owner.fromLabelPrefix` (config) |
| `ready-for-dev`, `needs-review`, `needs-qa`, `changes-requested`, `qa-approved` | `phaseMapping.apply` per phase (config) |
| `qa-batch:<n>` grouping | `phaseMapping.batch.fromLabelPrefix` (config) |
| `Ready for PR` accumulation state | phase `released` (config maps it to whatever the tracker calls it) |
| One-in-flight gate | `policy.concurrency` (default 1) |
| Escalate after 2 bounces (`🔁 bounce` comments) | `policy.escalateAtBounces` + `phaseMapping.bounceMarker` |
| `/dev-cycle` command (operator) | `@norma/orchestrator` + `norma cycle` |
| `/epic` intake + principal-engineer decomposition | intake stays an agent concern; `TrackerAdapter.createProject/createIssue/addDependency` provide the writes |
| PLAN.md / report.md / epic brief handoff | `@norma/context` (`ContextStore` + `composeHandoff`) |
| Docker sandbox + launchd cron | `tooling/sandbox` + `tooling/scripts` (generalized to `norma cycle`) |

## Determinism

`computePlan` is pure: no clock, no randomness, no I/O. Same `(tasks, ctx)` ⇒
byte-identical `Plan`. This is what makes the loop crash-safe and resumable — the tracker
holds all state, and any run recomputes the exact next steps. It is unit-tested in
`packages/core/src/plan.test.ts`; the full loop (with the in-memory tracker and echo
runner) is tested in `packages/orchestrator/src/orchestrator.test.ts`.

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
| `@norma/core` | The pure engine (`computePlan`), canonical `Phase`, domain types, intents. Zero I/O. |
| `@norma/config` | Zod-validated pipeline definition (roles, gates, policy, phase mapping) + presets (`software-dev`, `content`, `github`). |
| `@norma/tracker` | The `TrackerAdapter` port, the declarative normalizer, retry helper, and an in-memory adapter. |
| `@norma/adapter-linear` | `TrackerAdapter` over the Linear GraphQL API. |
| `@norma/adapter-jira` | `TrackerAdapter` over the Jira Cloud REST API. |
| `@norma/adapter-github` | `TrackerAdapter` over GitHub Issues (epic = milestone; phases in labels; DAG via `blocked-by:` labels). |
| `@norma/agent-runtime` | The `AgentRunner` port + runtimes: `claude-code`, `command`, `human`, `echo`. |
| `@norma/agents` | Runtime-neutral `AgentSpec`, the pre-established agent catalog, and Markdown (de)serialization. |
| `@norma/context` | The `ContextStore` (durable brief / PLAN / report) + the handoff prompt composer. |
| `@norma/orchestrator` | The operator loop: plan → execute → write-back → re-plan, to a fixed point. |
| `@norma/cli` (`norma`) | `init · epic · cycle · status · report · complete · doctor · agents · worktree · whoami · demo`. |

Ports & adapters throughout: swap the tracker, the agent runtime, or the pipeline
definition independently — the engine and orchestrator never change.

## Action order (per plan)

1. **qa** — a batch whose members are all settled, ≥1 pending → run QA.
2. **review** — each task in `needs_review`.
3. **rework / escalate** — each task in `needs_rework` (escalate at the threshold).
4. **promote** — backlog tasks whose blockers are all done → `ready`.
5. **dispatch** — each worker under its concurrency limit claims the lowest-order `ready` task.
6. **complete** — every task released/terminal (but not all done yet).

## Future directions

The phase model is the default agent-build lifecycle. Alternative pipelines (research,
content, data) can reuse the same engine by supplying a different `roles`/`policy` and
`phaseMapping`; a fully data-driven stage list is the natural next generalization if a
pipeline needs a shape the canonical phases don't cover.
