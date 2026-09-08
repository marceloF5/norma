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

### A parametric model (fill in your own numbers)

We deliberately **do not quote fabricated token counts here.** The savings depend on your
prompts, your models, and your board — numbers we have not measured. Instead, here is the
model as variables; plug in your own measured values.

**The variables:**

| Symbol | Meaning | Known or measured? |
|---|---|---|
| `D` | Flow **decisions per task** | **Known** — it's the number of decision points in the pipeline |
| `c` | Token cost of **one** orchestration decision (re-read board + reason + emit step) | **Measure it** — depends on prompt & board size |
| `W` | Token cost of the **work** in a task (write/review/test) | **Measure it** — same in both models |
| `N` | Number of tasks in the epic | **Known** — read off the board |

**`D` is the one value we can ground**, because it comes from the pipeline's phase graph,
not from a guess. A software-dev task passes through:
`promote → dispatch → evaluate review → (rework?) → evaluate QA → complete`. That is about
**5 decision points** on the happy path, and **+2 per rework round**. In an agent-driven
orchestrator each of those is an LLM call; in Norma each is a branch of `computePlan`
(zero tokens).

**The formulas:**

```
Orchestration overhead per task (agent-driven):   D × c
Orchestration overhead per task (Norma):           0        ← computePlan is code

Tokens saved over an epic:                         N × D × c

Overhead as a share of total spend:                (D × c) / (D × c + W)
```

**How to read it, without inventing numbers:**

- Norma's orchestration overhead is **exactly zero tokens** — that part is not an
  estimate, it's a property of deciding in code. The whole `N × D × c` term simply
  disappears.
- The **share** you save is `(D·c) / (D·c + W)`. It rises when decisions are many or
  expensive (`D·c` large) and falls when the per-task work dwarfs them (`W` large). So
  the win is biggest on **long, loop-heavy flows with lighter tasks**, and smallest on
  **short flows with one very heavy task**.
- The two levers that move it most: how much **board context** each decision drags along
  (bigger boards → larger `c`) and how many **rework/QA rounds** occur (each round raises
  `D` but adds little to `W`).

**To turn this into real numbers:** instrument one real epic — log the tokens spent on
orchestration decisions vs. on task work — and substitute your measured `c`, `W`, `D`,
`N`. Until then, treat the only hard figure as the one that needs no measurement: the
overhead Norma removes is `100%` of `N × D × c`.

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
