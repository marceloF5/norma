import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { EchoRunner } from "@norma/agent-runtime";
import { createNormaServer } from "@norma/server";
import { MemoryTracker, type RawIssue } from "@norma/tracker";
import type { Command } from "commander";
import { type ResolvedConfig, makeContext, makeRunner, makeTracker } from "../factory.js";

type Resolver = () => Promise<ResolvedConfig>;

/** Locate a built web client (apps/web/dist) to serve the shadcn SPA, if present. */
function findWebDist(explicit?: string): string | undefined {
  const candidates = [explicit, resolve(process.cwd(), "apps/web/dist")].filter(
    Boolean,
  ) as string[];
  return candidates.find((c) => existsSync(resolve(c, "index.html")));
}

const DEMO_SEED: RawIssue[] = [
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
  {
    id: "iss-3",
    ref: "DEMO-3",
    title: "Admin widget",
    state: "Backlog",
    labels: ["agent:web", "qa-batch:3", "harness"],
    blockedBy: [{ id: "iss-1", ref: "DEMO-1", state: "Backlog" }],
    order: 3,
  },
];

/** `norma serve` — a live dashboard that shows the task graph move as the epic runs. */
export function registerServe(program: Command, resolved: Resolver): void {
  program
    .command("serve")
    .argument("[projectId]", "tracker project/epic id (omit with --demo)")
    .description("start the live graph dashboard (watch the epic advance in the browser)")
    .option("--demo", "run offline with a seeded in-memory epic + echo agents", false)
    .option("--port <n>", "port", "4680")
    .option("--slug <slug>", "epic slug for durable context")
    .option("--worktree <path>", "worktree handed to agents")
    .option("--web <dir>", "path to a built web client (apps/web/dist) to serve the shadcn SPA")
    .action(
      async (
        projectId: string | undefined,
        opts: { demo: boolean; port: string; slug?: string; worktree?: string; web?: string },
      ) => {
        const r = await resolved();
        const port = Number(opts.port);
        const webDist = findWebDist(opts.web);

        let server: ReturnType<typeof createNormaServer>;
        if (opts.demo) {
          const tracker = new MemoryTracker({
            seed: DEMO_SEED,
            bounceMarker: r.config.phaseMapping.bounceMarker,
          });
          server = createNormaServer({
            config: r.config,
            tracker,
            runner: new EchoRunner(),
            projectId: "demo",
            webDist,
          });
        } else {
          if (!projectId) throw new Error("provide a projectId (or use --demo)");
          const tracker = makeTracker(r.config);
          server = createNormaServer({
            config: r.config,
            tracker,
            runner: makeRunner(r.config, r.agentsDir, tracker),
            context: makeContext(r.contextRoot),
            webDist,
            projectId,
            slug: opts.slug,
            worktree: opts.worktree,
          });
        }

        server.listen(port, () => {
          console.error(
            `▸ norma dashboard on http://localhost:${port}  ${opts.demo ? "(demo)" : projectId}`,
          );
          console.error("  open it, then hit ▶ auto (or 'step') to watch the graph move.");
        });
      },
    );
}
