import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, Pause, Play, StepForward } from "lucide-react";
import { useEffect, useState } from "react";
import { type DashboardState, getState, step } from "@/api";
import { Graph } from "@/components/Graph";
import { Button } from "@/components/ui/button";

const PHASE_LABEL: Record<string, string> = {
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

export function Dashboard() {
  const qc = useQueryClient();
  const [playing, setPlaying] = useState(false);

  const { data, isError } = useQuery({
    queryKey: ["state"],
    queryFn: getState,
    refetchInterval: playing ? false : 2500,
  });

  const stepMut = useMutation({
    mutationFn: step,
    onSuccess: (s) => qc.setQueryData(["state"], s),
  });

  const complete = data?.complete ?? false;
  useEffect(() => {
    if (!playing || complete) return;
    const id = setInterval(() => stepMut.mutate(), 1300);
    return () => clearInterval(id);
  }, [playing, complete, stepMut]);

  useEffect(() => {
    if (complete) setPlaying(false);
  }, [complete]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b bg-card/70 px-5 py-3 backdrop-blur">
        <h1 className="text-sm font-semibold tracking-tight">
          <span className="text-phase-released">norma</span> <span className="text-muted-foreground">· live</span>
        </h1>
        <Button size="sm" onClick={() => setPlaying((p) => !p)}>
          {playing ? <Pause /> : <Play />}
          {playing ? "pause" : "auto"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => stepMut.mutate()} disabled={playing || complete}>
          <StepForward />
          step
        </Button>
        <Status data={data} isError={isError} />
        <div className="ml-auto text-xs text-muted-foreground">{data?.project}</div>
      </header>

      {complete && (
        <div className="mx-5 mt-4 flex items-center gap-2 rounded-lg border border-phase-released/40 bg-phase-released/10 px-4 py-2.5 text-sm text-phase-released">
          <Flag className="size-4" /> epic complete — every task released.
        </div>
      )}

      <main className="p-5">{data ? <Graph state={data} /> : <p className="text-muted-foreground">connecting…</p>}</main>
    </div>
  );
}

function Status({ data, isError }: { data?: DashboardState; isError: boolean }) {
  if (isError) return <span className="text-xs text-phase-needs_rework">disconnected</span>;
  if (!data) return <span className="text-xs text-muted-foreground">connecting…</span>;
  const parts = Object.entries(data.counts)
    .filter(([, n]) => n)
    .map(([p, n]) => `${PHASE_LABEL[p] ?? p}: ${n}`);
  return (
    <span className="text-xs text-muted-foreground">
      <b className="text-foreground">{data.tasks.length}</b> tasks · {parts.join(" · ")}
    </span>
  );
}
