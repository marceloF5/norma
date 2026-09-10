import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { JiraAdapter } from "@norma/adapter-jira";
import { LinearAdapter } from "@norma/adapter-linear";
import { type AgentSpec, type AgentStage, getAgent, writeAgents } from "@norma/agents";
import { type NormaConfig, parseConfig } from "@norma/config";
import {
  type TrackerAdapter,
  type TrackerIntrospection,
  type TrackerState,
  canProvisionBoard,
  supportsIntrospection,
} from "@norma/tracker";
import type { Command } from "commander";
import { CONFIG_FILENAME, type ResolvedConfig, findConfigPath } from "../factory.js";
import {
  type BoardSlots,
  DEFAULT_LABELS,
  buildConfig,
  defaultSlots,
  labelsUsed,
  statesUsed,
} from "../mapping.js";

type Resolver = () => Promise<ResolvedConfig>;

interface InitFlags {
  yes: boolean;
  tracker?: string;
  team?: string;
  baseUrl?: string;
  projectKey?: string;
  workers?: string;
  runtime?: string;
  model?: string;
  force: boolean;
}

const bail = (msg: string): never => {
  p.cancel(msg);
  process.exit(1);
};

/** Throw-to-cancel wrapper for clack prompts. */
function check<T>(value: T | symbol): T {
  if (p.isCancel(value)) bail("Cancelled.");
  return value as T;
}

/** Build the tracker adapter from the collected options, for introspection. */
function makeAdapter(kind: string, opts: Record<string, string | undefined>): TrackerAdapter {
  const bounceMarker = DEFAULT_LABELS.bounceMarker;
  if (kind === "linear") return new LinearAdapter({ team: opts.team, bounceMarker });
  if (kind === "jira")
    return new JiraAdapter({ baseUrl: opts.baseUrl, projectKey: opts.projectKey, bounceMarker });
  throw new Error(`introspection not supported for tracker "${kind}"`);
}

/** A catalog spec for a role, or a generic spec of the right stage with the role renamed. */
function specForRole(role: string, stage: AgentStage): AgentSpec {
  const exact = getAgent(role);
  if (exact) return exact;
  const generic = {
    worker: "engineer",
    review: "reviewer",
    qa: "tester",
    escalate: "principal-engineer",
  }[stage];
  const base = getAgent(generic);
  if (!base) throw new Error(`no catalog fallback for stage ${stage}`);
  return { ...base, role };
}

export function registerInit(program: Command, _resolved: Resolver): void {
  program
    .command("init")
    .description("interactive onboarding: map your board, pick agents, generate norma.config.json")
    .option("--yes", "non-interactive: accept defaults + flags", false)
    .option("--tracker <kind>", "linear | jira | memory")
    .option("--team <team>", "Linear team key/name")
    .option("--base-url <url>", "Jira base URL")
    .option("--project-key <key>", "Jira project key")
    .option("--workers <list>", "comma-separated worker lanes, e.g. api,web")
    .option("--runtime <kind>", "claude-code | echo")
    .option("--model <model>", "default model for the runtime")
    .option("--force", "overwrite an existing norma.config.json", false)
    .action((_opts, command: Command) =>
      runInit(command.optsWithGlobals() as unknown as InitFlags),
    );
}

async function runInit(flags: InitFlags): Promise<void> {
  const root = process.cwd();
  const configPath = join(root, CONFIG_FILENAME);
  const agentsDir = join(root, ".norma", "agents");

  p.intro("norma init — set up orchestration for this project");

  const existing = await findConfigPath(root);
  if (existing === configPath && !flags.force) {
    if (flags.yes) bail(`${CONFIG_FILENAME} already exists (use --force to overwrite).`);
    const go = check(
      await p.confirm({ message: `${CONFIG_FILENAME} exists. Overwrite?`, initialValue: false }),
    );
    if (!go) bail("Kept the existing config.");
  }

  // --- tracker -------------------------------------------------------------
  const trackerKind = flags.yes
    ? (flags.tracker ?? "linear")
    : check(
        await p.select({
          message: "Which tracker backs this project?",
          options: [
            { value: "linear", label: "Linear" },
            { value: "jira", label: "Jira Cloud" },
            { value: "memory", label: "In-memory (offline / testing)" },
          ],
          initialValue: (flags.tracker as "linear") ?? "linear",
        }),
      );

  const trackerOptions: Record<string, string | undefined> = {};
  if (trackerKind === "linear") {
    trackerOptions.team = flags.yes
      ? (flags.team ?? process.env.LINEAR_TEAM ?? "Redisco")
      : check(
          await p.text({
            message: "Linear team (key or name)",
            initialValue: flags.team ?? process.env.LINEAR_TEAM ?? "",
          }),
        );
    if (!process.env.LINEAR_API_KEY)
      p.log.warn("LINEAR_API_KEY not set — set it to enable board introspection and runs.");
  } else if (trackerKind === "jira") {
    trackerOptions.baseUrl = flags.yes
      ? (flags.baseUrl ?? process.env.JIRA_BASE_URL)
      : check(
          await p.text({
            message: "Jira base URL",
            initialValue: flags.baseUrl ?? process.env.JIRA_BASE_URL ?? "",
          }),
        );
    trackerOptions.projectKey = flags.yes
      ? (flags.projectKey ?? process.env.JIRA_PROJECT)
      : check(
          await p.text({
            message: "Jira project key",
            initialValue: flags.projectKey ?? process.env.JIRA_PROJECT ?? "",
          }),
        );
  }

  // --- introspect the board ------------------------------------------------
  let states: TrackerState[] = [];
  if (trackerKind !== "memory") {
    const s = p.spinner();
    try {
      s.start("Connecting to the tracker…");
      const adapter = makeAdapter(trackerKind, trackerOptions);
      const me = await adapter.whoami();
      if (supportsIntrospection(adapter)) states = await adapter.listStates();
      s.stop(`Connected as ${me.name ?? me.id} — found ${states.length} board columns.`);
    } catch (e) {
      s.stop(
        `Could not connect (${e instanceof Error ? e.message : e}). Using preset column names.`,
      );
    }
  }

  // --- workers + gates -----------------------------------------------------
  const workers = (
    flags.yes
      ? (flags.workers ?? "api,web")
      : check(
          await p.text({
            message: "Worker lanes (comma-separated)",
            initialValue: flags.workers ?? "api,web",
          }),
        )
  )
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean);

  const concurrency = flags.yes
    ? 1
    : Number(check(await p.text({ message: "Max in-flight tasks per worker", initialValue: "1" })));
  const escalateAtBounces = flags.yes
    ? 2
    : Number(
        check(await p.text({ message: "Escalate a task after N bounces", initialValue: "2" })),
      );

  // --- map board columns → phases -----------------------------------------
  const slots = defaultSlots(states);
  if (!flags.yes && states.length) {
    const stateOptions = states.map((s) => ({
      value: s.name,
      label: `${s.name}${s.type ? ` (${s.type})` : ""}`,
    }));
    for (const slot of Object.keys(slots) as (keyof BoardSlots)[]) {
      slots[slot] = check(
        await p.select({
          message: `Column for phase "${slot}"`,
          options: stateOptions,
          initialValue: slots[slot],
        }),
      );
    }
  }

  // --- roles + runtime -----------------------------------------------------
  const worker: Record<string, string> = {};
  for (const w of workers) {
    const guess = getAgent(`${w}-engineer`) ? `${w}-engineer` : "engineer";
    worker[w] = flags.yes
      ? guess
      : check(await p.text({ message: `Agent role for lane "${w}"`, initialValue: guess }));
  }
  const review = flags.yes
    ? "code-reviewer"
    : check(await p.text({ message: "Reviewer role", initialValue: "code-reviewer" }));
  const qa = flags.yes
    ? "qa-engineer"
    : check(await p.text({ message: "QA role", initialValue: "qa-engineer" }));
  const escalate = flags.yes
    ? "principal-engineer"
    : check(await p.text({ message: "Escalation role", initialValue: "principal-engineer" }));

  const runtimeKind = flags.yes
    ? (flags.runtime ?? "claude-code")
    : check(
        await p.select({
          message: "Agent execution runtime",
          options: [
            { value: "claude-code", label: "Claude Code (claude -p)" },
            { value: "echo", label: "Echo (offline stub)" },
          ],
          initialValue: (flags.runtime as "claude-code") ?? "claude-code",
        }),
      );
  const model =
    flags.model ??
    (flags.yes
      ? undefined
      : check(
          await p.text({
            message: "Default model (blank = per-agent suggestion)",
            initialValue: "",
          }),
        ) || undefined);

  // --- assemble + validate -------------------------------------------------
  const config: NormaConfig = buildConfig({
    name: trackerOptions.team ?? trackerOptions.projectKey ?? "norma",
    tracker: {
      kind: trackerKind as NormaConfig["tracker"]["kind"],
      options: pruneUndefined(trackerOptions),
    },
    runtime: {
      kind: runtimeKind as NormaConfig["runtime"]["kind"],
      options: model ? { model } : {},
    },
    workers,
    concurrency,
    escalateAtBounces,
    roles: { worker, review, qa, escalate },
    slots,
    labels: DEFAULT_LABELS,
  });
  parseConfig(config); // throws if invalid

  // --- provision missing board states/labels -------------------------------
  if (trackerKind !== "memory" && states.length) {
    try {
      const adapter = makeAdapter(trackerKind, trackerOptions);
      if (canProvisionBoard(adapter) && supportsIntrospection(adapter)) {
        await provision(adapter, slots, flags.yes);
      } else {
        // Read-only board (e.g. Jira statuses are admin-managed): guide manual setup.
        const have = new Set(states.map((s) => s.name.toLowerCase()));
        const missing = statesUsed(slots).filter((s) => !have.has(s.toLowerCase()));
        if (missing.length) {
          p.note(
            [
              "This tracker can't create statuses automatically. Add these columns/",
              "statuses to your board so the pipeline can move cards:",
              ...missing.map((s) => `  • ${s}`),
              "(Labels are created automatically or on first use.)",
            ].join("\n"),
            "Manual board setup needed",
          );
        }
      }
    } catch {
      /* provisioning is best-effort */
    }
  }

  // --- write artifacts -----------------------------------------------------
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  const roles: [string, AgentStage][] = [
    ...workers.map((w) => [worker[w] as string, "worker" as AgentStage] as [string, AgentStage]),
    [review, "review"],
    [qa, "qa"],
    [escalate, "escalate"],
  ];
  const specs = dedupeByRole(roles.map(([role, stage]) => specForRole(role, stage)));
  const written = await writeAgents(agentsDir, specs);

  p.note(
    [
      `config:  ${configPath}`,
      `agents:  ${written.length} file(s) in ${agentsDir}`,
      `tracker: ${trackerKind}  ·  runtime: ${runtimeKind}`,
      `workers: ${workers.join(", ")}`,
    ].join("\n"),
    "Generated",
  );
  p.outro("Next: `norma doctor` to validate, then `norma cycle <projectId>`.");
}

function pruneUndefined(obj: Record<string, string | undefined>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

function dedupeByRole(specs: AgentSpec[]): AgentSpec[] {
  const seen = new Map<string, AgentSpec>();
  for (const s of specs) if (!seen.has(s.role)) seen.set(s.role, s);
  return [...seen.values()];
}

async function provision(
  adapter: TrackerAdapter & TrackerIntrospection,
  slots: BoardSlots,
  auto: boolean,
): Promise<void> {
  if (!adapter.createState || !adapter.createLabel) return;
  const haveStates = new Set((await adapter.listStates()).map((s) => s.name.toLowerCase()));
  const haveLabels = new Set((await adapter.listLabels()).map((l) => l.name.toLowerCase()));
  const missingStates = statesUsed(slots).filter((s) => !haveStates.has(s.toLowerCase()));
  const missingLabels = labelsUsed(DEFAULT_LABELS).filter((l) => !haveLabels.has(l.toLowerCase()));
  if (!missingStates.length && !missingLabels.length) return;

  if (!auto) {
    const go = check(
      await p.confirm({
        message: `Create ${missingStates.length} state(s) + ${missingLabels.length} label(s) on the board?`,
        initialValue: true,
      }),
    );
    if (!go) return;
  }
  for (const name of missingStates) await adapter.createState({ name });
  for (const name of missingLabels) await adapter.createLabel({ name });
}
