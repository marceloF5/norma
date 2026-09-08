# Why a deterministic orchestrator

Norma's central bet is that **the flow decision — _what_ happens next and _in what
order_ — should be pure code, not an LLM call.** The LLM is reserved for the one thing
only it can do: the creative work inside a task. This document lays out what that bet
buys you.

The short version: **when a process is already determined, paying an LLM to re-derive it
every step is waste.** Determinism removes that waste and, as a bonus, makes the whole
pipeline predictable, auditable, and cheap to run unattended.

## 1. Token economy on already-determined processes

A pipeline like "worker → review → (rework loop) → QA per batch → complete" has a
**fixed shape**. The ordering rules — the dependency DAG, the one-in-flight gate, batch
readiness, the escalate-at-N threshold — never change from run to run. They are known in
advance.

In an agent-driven orchestrator, every one of those decisions is an LLM call:

- the model re-reads the current state,
- reasons about "what now?",
- emits a next step,
- and sometimes gets it wrong and needs another round.

You pay tokens **just for the model to play project manager** — a role whose logic is
already fully specified.

In Norma, that "what now?" is `computePlan(tasks)` — pure code, **zero tokens**. The LLM
is invoked only for work that genuinely needs it (writing, reviewing, testing one task).

```
Cost of one task advancing:

  Agent-driven:   [decide: LLM] + [do the work: LLM]   ← you pay twice
  Norma:          [decide: code] + [do the work: LLM]   ← you pay once
                   ▲ free
```

**Where this matters most.** The savings scale with the length and repetitiveness of the
flow:

- **Short flow, few steps** → small difference; the decision cost is paid few times.
- **Long flow, many tasks, lots of rework/QA loops** → the savings **compound**, because
  the decide-by-LLM cost repeats dozens of times and can itself trigger error rounds.

The cost of the *work itself* (writing a task's code) is roughly the same either way —
you pay that regardless. What determinism cuts is the **orchestration overhead**.

> Honest caveat: determinism does not guarantee fewer tokens in *every* case. On a tiny
> one-shot flow the difference is marginal. The win is structural and shows up in long,
> repetitive, unattended pipelines — exactly where Norma is meant to run.

### A back-of-the-envelope model

> ⚠️ **These numbers are an illustrative model, not a benchmark.** They exist to convey
> order of magnitude and to give you a formula to plug your own measured values into.
> Real figures depend on your prompts, models, and how much board context each decision
> carries. Measure before you quote.

**The overhead we're pricing.** In an agent-driven orchestrator, every flow decision is
one LLM call that must (re)read the board state, reason, and emit the next step. Model a
single decision as:

```
decision cost ≈ input (board state + rules + task context) + output (the chosen step)
              ≈ ~3,000 in + ~300 out  ≈ ~3,300 tokens per decision
```

**Decisions per task.** A software-dev task passes through several decision points:
`promote → dispatch → evaluate review → (rework?) → evaluate QA → complete`. Call it
**~5 decisions** on the happy path, **~7** with one rework loop.

```
Orchestration overhead per task (agent-driven):
  happy path:   5 × 3,300  ≈ 16,500 tokens
  with rework:  7 × 3,300  ≈ 23,100 tokens

In Norma: 0 tokens (computePlan is code).
```

**As a percentage of the total.** The *work* (writing/reviewing/testing the task) costs
the same either way — say `W` tokens per task. The overhead's share is
`overhead / (overhead + W)`:

| Task work `W` (tokens) | Overhead share, agent-driven | What Norma saves |
|---|---|---|
| Light task (~20k) | 16.5k / 36.5k ≈ **~45%** | ~45% of total tokens |
| Typical task (~50k) | 16.5k / 66.5k ≈ **~25%** | ~25% of total tokens |
| Heavy task (~100k) | 16.5k / 116.5k ≈ **~14%** | ~14% of total tokens |

So, as a rule of thumb, a deterministic engine tends to cut **~15–45% of total tokens**,
landing around **~20–25% on typical coding tasks** — and *more* as flows get longer or
loop more (rework/QA), because the overhead recurs while the work does not.

**Scaled to an epic.** For a 20-task epic on the happy path:

```
Agent-driven orchestration overhead:  20 × 16,500  ≈ 330,000 tokens spent only deciding
Norma orchestration overhead:                        0 tokens
```

**Plug your own numbers:**

```
savings ≈ (decisions_per_task × cost_per_decision) × task_count
share   ≈ overhead_per_task / (overhead_per_task + work_per_task)
```

The two levers that move it most: how much **board context** each decision drags along
(bigger boards → pricier decisions) and how many **rework/QA rounds** occur (each round
adds decisions but not proportional work).

## 2. Predictability — same input, same plan

`computePlan` is a pure function. Given the same task state, it returns the same plan,
every time. That means:

- No run-to-run drift in *what* the pipeline does.
- No "the model decided differently today" surprises.
- The behavior is a property of the code, not of a sampling temperature.

An LLM asked to decide the flow is, by nature, non-deterministic: the same state can
yield different next steps across runs. That is fine when you *want* creativity — and
wrong when you want a process to behave the same way twice.

## 3. Auditability — you can prove why it did what it did

Because the decision is code, you can:

- **Read** the exact rule that fired (`file:line`).
- **Unit-test** every branch of the orchestration logic in isolation, offline, with no
  API calls (the engine has zero I/O).
- **Reproduce** any decision deterministically for debugging or compliance.

When an agent decides the flow, the "why" is buried in a prompt + a sample. You can log
it, but you cannot *test* it exhaustively or guarantee it. Determinism turns
orchestration into something you can reason about like any other program.

## 4. Reliability when running unattended

Norma is built to run headless — on cron, in a sandbox, with no human watching. That
raises the bar on the decision layer:

- A deterministic engine **cannot hallucinate** a next step, skip a gate, or invent a
  task. It can only do what the rules allow.
- Failure modes are bounded and known (a task fails → rework loop → escalate at N),
  rather than open-ended ("the model got confused").
- The gates (one-in-flight, QA batch, dependency DAG) are **hard invariants**, not
  suggestions the model may or may not honor.

This is what makes it safe to take the human out of the loop.

## 5. Speed and cost beyond tokens

Deciding by code is not just cheaper in tokens — it is:

- **Faster**: no network round-trip and no model latency to compute the next step.
- **More reliable operationally**: no rate limits, no provider outages, no retries on the
  *decision* (only the *work* can fail and be retried).
- **Free to re-plan**: Norma re-plans to a fixed point every cycle; re-running a pure
  function costs nothing, so it can afford to re-derive the whole plan constantly.

## 6. Clean separation of concerns

Determinism forces a sharp seam:

- **Engine** = the policy (what/when), pure and testable.
- **Agent** = the craft (how), where creativity belongs.

That seam is what lets Norma swap the tracker, the agent runtime, or the pipeline
definition independently. If the flow logic lived inside prompts, every change would risk
the model's behavior; because it lives in code, changes are localized, reviewable, and
covered by tests.

## When determinism is the *wrong* choice

To be fair, deterministic orchestration is not always the answer. Prefer an
LLM-driven flow when:

- The set of possible next steps is **open-ended or unknown ahead of time** (open
  research, exploratory problem-solving).
- The "right" next step depends on **nuanced judgment of unstructured content** that you
  cannot encode as rules.
- You *want* creative variation in the path itself, not just in the execution.

Norma's domain is the opposite: pipelines whose shape is **known and repeated**. For
those, encoding the flow as rules is not a limitation — it is the whole point.

## Summary

| Property | Deterministic engine (Norma) | LLM-driven orchestration |
|---|---|---|
| Token cost of deciding | **Zero** | Paid every step |
| Same input → same plan | **Yes** | No (sampling) |
| Unit-testable / auditable | **Yes** | Hard |
| Latency of a decision | **None** (local) | Model round-trip |
| Can skip a gate / hallucinate a step | **No** | Possible |
| Best for | Known, repeated pipelines | Open-ended, judgment-heavy flows |

Token economy is the most tangible benefit, but it is really a **symptom** of the deeper
property: when a process is already determined, expressing it as code — instead of asking
a model to rediscover it every time — is cheaper, faster, safer, and provable.
