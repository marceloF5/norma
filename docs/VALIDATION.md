# Live validation

Norma's adapters are unit-tested offline with mocked `fetch` (locking request/response
shapes). This document tracks validation against **live** provider APIs, which requires
real credentials.

## GitHub — full read + write path ✅ (2026-09-11)

Validated end-to-end against the real `marceloF5/norma` repo using the `gh` CLI token:

- **Read:** `whoami`, `listStates`, `listLabels`, `listIssues`, `plan`, `status`.
- **Write:** `norma epic --plan-file` created a milestone + 2 issues (labels + a
  `blocked-by` DAG edge); `norma cycle --runtime echo` drove the whole epic
  promote → dispatch → review → qa → released for both tasks (respecting the DAG),
  ending `complete: true`. Throwaway milestone/issues/label were cleaned up after.

**Bug found & fixed by this run:** on GitHub, phases live in labels (released = open +
`qa-approved`), but the normalizer classified a blocker from its *state* alone — so a
released blocker read as "backlog" and its dependent never unblocked. `RawDependency`
now carries the blocker's `labels`, and the GitHub adapter supplies them
(`normalize` classifies with state + labels). Covered by a regression test.

## Linear / Jira — pending credentials

Run the same checklist once the keys are set:

```bash
# Linear
export LINEAR_API_KEY=lin_api_xxx
norma whoami
norma plan <projectId>          # read-only
norma cycle <projectId> --dry-run

# Jira Cloud
export JIRA_BASE_URL=https://your-site.atlassian.net JIRA_EMAIL=you@x.com JIRA_API_TOKEN=xxx JIRA_PROJECT=ENG
norma --config examples/jira.config.json whoami
```

Required scopes: Linear personal API key (issues read/write); Jira API token (browse
projects, edit issues, transition issues); GitHub token with `repo` scope.

## Interactive `norma init` (issue #8)

The non-interactive path (`norma init --yes …`) is verified. The interactive wizard —
column→phase mapping, missing state/label provisioning, agent/runtime selection — needs a
manual run against a real Linear board to confirm end-to-end. Drive `norma init` (no
`--yes`) with `LINEAR_API_KEY` set and confirm the generated `norma.config.json` + agents.
