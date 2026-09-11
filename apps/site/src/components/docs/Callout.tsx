import { AlertTriangle, Info, Lightbulb } from "lucide-react";
import type { ReactNode } from "react";

type Kind = "tip" | "note" | "warn";
const STYLE: Record<Kind, { icon: typeof Info; color: string; label: string }> = {
  tip: { icon: Lightbulb, color: "var(--brand)", label: "Tip" },
  note: { icon: Info, color: "hsl(var(--phase-ready))", label: "Note" },
  warn: { icon: AlertTriangle, color: "hsl(var(--phase-in_progress))", label: "Heads up" },
};

export function Callout({ kind = "note", children }: { kind?: Kind; children: ReactNode }) {
  const s = STYLE[kind];
  const Icon = s.icon;
  return (
    <div className="not-prose my-6 flex gap-3 border border-border bg-card/60 p-4">
      <Icon className="mt-0.5 size-4 shrink-0" style={{ color: s.color }} />
      <div className="text-sm leading-relaxed text-muted-foreground [&>p]:m-0">
        <span className="mr-1 font-semibold text-foreground">{s.label}.</span>
        {children}
      </div>
    </div>
  );
}
