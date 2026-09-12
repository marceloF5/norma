# Model selection

Norma is an **orchestrator**, not a model gateway. It decides *what* work is ready
and *which* agent should do it — then it hands that work to a **runtime** (Claude Code,
OpenCode, or any CLI you wrap). The runtime owns model access: providers, API keys,
rate limits, billing.

So Norma never talks to a model API. It only carries a **model selector** — a string
like `claude-opus-4-8` or `openai/gpt-4o` — and forwards it to the runtime, which
resolves the provider and makes the call.

> Selecting a model ≠ accessing a model. Norma selects; the runtime accesses.

## Where a selector can come from

There are two places to set one. The more specific wins.

1. **Per-agent (recommended)** — a `model:` field in the agent's `.md` frontmatter.
   This lets each role pick the model that fits it: a cheap fast model for triage,
   a strong model for review.

   ```markdown
   ---
   role: reviewer
   stage: review
   model: claude-opus-4-8
   ---
   You are the reviewer. Block anything that would fail CI…
   ```

2. **Global (per runtime)** — `runtime.options.model` in `norma.config`. Applies to
   every role that doesn't pin its own, and **overrides** the per-agent value when set,
   so it doubles as a one-line "force everything onto this model" switch.

   ```jsonc
   {
     "runtime": {
       "kind": "opencode",
       "options": { "model": "openai/gpt-4o" }
     }
   }
   ```

If neither is set, the runtime falls back to its own default model.

## Runtimes

| Runtime | `kind` | Selector examples | Who resolves the model |
|---|---|---|---|
| Claude Code | `claude-code` | `claude-opus-4-8`, `claude-sonnet-5` | Claude Code CLI + your auth |
| OpenCode | `opencode` | `openai/gpt-4o`, `anthropic/claude-...`, `ollama/llama3` | OpenCode (multi-provider) |
| Command | `command` | anything — you build the argv | your wrapper script |
| Human | `human` | — | a person, via tracker comments |
| Echo | `echo` | — | nobody (offline dry-run) |

OpenCode is the multi-provider path: because it speaks to OpenAI, Anthropic, local
Ollama models and more, picking `openai/gpt-4o` vs `ollama/llama3` is *just the selector*
Norma forwards. The `command` runtime is the universal escape hatch — wrap `aider`,
a custom script, or any CLI, and you decide entirely how the selector maps to argv.

## How it's forwarded

Every CLI runtime is built on one generic runner (`CliAgentRunner`). It composes the
prompt, reads the selected model, and lets each runtime map that selector into argv:

```ts
// claude-code → claude -p <prompt> --model <selector> --permission-mode …
// opencode    → opencode run --model <selector> <prompt>
new CliAgentRunner({
  kind: "opencode",
  bin: "opencode",
  buildArgs: (prompt, model) => [
    "run",
    ...(model ? ["--model", model] : []),
    prompt,
  ],
});
```

Adding a new agent CLI is a *config*, not new code: give it a `bin` and a `buildArgs`
that places `--model <selector>` where that CLI expects it.

## Why selection lives in Norma but access doesn't

Keeping model access out of the orchestrator keeps Norma runtime-neutral and
credential-free:

- **No secrets in the orchestrator.** API keys stay with the runtime you already trust.
- **Swap models without touching the engine.** The deterministic plan doesn't change
  when you move a role from one model to another — only the selector does.
- **Mix models per role.** Triage on a fast model, review on a strong one, all in one
  cycle, because the selector is per-agent.
