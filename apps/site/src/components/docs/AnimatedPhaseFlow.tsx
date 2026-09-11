import { useEffect, useState } from "react";

const PHASES: { key: string; label: string; accent?: boolean }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "ready", label: "Ready" },
  { key: "in_progress", label: "In progress" },
  { key: "needs_review", label: "Review" },
  { key: "needs_qa", label: "QA" },
  { key: "released", label: "Released", accent: true },
  { key: "done", label: "Done", accent: true },
];
const TOKENS = [
  { id: "API", tint: "ready" },
  { id: "WEB", tint: "needs_review" },
];
const LAST = PHASES.length - 1;

const reduced = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** The phase flow, animated: task tokens hop from node to node. Responsive grid — no scroll. */
export function AnimatedPhaseFlow() {
  const [ph, setPh] = useState<number[]>(reduced() ? [5, 2] : [0, 0]);

  useEffect(() => {
    if (reduced()) return;
    const t = setInterval(() => {
      setPh((cur) => {
        if (cur.every((p) => p >= LAST)) return cur.map(() => 0);
        const idx = cur
          .map((p, i) => [p, i] as const)
          .filter(([p]) => p < LAST)
          .sort((a, b) => a[0] - b[0])[0]?.[1];
        if (idx === undefined) return cur;
        const next = [...cur];
        next[idx] = (next[idx] ?? 0) + 1;
        return next;
      });
    }, 1100);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="not-prose my-8 border border-border bg-card/30 p-5 sm:p-8">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
        {PHASES.map((p, i) => {
          const here = TOKENS.filter((_, ti) => ph[ti] === i);
          const active = here.length > 0;
          return (
            <div
              key={p.key}
              className="relative border bg-card px-3 py-3 text-center transition-shadow duration-300"
              style={{
                borderColor: active ? `hsl(var(--phase-${p.key}))` : "var(--border)",
                boxShadow: p.accent
                  ? "0 0 20px hsl(var(--phase-released)/0.16)"
                  : active
                    ? `0 0 0 1px hsl(var(--phase-${p.key})/0.5)`
                    : undefined,
              }}
            >
              {here.length > 0 && (
                <div className="absolute -top-2.5 left-1/2 flex -translate-x-1/2 gap-1">
                  {here.map((tk) => (
                    <span
                      key={tk.id}
                      className="pop flex items-center gap-1 border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] shadow-sm"
                    >
                      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: `hsl(var(--phase-${tk.tint}))` }} />
                      {tk.id}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: `hsl(var(--phase-${p.key}))` }} />
                <span className="text-sm font-medium text-foreground">{p.label}</span>
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{p.key}</div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Tasks advance one phase at a time; each lane keeps one task in flight.
      </p>
    </div>
  );
}
