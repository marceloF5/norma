import { Link, Outlet, useParams } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { DOCS, getDoc } from "@/docs";

export function DocsLayout() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2 font-display text-lg font-extrabold tracking-tight">
            <span className="inline-block h-3.5 w-3.5" style={{ background: "var(--brand)" }} />
            norma
          </Link>
          <Link to="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Home
          </Link>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-10 px-6 py-10">
        <aside className="hidden w-56 shrink-0 md:block">
          <nav className="sticky top-24 space-y-1">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Docs</div>
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

export function DocsIndex() {
  return (
    <div>
      <h1 className="font-display text-4xl font-bold tracking-tight">Documentation</h1>
      <p className="mt-3 text-muted-foreground">Everything to run Norma, end to end.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {DOCS.map((d) => (
          <Link
            key={d.slug}
            to="/docs/$slug"
            params={{ slug: d.slug }}
            className="border border-border p-5 transition-colors hover:bg-card"
          >
            <div className="font-display text-lg font-semibold">{d.title}</div>
            <p className="mt-1 text-sm text-muted-foreground">{d.blurb}</p>
          </Link>
        ))}
      </div>
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
  return <Markdown>{doc.content}</Markdown>;
}
