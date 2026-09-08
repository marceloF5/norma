# Norma positioning — what we are and what we are not

This document exists to make Norma's **boundary** explicit: which problem it solves and
— above all — which problems it **deliberately does not**. Most of the confusion about
Norma comes from comparing it to tools that live in a different layer. This settles it.

## The thesis in one sentence

> **A pure, deterministic engine decides orchestration; an LLM only does the creative
> work of each task.**

`computePlan(tasks, ctx)` is a pure, unit-tested function that — given the current state
of the tasks — returns the next action (promote, dispatch, review, rework, escalate, qa,
complete), enforcing the dependency DAG, the one-in-flight gate, and QA-batch readiness.
The orchestrator is just the operator: it reads the tracker, asks the engine, runs the
specialist agent for each intent, and writes the result back. **The LLM never decides
_what_ happens next — only _how_ to implement/review/test one task.**

## What Norma is

- A **headless orchestration engine** (CLI + cron) for agent pipelines.
- **Deterministic and auditable**: same input → same plan, every time.
- **Tracker-agnostic**: Linear, Jira, or any other, via a port + adapter and a
  declarative `phaseMapping`. The tracker is the **source of truth** for state.
- **Agent-runtime-agnostic**: Claude Code, echo, and in the future any other
  `AgentRunner`, without touching the engine.
- Focused on **taking the human out of the decision loop**: you plan at the start and
  review the result at the end; in between, the line runs itself.

## What Norma is **not** (and does not aim to be)

Each item below is a **scoping decision**, not a gap waiting to be filled.

### 1. Not an AI agent / personal assistant
Norma does not chat, has no personality, does not "grow with you." It is not *the*
agent — it **coordinates** agents. Creative execution is delegated to an `AgentRunner`
(today, Claude Code). If you want an assistant that learns from you and reaches you on
WhatsApp, that is a different product category (see Hermes, below).

### 2. Not a "Lego bricks" library for AI
Norma is not a generic kit for building any LLM application (RAG, chatbots, arbitrary
chains). It is **opinionated**: it is already a finished flow — a task-by-task line with
review/QA gates. It is not a toolbox; it is an assembly line already configured (see
LangChain, below).

### 3. Not a human-in-the-loop cockpit
Norma does not have — and does not want — a rich UI for you to pilot many agents in
parallel, compare diffs side by side, and pick the best merge. It is the opposite:
*human-out-of-the-loop*. Its value is running **without** someone sitting there deciding
the next step (see Orca, below).

### 4. It does not let the LLM decide the flow
This is the most important boundary. Agent frameworks usually let the model decide the
next hop at runtime — flexible, but unpredictable and hard to audit. Norma does the
opposite **on purpose**: the flow decision is pure code. We trade flexibility for
reliability and traceability.

### 5. Not the executor of the work
Norma does not write the code, does not review it, does not run the tests. That is the
agent's job inside each task. Norma decides **what** and **in what order** — the **how**
is not its concern.

### 6. It does not manage long-term memory/learning
There are no skills that evolve, no user profile, no search over past conversations. The
only "state" Norma carries between tasks is the **context handoff** (`@norma/context`:
brief / PLAN / report). Autonomous learning is not a goal.

## Tools frequently confused with Norma

They all orchestrate or execute agents in some form — but each lives in a different
layer. **None is a direct competitor of Norma**; several are actually complementary
(they can even run the same Claude Code that Norma uses as a runner).

### Hermes Agent (NousResearch)
**What it is:** a personal, self-improving AI agent — same category as Claude Code. It
runs in your terminal and across ~20 messaging platforms, learns from you (skills +
memory + profile), acts on your computer, and improves over time.

**Layer:** agent _runner_ (the executor).

**Difference from Norma:** Hermes *is* the agent that does the work and decides its own
flow, learning along the way. Norma sits **above** that, deciding — by deterministic
rules — which work to do and in what order. Hermes could, in principle, be wrapped as a
Norma `AgentRunner`.

### LangChain / LangGraph
**What it is:** a generic library of components for building LLM applications (models,
memory, RAG, tools, chains). LangGraph adds stateful agent orchestration. The developer
assembles the flow — and, often, the LLM decides the hops at runtime.

**Layer:** _toolkit_ / building framework (the bottom layer).

**Difference from Norma:** LangChain gives you the bricks to build **any** flow
*yourself*; Norma **is already** a finished, opinionated flow, with the decision in the
hands of a deterministic engine. You could even use LangChain *inside* a Norma
`AgentRunner`. The overlap exists only in the "orchestration" slice (LangGraph) — and
even there the bet is opposite: flexibility (LLM decides) × determinism (code decides).

### Orca (stablyai/orca) — and fleet ADEs in general
**What it is:** a development environment (desktop/mobile) for a human to pilot many
coding agents in parallel, each in its own git worktree, comparing outputs, annotating
diffs, and choosing the merge. Explicitly *human-in-the-loop*.

**Layer:** _cockpit_ for the human (above the agent, but with you at the center).

**Difference from Norma:** Orca **amplifies you** — it gives you superpowers to ship
faster, with human judgment at the center of the loop. Norma **replaces the operator** —
it takes you out of the decision loop so the line runs itself (including via cron), in a
predictable and auditable way. Both sit above the execution agent, but Orca hands you the
wheel while Norma keeps the wheel to itself.

## Layer summary

```
   Human in command (cockpit)     ......  Orca (ADE / human-in-the-loop fleet)
            │
   Flow decision                  ......  Norma  ⚙️ deterministic  ×  LangGraph 🤖 LLM decides
            │
   Task execution (the agent)     ......  Claude Code · Hermes · Codex · …
            │
   LLM bricks (models/RAG/tools)  ......  LangChain
```

Norma occupies **a single band**: the flow decision, made by code. Everything below
(execution, bricks) is delegated through ports & adapters; everything above (the human
driving) is, by design, absent.

## The ruler for saying "no"

When the question "should Norma do X?" comes up, the test is:

1. **Is X deciding _what_ / _in what order_ based on the state of the tasks?** → yes,
   that is Norma's (and it must be deterministic, in the engine).
2. **Is X _executing_ the work of a task?** → not Norma's; it is the `AgentRunner`'s.
3. **Does X require a human in the decision loop, or a UI to pilot?** → not Norma's.
4. **Is X a generic LLM capability (memory, RAG, evolving skills)?** → not Norma's; at
   most it enters as context via `@norma/context`.

If X does not pass test 1, it probably belongs to **another layer** — and the correct
answer is an adapter/runner, not a change to the engine.
