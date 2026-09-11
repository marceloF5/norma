import { Link } from "@tanstack/react-router";
import { ArrowRight, Boxes, GitBranch, Github, ListChecks, Radio, ShieldCheck } from "lucide-react";
import { Pipeline } from "@/components/Pipeline";
import { Reveal } from "@/components/Reveal";
import { Button } from "@/components/ui/button";

const REPO = "https://github.com/marceloF5/norma";

export function Landing() {
  return (
    <div className="min-h-screen font-sans">
      <Nav />
      <Hero />
      <Idea />
      <HowItWorks />
      <Stack />
      <Quickstart />
      <Footer />
    </div>
  );
}

function Wordmark() {
  return (
    <a href="#top" className="flex items-center gap-2 font-display text-lg font-extrabold tracking-tight">
      <span className="inline-block h-3.5 w-3.5" style={{ background: "var(--brand)" }} />
      norma
    </a>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Wordmark />
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground sm:flex">
          <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
          <a href="#stack" className="transition-colors hover:text-foreground">Integrations</a>
          <Link to="/docs" className="transition-colors hover:text-foreground">Docs</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="GitHub">
            <a href={REPO}><Github /></a>
          </Button>
          <Button asChild>
            <a href="#start">Get started</a>
          </Button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden border-b border-border">
      <div className="grid-bg pointer-events-none absolute inset-0" aria-hidden />
      <div className="mx-auto max-w-6xl px-6 pb-16 pt-20 sm:pt-28">
        <p className="mb-5 inline-flex items-center gap-2 border border-border bg-card/50 px-3 py-1 text-xs text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--brand)" }} />
          provider-agnostic agent orchestration
        </p>
        <h1
          className="max-w-3xl font-display text-5xl font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-6xl"
          style={{ textWrap: "balance" }}
        >
          Agents that ship — on the board you already use.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Describe an epic. Norma breaks it into a dependency graph and drives every task through
          build → review → QA → done — agents do the work, a deterministic engine decides the order,
          your tracker stays the source of truth.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild size="lg">
            <a href="#start">Get started <ArrowRight /></a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href={REPO}><Github /> Star on GitHub</a>
          </Button>
        </div>
        <p className="mt-6 font-mono text-xs text-muted-foreground">
          Linear · Jira · GitHub Issues · Claude Code · any command · humans
        </p>

        <Reveal className="mt-14">
          <Pipeline />
        </Reveal>
      </div>
    </section>
  );
}

function Idea() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 md:grid-cols-[1.2fr_1fr] md:items-center">
        <Reveal>
          <h2 className="font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl" style={{ textWrap: "balance" }}>
            A deterministic engine decides what happens next. The LLM only does the work.
          </h2>
        </Reveal>
        <Reveal delay={80} className="text-muted-foreground">
          <p className="leading-relaxed">
            Orchestration isn't left to a model's guess. A pure, unit-tested function computes the
            exact next moves from the current board — enforcing the dependency graph, one-task-in-flight
            per lane, and the QA gates, the same way every run.
          </p>
          <p className="mt-4 leading-relaxed">
            Agents are called only for the creative steps: implement, review, test. Everything is
            auditable — you can always see <em className="text-foreground not-italic">why</em> a step happened.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Describe the epic",
    body: "A brief becomes a project of tasks with owners, acceptance criteria, and a dependency graph — created right in your tracker.",
  },
  {
    n: "02",
    title: "Norma runs the loop",
    body: "The engine promotes, dispatches, reviews and QAs. Agents build in isolated worktrees; humans can own any review or QA gate.",
  },
  {
    n: "03",
    title: "Ship",
    body: "When every task passes, Norma writes the delivery report and opens the PR. Watch it all move on a live board.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="border-b border-border">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <Reveal>
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">How it works</h2>
        </Reveal>
        <ol className="mt-12 grid gap-px overflow-hidden border border-border bg-border md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.n} delay={i * 90} className="bg-background p-8">
              <div className="font-mono text-sm" style={{ color: "var(--brand)" }}>{s.n}</div>
              <h3 className="mt-3 font-display text-xl font-semibold">{s.title}</h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">{s.body}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

const GROUPS = [
  {
    icon: GitBranch,
    label: "Trackers",
    items: ["Linear", "Jira Cloud", "GitHub Issues", "in-memory (offline)"],
    note: "A tracker is an adapter + a phase mapping — no engine change to add one.",
  },
  {
    icon: Radio,
    label: "Agent runtimes",
    items: ["Claude Code", "any command / script", "humans (review & QA)", "echo (offline)"],
    note: "The agent definition is separate from how it runs. Swap runtimes freely.",
  },
  {
    icon: Boxes,
    label: "Pipelines",
    items: ["software-dev", "content", "your own"],
    note: "Roles, gates and phases are config. The same engine drives any workflow.",
  },
];

const FEATURES = [
  { icon: ShieldCheck, t: "Deterministic core", d: "Pure, tested engine — same input, same plan. Crash-safe and resumable." },
  { icon: ListChecks, t: "DAG + gates", d: "Dependency frontier, one-in-flight per lane, batched QA — enforced, not suggested." },
  { icon: GitBranch, t: "Live board", d: "Watch tasks move phase by phase; see what's in flight and what's next." },
];

function Stack() {
  return (
    <section id="stack" className="border-b border-border">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <Reveal>
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Works with your stack</h2>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Ports and adapters throughout — the engine never changes when you swap a piece.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-10 md:grid-cols-3">
          {GROUPS.map((g, i) => (
            <Reveal key={g.label} delay={i * 80}>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <g.icon className="size-4" style={{ color: "var(--brand)" }} /> {g.label}
              </div>
              <ul className="mt-4 space-y-2">
                {g.items.map((it) => (
                  <li key={it} className="flex items-center gap-2 text-[15px]">
                    <span className="inline-block h-1 w-1 rounded-full bg-muted-foreground" />
                    {it}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{g.note}</p>
            </Reveal>
          ))}
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.t} delay={i * 70} className="border border-border p-6">
              <f.icon className="size-5" style={{ color: "var(--brand)" }} />
              <h3 className="mt-4 font-semibold">{f.t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.d}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Quickstart() {
  const lines = [
    ["$", "npm i -g @norma/cli"],
    ["$", "norma init", "# map your board, pick agents"],
    ["$", "norma epic --brief \"Add referral tiers\"", "# → tasks + graph on your board"],
    ["$", "norma cycle <id> --slug referral-tiers", "# advance the epic"],
    ["$", "norma serve <id>", "# watch the graph move"],
  ];
  return (
    <section id="start" className="border-b border-border">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-10 md:grid-cols-[1fr_1.3fr] md:items-center">
          <Reveal>
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Start in a minute</h2>
            <p className="mt-3 text-muted-foreground">
              Try the whole loop offline first — no credentials needed:
            </p>
            <p className="mt-2 font-mono text-sm" style={{ color: "var(--brand)" }}>norma serve --demo</p>
            <div className="mt-6 flex gap-3">
              <Button asChild variant="outline"><Link to="/docs">Read the docs</Link></Button>
              <Button asChild variant="ghost"><a href={REPO}><Github /> GitHub</a></Button>
            </div>
          </Reveal>
          <Reveal delay={80} className="border border-border bg-card/50">
            <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
              <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
              <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
              <span className="ml-2 font-mono text-xs text-muted-foreground">terminal</span>
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed">
              {lines.map(([p, cmd, note], i) => (
                // biome-ignore lint: static list
                <div key={i}>
                  <span className="select-none text-muted-foreground">{p} </span>
                  <span className="text-foreground">{cmd}</span>
                  {note && <span className="text-muted-foreground">  {note}</span>}
                </div>
              ))}
            </pre>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <Wordmark />
        <nav className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-muted-foreground">
          <a href="#how" className="hover:text-foreground">How it works</a>
          <a href="#stack" className="hover:text-foreground">Integrations</a>
          <Link to="/docs" className="hover:text-foreground">Docs</Link>
          <a href={REPO} className="hover:text-foreground">GitHub</a>
        </nav>
      </div>
      <p className="mt-8 text-xs text-muted-foreground">
        norma.team · a deterministic orchestrator for AI agent pipelines.
      </p>
    </footer>
  );
}
