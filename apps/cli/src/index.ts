import { EchoRunner } from "@norma/agent-runtime";
import { type NormaConfig, toPlanContext } from "@norma/config";
import { Phase, computePlan } from "@norma/core";
import { Orchestrator } from "@norma/orchestrator";
import { MemoryTracker, type RawIssue, applyFor, normalize } from "@norma/tracker";
import { Command } from "commander";
import { registerAgents } from "./commands/agents.js";
import { registerDoctor } from "./commands/doctor.js";
import { registerEpic } from "./commands/epic.js";
import { registerInit } from "./commands/init.js";
import { openPullRequest, registerReport, writeEpicReport } from "./commands/report.js";
import {
  type ResolvedConfig,
  makeContext,
  makeRunner,
  makeTracker,
  resolveConfig,
} from "./factory.js";

interface GlobalOpts {
  config?: string;
  tracker?: string;
  runtime?: string;
}

const program = new Command();
program
  .name("norma")
  .description("Norma — provider-agnostic orchestration for AI agent pipelines")
  .version("0.0.0")
  .option(
    "-c, --config <path>",
    "path to a norma config JSON (default: discover norma.config.json)",
  )
  .option("--tracker <kind>", "override tracker kind (linear|jira|memory)")
  .option("--runtime <kind>", "override agent runtime (claude-code|echo)");

/** Resolve config (discovery + overrides) shared by every command. */
export async function resolved(): Promise<ResolvedConfig> {
  const g = program.opts<GlobalOpts>();
  const r = await resolveConfig(g.config);
  if (g.tracker)
    r.config.tracker = { ...r.config.tracker, kind: g.tracker as NormaConfig["tracker"]["kind"] };
  if (g.runtime)
    r.config.runtime = { ...r.config.runtime, kind: g.runtime as NormaConfig["runtime"]["kind"] };
  return r;
}

program
  .command("whoami")
  .description("verify tracker credentials and print the acting identity")
  .action(async () => {
    const { config } = await resolved();
    const tracker = makeTracker(config);
    const me = await tracker.whoami();
    console.log(JSON.stringify({ tracker: tracker.kind, ...me }, null, 2));
  });

program
  .command("plan")
  .argument("<projectId>", "tracker project/epic id")
  .description("print the deterministic engine plan (no writes)")
  .action(async (projectId: string) => {
    const { config } = await resolved();
    const tracker = makeTracker(config);
    const raw = await tracker.listIssues({ projectId });
    const tasks = normalize(raw, config.phaseMapping);
    const plan = computePlan(tasks, toPlanContext(config));
    console.log(JSON.stringify(plan, null, 2));
  });

program
  .command("cycle")
  .argument("<projectId>", "tracker project/epic id")
  .description("run one operator cycle (plan → execute → write-back → re-plan)")
  .option("--slug <slug>", "epic slug for durable context lookups")
  .option("--worktree <path>", "worktree path handed to agents")
  .option("--max-steps <n>", "safety cap on loop iterations", "100")
  .option("--dry-run", "plan only — no writes, no agent runs", false)
  .option("--pr", "on completion, open a PR with the generated report as its body", false)
  .action(
    async (
      projectId: string,
      opts: { slug?: string; worktree?: string; maxSteps: string; dryRun: boolean; pr: boolean },
    ) => {
      const r = await resolved();
      const orch = new Orchestrator({
        config: r.config,
        tracker: makeTracker(r.config),
        runner: makeRunner(r.config, r.agentsDir),
        context: makeContext(r.contextRoot),
        logger: (m) => console.error(m),
      });
      const result = await orch.runCycle({
        projectId,
        slug: opts.slug,
        worktree: opts.worktree,
        maxSteps: Number(opts.maxSteps),
        dryRun: opts.dryRun,
        onComplete: async ({ slug }) => {
          const s = slug ?? projectId;
          const { path } = await writeEpicReport(r, projectId, s);
          console.error(`✅ epic complete (${s}) — report: ${path}`);
          if (opts.pr) {
            const code = await openPullRequest(path, {
              title: `feat: ${s}`,
              cwd: opts.worktree ?? r.root,
            });
            console.error(
              code === 0 ? "   PR opened." : "   PR not opened (gh failed or no pushed branch).",
            );
          }
        },
      });
      console.log(
        JSON.stringify(
          {
            steps: result.steps,
            complete: result.complete,
            executed: result.executed,
            anomalies: result.anomalies,
          },
          null,
          2,
        ),
      );
    },
  );

program
  .command("complete")
  .argument("<projectId>", "tracker project/epic id")
  .description("flip every released task to done (the /staging step)")
  .action(async (projectId: string) => {
    const { config } = await resolved();
    const tracker = makeTracker(config);
    const raw = await tracker.listIssues({ projectId });
    const tasks = normalize(raw, config.phaseMapping);
    const releasedIds = tasks.filter((t) => t.phase === Phase.RELEASED).map((t) => t.id);
    const apply = applyFor(Phase.DONE, config.phaseMapping);
    if (!apply) throw new Error("no apply rule for 'done'");
    if (releasedIds.length) await tracker.bulkTransition(releasedIds, apply);
    console.log(JSON.stringify({ movedToDone: releasedIds.length }, null, 2));
  });

program
  .command("demo")
  .description("run a full cycle offline (memory tracker + echo runner) — no credentials needed")
  .action(async () => {
    const { config } = await resolved();
    const seed: RawIssue[] = [
      {
        id: "iss-1",
        ref: "DEMO-1",
        title: "API endpoint",
        state: "Backlog",
        labels: ["agent:api", "qa-batch:1", "harness"],
        blockedBy: [],
        order: 1,
      },
      {
        id: "iss-2",
        ref: "DEMO-2",
        title: "Web page",
        state: "Backlog",
        labels: ["agent:web", "qa-batch:2", "harness"],
        blockedBy: [{ id: "iss-1", ref: "DEMO-1", state: "Backlog" }],
        order: 2,
      },
    ];
    const tracker = new MemoryTracker({ seed, bounceMarker: config.phaseMapping.bounceMarker });
    const orch = new Orchestrator({
      config,
      tracker,
      runner: new EchoRunner(),
      logger: (m) => console.error(m),
    });
    const result = await orch.runCycle({
      projectId: "demo",
      onComplete: () => console.error("✅ demo epic complete"),
    });
    const issues = await tracker.listIssues({ projectId: "demo" });
    console.log(
      JSON.stringify(
        {
          steps: result.steps,
          complete: result.complete,
          finalStates: issues.map((i) => ({ ref: i.ref, state: i.state, labels: i.labels })),
        },
        null,
        2,
      ),
    );
  });

// Onboarding & maintenance commands (each registers itself on the program).
registerInit(program, resolved);
registerEpic(program, resolved);
registerReport(program, resolved);
registerDoctor(program, resolved);
registerAgents(program, resolved);

program.parseAsync().catch((err) => {
  console.error("FATAL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
