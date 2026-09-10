import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseEpicPlan, slugify, validateEpicPlan } from "@norma/config";
import type { Command } from "commander";
import { type ResolvedConfig, makeContext, makeRunner, makeTracker } from "../factory.js";
import {
  buildPlannerPrompt,
  labelsForPlan,
  materializeEpic,
  renderPlanDoc,
} from "../materialize.js";

type Resolver = () => Promise<ResolvedConfig>;

interface EpicFlags {
  planFile?: string;
  brief?: string;
  briefFile?: string;
  slug?: string;
  worktree?: string;
  dryRun: boolean;
}

/** `norma epic` — intake: turn a demand into a tracker project + tasks + DAG. */
export function registerEpic(program: Command, resolved: Resolver): void {
  program
    .command("epic")
    .description(
      "intake: decompose a demand into a project + tasks + dependency DAG in the tracker",
    )
    .option(
      "--plan-file <path>",
      "materialize an existing epic plan (JSON) instead of running the planner",
    )
    .option("--brief <text>", "the demand, inline (planner path)")
    .option("--brief-file <path>", "the demand, from a file (planner path)")
    .option("--slug <slug>", "epic slug (default: derived from the plan name)")
    .option("--worktree <path>", "cwd for the planner agent")
    .option("--dry-run", "validate + print the plan without writing to the tracker", false)
    .action((flags: EpicFlags) => runEpic(flags, resolved));
}

async function runEpic(flags: EpicFlags, resolved: Resolver): Promise<void> {
  const r = await resolved();
  const plan = flags.planFile
    ? parseEpicPlan(JSON.parse(await readFile(flags.planFile, "utf8")))
    : await runPlanner(flags, r);

  // Semantic validation (deadlock guard, unknown deps, owner lanes).
  const errors = validateEpicPlan(plan, { workerTypes: r.config.policy.workerTypes });
  if (errors.length) {
    console.error("Invalid epic plan:");
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }

  const slug = flags.slug ?? plan.slug ?? slugify(plan.name);

  if (flags.dryRun) {
    console.log(renderPlanDoc(plan));
    console.log(`labels needed: ${labelsForPlan(plan, r.config).join(", ")}`);
    console.log(`(dry-run — nothing written; slug would be "${slug}")`);
    return;
  }

  const tracker = makeTracker(r.config);
  const result = await materializeEpic(plan, tracker, r.config);

  // Persist durable context: the brief + the human-readable PLAN.
  const context = makeContext(r.contextRoot);
  if (plan.brief) await context.writeBrief(slug, plan.brief);
  await context.writePlan(slug, renderPlanDoc(plan, result));

  console.log(
    JSON.stringify(
      {
        project: result.projectId,
        url: result.url,
        slug,
        created: result.created.map((c) => ({ ref: c.ref, title: c.title })),
      },
      null,
      2,
    ),
  );
  console.error(`\n✅ epic created — run: norma cycle ${result.projectId} --slug ${slug}`);
}

/** Run the planner agent, which writes the plan JSON to a known path; then read it. */
async function runPlanner(flags: EpicFlags, r: ResolvedConfig) {
  const brief =
    flags.brief ?? (flags.briefFile ? await readFile(flags.briefFile, "utf8") : undefined);
  if (!brief) throw new Error("provide --brief / --brief-file (planner path) or --plan-file");

  const intakeDir = join(r.contextRoot, "epics", "_intake");
  await mkdir(intakeDir, { recursive: true });
  const outPath = join(intakeDir, "plan.json");

  const runner = makeRunner(r.config, r.agentsDir);
  const prompt = buildPlannerPrompt(brief, r.config, outPath);
  const outcome = await runner.run({
    kind: "plan",
    role: r.config.roles.escalate,
    context: prompt,
    worktree: flags.worktree ?? r.root,
  });
  if (outcome.verdict !== "ok") {
    throw new Error(`planner did not complete (verdict=${outcome.verdict}): ${outcome.summary}`);
  }
  return parseEpicPlan(JSON.parse(await readFile(outPath, "utf8")));
}
