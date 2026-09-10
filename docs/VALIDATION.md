# Live validation

Norma's adapters are unit-tested offline with mocked `fetch` (locking request/response
shapes). This document tracks validation against **live** provider APIs, which requires
real credentials.

## GitHub — read path ✅ (2026-09-10)

Validated against the real `marceloF5/norma` repo using the `gh` CLI token:

```bash
export GITHUB_TOKEN=$(gh auth token)
node apps/cli/dist/index.js --config <github.config with repo=marceloF5/norma> whoami
# → { tracker: "github", id, name, context: { repo: "marceloF5/norma" } }
```

`whoami`, `listStates`, and `listLabels` all succeeded against the live API, exercising
auth, the REST client, retry wrapper, and response parsing.

**Not yet run (create/transition write path):** creating a milestone + issues, moving a
card, and adding a `blocked-by` label mutate the real repo, so they're gated on explicit
approval. When ready:

```bash
export GITHUB_TOKEN=$(gh auth token) GITHUB_REPO=<owner/repo>
norma --config examples/github.config.json epic --plan-file <plan.json>   # creates milestone + issues
norma --config examples/github.config.json status <milestone-number>
# then clean up the throwaway milestone/issues
```

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
