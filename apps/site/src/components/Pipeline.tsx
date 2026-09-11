import { useEffect, useState } from "react";

const PHASES = [
  { key: "backlog", label: "Backlog", color: "var(--phase-backlog)" },
  { key: "ready", label: "Ready", color: "hsl(var(--phase-ready))" },
  { key: "in_progress", label: "Building", color: "hsl(var(--phase-in_progress))" },
  { key: "needs_review", label: "Review", color: "hsl(var(--phase-needs_review))" },
  { key: "needs_qa", label: "QA", color: "hsl(var(--phase-needs_qa))" },
  { key: "released", label: "Released", color: "hsl(var(--phase-released))" },
];
const BACKLOG = "hsl(var(--phase-backlog))";
const CHIPS = [
  { id: "API-1", title: "Tier endpoint", owner: "api" },
  { id: "WEB-2", title: "Tier page", owner: "web" },
  { id: "WEB-3", title: "Admin widget", owner: "web" },
];
const LAST = PHASES.length - 1;
const COL_W = 148;
const ROW_H = 56;

const prefersReduced = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function Pipeline() {
  const [ph, setPh] = useState<number[]>(prefersReduced() ? [5, 3, 1] : [0, 0, 0]);

  useEffect(() => {
    if (prefersReduced()) return;
    const t = setInterval(() => {
      setPh((cur) => {
        if (cur.every((p) => p >= LAST)) return [0, 0, 0];
        // advance the furthest-behind chip that can still move
        const idx = cur
          .map((p, i) => [p, i] as const)
          .filter(([p]) => p < LAST)
          .sort((a, b) => a[0] - b[0])[0]?.[1];
        if (idx === undefined) return cur;
        const next = [...cur];
        next[idx] = (next[idx] ?? 0) + 1;
        return next;
      });
    }, 1150);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="overflow-x-auto rounded-none border border-border bg-card/40 p-4 sm:p-6">
      <div className="relative" style={{ minWidth: PHASES.length * COL_W, height: 44 + CHIPS.length * ROW_H }}>
        {PHASES.map((p, i) => (
          <div
            key={p.key}
            className="absolute top-0 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            style={{ left: i * COL_W }}
          >
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.label}
          </div>
        ))}
        {/* column guides */}
        {PHASES.map((p, i) => (
          <div key={`g-${p.key}`} className="absolute top-8 bottom-0 w-px bg-border/60" style={{ left: i * COL_W - 8 }} />
        ))}
        {CHIPS.map((c, i) => {
          const col = ph[i] ?? 0;
          const phase = PHASES[col] ?? PHASES[0];
          const active = col > 0 && col < LAST;
          return (
            <div
              key={c.id}
              className="absolute w-[132px] border border-border bg-card px-3 py-2 shadow-sm transition-transform duration-700"
              style={{
                transform: `translate(${col * COL_W}px, ${40 + i * ROW_H}px)`,
                transitionTimingFunction: "cubic-bezier(0.16,1,0.3,1)",
                boxShadow: active ? "0 0 0 1px hsl(var(--phase-in_progress)/0.45)" : undefined,
              }}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: col === 0 ? BACKLOG : phase?.color }}
                />
                <span className="text-xs font-semibold text-foreground">{c.id}</span>
              </div>
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{c.title}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
