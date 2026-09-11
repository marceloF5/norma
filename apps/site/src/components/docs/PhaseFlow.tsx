import { ChevronRight, RotateCcw, XCircle } from "lucide-react";

const MAIN: { key: string; label: string; accent?: boolean }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "ready", label: "Ready" },
  { key: "in_progress", label: "In progress" },
  { key: "needs_review", label: "Review" },
  { key: "needs_qa", label: "QA" },
  { key: "released", label: "Released", accent: true },
  { key: "done", label: "Done", accent: true },
];

function PhaseNode({ phase, label, accent }: { phase: string; label: string; accent?: boolean }) {
  return (
    <div
      className="min-w-[104px] border border-border bg-card px-3 py-2.5 text-center"
      style={accent ? { boxShadow: "0 0 20px hsl(var(--phase-released)/0.16)" } : undefined}
    >
      <div className="flex items-center justify-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: `hsl(var(--phase-${phase}))` }} />
        <span className="text-sm font-medium text-foreground">{label}</span>
      </div>
      <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{phase}</div>
    </div>
  );
}

/** The canonical phase lifecycle, drawn in the shared diagram language. */
export function PhaseFlow() {
  return (
    <div className="not-prose my-8 border border-border bg-card/30 p-5 sm:p-8">
      <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-3">
        {MAIN.map((p, i) => (
          <span key={p.key} className="flex items-center gap-1.5">
            <PhaseNode phase={p.key} label={p.label} accent={p.accent} />
            {i < MAIN.length - 1 && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
          </span>
        ))}
      </div>

      <div className="mt-6 grid gap-5 border-t border-dashed border-border pt-6 sm:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <RotateCcw className="size-3.5" style={{ color: "hsl(var(--phase-needs_rework))" }} /> Rework loop
          </div>
          <PhaseNode phase="needs_rework" label="Rework" />
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            A bounce at <span className="font-mono text-xs">review</span> or{" "}
            <span className="font-mono text-xs">qa</span> sends the task back to{" "}
            <span className="font-mono text-xs">in_progress</span> — until it passes, or escalates after N bounces.
          </p>
        </div>
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <XCircle className="size-3.5" style={{ color: "hsl(var(--phase-canceled))" }} /> Side exit
          </div>
          <PhaseNode phase="canceled" label="Canceled" />
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            A task can be canceled at any point; it no longer blocks its dependents.
          </p>
        </div>
      </div>
    </div>
  );
}
