import { CATALOG, getAgent, listAgents, writeAgent } from "@norma/agents";
import type { Command } from "commander";
import type { ResolvedConfig } from "../factory.js";

type Resolver = () => Promise<ResolvedConfig>;

/** `norma agents list|add` — inspect and install agent definitions from the catalog. */
export function registerAgents(program: Command, resolved: Resolver): void {
  const cmd = program.command("agents").description("manage agent definitions (.norma/agents)");

  cmd
    .command("list")
    .description("list catalog agents and which are installed in this project")
    .action(async () => {
      const r = await resolved();
      const installed = new Set((await listAgents(r.agentsDir)).map((s) => s.role));
      for (const a of CATALOG) {
        const mark = installed.has(a.role) ? "●" : "○";
        console.log(`${mark} ${a.role.padEnd(20)} ${a.stage.padEnd(9)} ${a.description}`);
      }
      console.log("\n● installed  ○ available (norma agents add <role>)");
    });

  cmd
    .command("add")
    .argument("<role>", "catalog role to install")
    .description("write a catalog agent to .norma/agents/<role>.md")
    .action(async (role: string) => {
      const r = await resolved();
      const spec = getAgent(role);
      if (!spec) {
        throw new Error(`unknown catalog role "${role}". Run 'norma agents list' to see options.`);
      }
      const path = await writeAgent(r.agentsDir, spec);
      console.log(`wrote ${path}`);
    });
}
