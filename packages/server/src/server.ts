import { type Server, type ServerResponse, createServer } from "node:http";
import type { NormaConfig } from "@norma/config";
import { Orchestrator, type OrchestratorDeps, type RunCycleInput } from "@norma/orchestrator";
import type { TrackerAdapter } from "@norma/tracker";
import { DASHBOARD_HTML } from "./dashboard.js";
import { buildState } from "./state.js";

export interface NormaServerOptions extends OrchestratorDeps {
  projectId: string;
  slug?: string;
  worktree?: string;
  /** Plan/execute only? When true, /api/step still runs (real work). Default false. */
  dryRun?: boolean;
}

/**
 * A tiny HTTP surface over the engine + orchestrator (no external deps). Serves
 * the live dashboard at `/`, the graph snapshot at `/api/state`, and advances the
 * epic one action at a time via `POST /api/step` — so the UI shows the graph move.
 */
export function createNormaServer(opts: NormaServerOptions): Server {
  const { tracker, config, projectId } = opts;
  const orch = new Orchestrator(opts);
  const runInput: RunCycleInput = {
    projectId,
    slug: opts.slug,
    worktree: opts.worktree,
    dryRun: opts.dryRun,
  };

  const state = async () => ({
    project: projectId,
    ...(await buildState(tracker, config, projectId)),
  });
  const json = (res: ServerResponse, body: unknown) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  return createServer(async (req, res) => {
    try {
      const url = (req.url ?? "/").split("?")[0];
      if (req.method === "GET" && url === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(DASHBOARD_HTML);
        return;
      }
      if (req.method === "GET" && url === "/api/state") return json(res, await state());
      if (req.method === "POST" && url === "/api/step") {
        await orch.step(runInput);
        return json(res, await state());
      }
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    }
  });
}

export type { NormaConfig, TrackerAdapter };
