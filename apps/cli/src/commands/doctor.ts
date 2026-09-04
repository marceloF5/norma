import { readAgent } from "@norma/agents";
import { supportsIntrospection } from "@norma/tracker";
import type { Command } from "commander";
import { type ResolvedConfig, makeTracker } from "../factory.js";

type Resolver = () => Promise<ResolvedConfig>;

function rolesOf(config: ResolvedConfig["config"]): string[] {
  const roles = config.roles;
  return [...new Set([...Object.values(roles.worker), roles.review, roles.qa, roles.escalate])];
}

/** `norma doctor` — validate config, tracker auth, board mapping, and agent files. */
export function registerDoctor(program: Command, resolved: Resolver): void {
  program
    .command("doctor")
    .description("validate config, tracker connectivity, board mapping, and agent files")
    .action(async () => {
      const r = await resolved();
      const ok: string[] = [];
      const warn: string[] = [];
      const bad: string[] = [];

      ok.push(`config: ${r.configPath ?? "(built-in software-dev preset)"}`);

      const tracker = makeTracker(r.config);
      let authed = false;
      try {
        const me = await tracker.whoami();
        ok.push(`tracker ${tracker.kind}: authenticated as ${me.name ?? me.id}`);
        authed = true;
      } catch (e) {
        bad.push(`tracker ${tracker.kind}: ${e instanceof Error ? e.message : String(e)}`);
      }

      if (authed && supportsIntrospection(tracker)) {
        const stateNames = new Set((await tracker.listStates()).map((s) => s.name.toLowerCase()));
        const labelNames = new Set((await tracker.listLabels()).map((l) => l.name.toLowerCase()));
        const usedStates = new Set<string>();
        const usedLabels = new Set<string>();
        for (const rule of Object.values(r.config.phaseMapping.apply)) {
          if (rule?.state) usedStates.add(rule.state);
          for (const l of rule?.addLabels ?? []) usedLabels.add(l);
        }
        for (const s of usedStates) {
          stateNames.has(s.toLowerCase())
            ? ok.push(`board state present: ${s}`)
            : bad.push(`missing board state: ${s}`);
        }
        for (const l of usedLabels) {
          labelNames.has(l.toLowerCase())
            ? ok.push(`label present: ${l}`)
            : bad.push(`missing label: ${l}`);
        }
      } else if (authed) {
        warn.push(
          `tracker ${tracker.kind} does not support board introspection — skipping mapping checks`,
        );
      }

      for (const role of rolesOf(r.config)) {
        const spec = await readAgent(r.agentsDir, role);
        spec
          ? ok.push(`agent present: ${role}`)
          : bad.push(`missing agent file: ${role}  (norma agents add ${role})`);
      }

      for (const line of ok) console.log(`✓ ${line}`);
      for (const line of warn) console.log(`! ${line}`);
      for (const line of bad) console.log(`✗ ${line}`);
      console.log(
        `\n${bad.length ? `${bad.length} problem(s)` : "all good"} · ${warn.length} warning(s)`,
      );
      process.exitCode = bad.length ? 1 : 0;
    });
}
