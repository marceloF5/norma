import { Link, Outlet, useParams } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { Pipeline } from "@/components/Pipeline";
import { Callout } from "@/components/docs/Callout";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { Tabs } from "@/components/docs/Tabs";
import { Toc } from "@/components/docs/Toc";
import { DOCS, getDoc } from "@/docs";
import { extractToc, slugifyHeading } from "@/lib/utils";

export function DocsLayout() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2 font-display text-lg font-extrabold tracking-tight">
            <span className="inline-block h-3.5 w-3.5" style={{ background: "var(--brand)" }} />
            norma
          </Link>
          <Link to="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Home
          </Link>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-10 px-6 py-10">
        <aside className="hidden w-52 shrink-0 md:block">
          <nav className="sticky top-24 space-y-1">
            <Link
              to="/docs"
              activeOptions={{ exact: true }}
              className="block px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
              activeProps={{ className: "block px-3 py-1.5 text-sm bg-card text-foreground" }}
            >
              Guide
            </Link>
            <div className="mb-1 mt-4 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Reference
            </div>
            {DOCS.map((d) => (
              <Link
                key={d.slug}
                to="/docs/$slug"
                params={{ slug: d.slug }}
                className="block px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                activeProps={{ className: "block px-3 py-1.5 text-sm bg-card text-foreground" }}
              >
                {d.title}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

const LINEAR = `{
  "tracker": { "kind": "linear", "options": { "team": "Acme" } }
}`;
const JIRA = `{
  "tracker": {
    "kind": "jira",
    "options": { "baseUrl": "https://acme.atlassian.net", "projectKey": "ENG" }
  }
}`;
const GITHUB = `{
  "tracker": { "kind": "github", "options": { "repo": "acme/app" } }
}`;

export function DocsIndex() {
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_13rem]">
      <div className="min-w-0">
        <h1 className="font-display text-4xl font-bold tracking-tight">Guide</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Norma turns a described epic into reviewed, verified, done work. Agents do the work; a
          deterministic engine decides the order; your tracker stays the source of truth.
        </p>

        <h2 id={slugifyHeading("The loop")} className="mt-12 scroll-mt-24 border-b border-border pb-2 font-display text-2xl font-bold">
          The loop
        </h2>
        <p className="mt-3 text-muted-foreground">
          Every task flows through phases. The engine promotes, dispatches, reviews and QAs — one
          task in flight per lane, QA batched. Watch it move:
        </p>
        <div className="mt-4">
          <Pipeline />
        </div>

        <h2 id={slugifyHeading("Install")} className="mt-14 scroll-mt-24 border-b border-border pb-2 font-display text-2xl font-bold">
          1 · Install
        </h2>
        <CodeBlock
          lang="bash"
          code={`$ npm i -g @norma/cli\n$ norma --help`}
        />
        <Callout kind="tip">
          No credentials yet? Run <code>norma serve --demo</code> to watch the whole loop offline.
        </Callout>

        <h2 id={slugifyHeading("Connect your tracker")} className="mt-14 scroll-mt-24 border-b border-border pb-2 font-display text-2xl font-bold">
          2 · Connect your tracker
        </h2>
        <p className="mt-3 text-muted-foreground">
          <code>norma init</code> reads your real board and writes <code>norma.config.json</code>. The
          only difference between trackers is a few lines of config:
        </p>
        <Tabs
          tabs={[
            { label: "Linear", content: <><CodeBlock lang="json" code={LINEAR} /><p className="text-sm text-muted-foreground">Set <code>LINEAR_API_KEY</code>. Norma can create any missing states/labels.</p></> },
            { label: "Jira", content: <><CodeBlock lang="json" code={JIRA} /><p className="text-sm text-muted-foreground">Set <code>JIRA_BASE_URL</code>, <code>JIRA_EMAIL</code>, <code>JIRA_API_TOKEN</code>.</p></> },
            { label: "GitHub", content: <><CodeBlock lang="json" code={GITHUB} /><p className="text-sm text-muted-foreground">Set <code>GITHUB_TOKEN</code>. Epics map to milestones; the DAG uses <code>blocked-by:</code> labels.</p></> },
          ]}
        />

        <h2 id={slugifyHeading("Plan and run")} className="mt-14 scroll-mt-24 border-b border-border pb-2 font-display text-2xl font-bold">
          3 · Plan and run
        </h2>
        <CodeBlock
          lang="bash"
          code={`$ norma epic --brief "Add referral tiers"   # → tasks + graph on your board\n$ norma cycle <id> --slug referral-tiers   # advance the epic\n$ norma serve <id>                         # watch the graph move`}
        />
        <Callout kind="note">
          <code>norma plan &lt;id&gt;</code> prints the engine's next actions without writing anything —
          a safe way to see what a cycle would do.
        </Callout>

        <h2 id={slugifyHeading("Reference")} className="mt-14 scroll-mt-24 border-b border-border pb-2 font-display text-2xl font-bold">
          Reference
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {DOCS.map((d) => (
            <Link key={d.slug} to="/docs/$slug" params={{ slug: d.slug }} className="group border border-border p-5 transition-colors hover:bg-card">
              <div className="flex items-center justify-between font-display text-lg font-semibold">
                {d.title}
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{d.blurb}</p>
            </Link>
          ))}
        </div>
      </div>

      <Toc
        items={[
          { depth: 2, text: "The loop", id: slugifyHeading("The loop") },
          { depth: 2, text: "1 · Install", id: slugifyHeading("Install") },
          { depth: 2, text: "2 · Connect your tracker", id: slugifyHeading("Connect your tracker") },
          { depth: 2, text: "3 · Plan and run", id: slugifyHeading("Plan and run") },
          { depth: 2, text: "Reference", id: slugifyHeading("Reference") },
        ]}
      />
    </div>
  );
}

export function DocPage() {
  const { slug } = useParams({ strict: false }) as { slug?: string };
  const doc = slug ? getDoc(slug) : undefined;
  if (!doc) {
    return (
      <div>
        <h1 className="font-display text-3xl font-bold">Not found</h1>
        <p className="mt-2 text-muted-foreground">
          No doc named “{slug}”. <Link to="/docs" className="text-brand hover:underline">Back to docs</Link>.
        </p>
      </div>
    );
  }
  const toc = extractToc(doc.content);
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_13rem]">
      <div className="min-w-0">
        <Markdown>{doc.content}</Markdown>
        <DocFooterNav slug={doc.slug} />
      </div>
      <Toc items={toc} />
    </div>
  );
}

function DocFooterNav({ slug }: { slug: string }) {
  const i = DOCS.findIndex((d) => d.slug === slug);
  const prev = i > 0 ? DOCS[i - 1] : undefined;
  const next = i < DOCS.length - 1 ? DOCS[i + 1] : undefined;
  return (
    <div className="mt-14 flex justify-between border-t border-border pt-6 text-sm">
      {prev ? (
        <Link to="/docs/$slug" params={{ slug: prev.slug }} className="text-muted-foreground hover:text-foreground">
          ← {prev.title}
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link to="/docs/$slug" params={{ slug: next.slug }} className="text-muted-foreground hover:text-foreground">
          {next.title} →
        </Link>
      )}
    </div>
  );
}
