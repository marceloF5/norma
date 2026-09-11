import { ArrowLeftRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

function Node({
  title,
  subtitle,
  accent,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  accent?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "border bg-card px-4 py-3 text-center",
        accent ? "border-brand/60 shadow-[0_0_24px_hsl(var(--phase-released)/0.15)]" : "border-border",
        className,
      )}
    >
      <div className="font-mono text-sm font-semibold text-foreground">{title}</div>
      {subtitle && <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>}
      {children}
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="border border-border bg-background px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
      {children}
    </span>
  );
}

function VLine({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center py-1.5">
      <div className="h-5 w-px bg-border" />
      {label && <div className="my-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>}
      <div className="h-0 w-0 border-x-4 border-t-4 border-x-transparent border-t-border" />
    </div>
  );
}

/** Graphical replacement for the ports-&-adapters ASCII diagram. */
export function ArchitectureDiagram() {
  return (
    <div className="not-prose my-8 border border-border bg-card/30 p-5 sm:p-8">
      <div className="mx-auto flex max-w-2xl flex-col items-stretch">
        {/* engine */}
        <Node title="@norma/core" subtitle="computePlan — pure · deterministic · tested" accent>
          <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
            <Chip>Phase model</Chip>
            <Chip>intents</Chip>
            <Chip>DAG</Chip>
            <Chip>gates</Chip>
          </div>
        </Node>

        {/* seam labels */}
        <div className="grid grid-cols-2">
          <VLine label="normalized tasks" />
          <VLine label="intents" />
        </div>

        {/* operator layer */}
        <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <Node title="@norma/tracker" subtitle="port · normalizer · memory" />
          <div className="hidden justify-center text-muted-foreground sm:flex">
            <ArrowLeftRight className="size-4" />
          </div>
          <Node title="@norma/orchestrator" subtitle="the operator loop" />
        </div>

        {/* plugins */}
        <div className="mt-1 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          <div>
            <VLine />
            <div className="text-center">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tracker adapters</div>
              <div className="flex flex-wrap justify-center gap-1.5">
                <Chip>Linear</Chip>
                <Chip>Jira</Chip>
                <Chip>GitHub</Chip>
                <Chip>memory</Chip>
              </div>
            </div>
          </div>
          <div>
            <VLine />
            <div className="text-center">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Runtimes · context</div>
              <div className="flex flex-wrap justify-center gap-1.5">
                <Chip>claude-code</Chip>
                <Chip>command</Chip>
                <Chip>human</Chip>
                <Chip>echo</Chip>
                <Chip>context store</Chip>
              </div>
            </div>
          </div>
        </div>

        {/* config feeds the engine */}
        <div className="mt-6 border-t border-dashed border-border pt-5">
          <Node
            title="@norma/config"
            subtitle="Zod — roles · policy · phaseMapping · presets"
            className="mx-auto max-w-md"
          />
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Config drives everything provider-specific — the engine never changes.
          </p>
        </div>
      </div>
    </div>
  );
}
