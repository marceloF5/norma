import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { DashboardState, Phase } from "@/api";
import { cn } from "@/lib/utils";

const PHASES: Phase[] = [
  "backlog",
  "ready",
  "in_progress",
  "needs_rework",
  "needs_review",
  "needs_qa",
  "released",
  "done",
];
const LABEL: Record<Phase, string> = {
  backlog: "Backlog",
  ready: "Ready",
  in_progress: "In progress",
  needs_rework: "Rework",
  needs_review: "Review",
  needs_qa: "QA",
  released: "Released",
  done: "Done",
  canceled: "Canceled",
};

const COL_W = 172;
const NODE_H = 78;
const GAP = 14;
const HEAD = 40;

const num = (ref: string) => Number((ref.match(/\d+/) ?? ["0"])[0]);
const colIndex = (p: Phase) => Math.max(0, PHASES.indexOf(p));

export function Graph({ state }: { state: DashboardState }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLDivElement>());

  // Edges follow the animating nodes: recompute from DOM rects each frame.
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const svg = svgRef.current;
      const box = containerRef.current?.getBoundingClientRect();
      if (svg && box) {
        const paths = state.edges
          .map((e) => {
            const a = nodeRefs.current.get(e.from);
            const b = nodeRefs.current.get(e.to);
            if (!a || !b) return "";
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            const x1 = ra.right - box.left;
            const y1 = ra.top - box.top + ra.height / 2;
            const x2 = rb.left - box.left;
            const y2 = rb.top - box.top + rb.height / 2;
            const mx = (x1 + x2) / 2;
            return `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="hsl(var(--border))" stroke-width="1.5" marker-end="url(#arrow)"/>`;
          })
          .join("");
        svg.innerHTML = `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="hsl(var(--muted-foreground))"/></marker></defs>${paths}`;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [state.edges]);

  const nextSet = new Set(state.next);
  const inflight = new Set(Object.values(state.inFlight).flat());
  const actionByRef = new Map(state.actions.flatMap((a) => a.refs.map((r) => [r, a.kind] as const)));

  const rows: Record<number, number> = {};
  const placed = [...state.tasks]
    .sort((a, b) => num(a.ref) - num(b.ref))
    .map((t) => {
      const ci = colIndex(t.phase);
      const row = rows[ci] ?? 0;
      rows[ci] = row + 1;
      return { t, x: ci * COL_W + 12, y: HEAD + row * (NODE_H + GAP) };
    });
  const maxRows = Math.max(1, ...Object.values(rows));
  const height = HEAD + maxRows * (NODE_H + GAP) + 12;

  return (
    <div className="overflow-x-auto">
      <div ref={containerRef} className="relative" style={{ height, minWidth: PHASES.length * COL_W }}>
        {/* column headers */}
        {PHASES.map((p, i) => (
          <div
            key={p}
            className="absolute top-0 text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"
            style={{ left: i * COL_W + 12 }}
          >
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: `hsl(var(--phase-${p}))` }} />
            {LABEL[p]}
          </div>
        ))}

        <svg
          ref={svgRef}
          className="absolute inset-0 h-full w-full pointer-events-none"
          aria-hidden
        />

        {placed.map(({ t, x, y }) => {
          const isNext = nextSet.has(t.ref);
          const isFlight = inflight.has(t.ref);
          return (
            <div
              key={t.ref}
              ref={(el) => {
                if (el) nodeRefs.current.set(t.ref, el);
                else nodeRefs.current.delete(t.ref);
              }}
              className="absolute left-0 top-0 w-[150px] transition-transform duration-500 ease-out"
              style={{ transform: `translate(${x}px, ${y}px)` }}
            >
              <Card
                className={cn(
                  "relative border-l-4 p-2.5",
                  isNext && "ring-2 ring-phase-ready shadow-[0_0_18px_hsl(var(--phase-ready)/0.35)]",
                  isFlight && "ring-2 ring-phase-in_progress animate-pulse",
                )}
                style={{ borderLeftColor: `hsl(var(--phase-${t.phase}))` }}
              >
                {isNext && (
                  <span className="absolute -right-1.5 -top-2 rounded bg-phase-ready px-1.5 py-0.5 text-[9px] font-bold uppercase text-background">
                    {actionByRef.get(t.ref) ?? "next"}
                  </span>
                )}
                <div className="text-xs font-bold">{t.ref}</div>
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground" title={t.title}>
                  {t.title}
                </div>
                <Badge variant="outline" className="mt-1.5 text-[10px]">
                  {t.owner ?? "—"}
                </Badge>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
