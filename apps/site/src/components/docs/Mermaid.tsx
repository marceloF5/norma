import { useEffect, useId, useRef, useState } from "react";

// mermaid is heavy (~1MB); load it lazily so pages without a diagram don't pay for it.
type MermaidApi = typeof import("mermaid").default;
let mermaidPromise: Promise<MermaidApi> | null = null;
let initialized = false;

async function getMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) mermaidPromise = import("mermaid").then((m) => m.default);
  const mermaid = await mermaidPromise;
  ensureInit(mermaid);
  return mermaid;
}

/** Initialize mermaid once, themed to match the site's stone-dark + norma-green palette. */
function ensureInit(mermaid: MermaidApi) {
  if (initialized) return;
  initialized = true;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    themeVariables: {
      // stone-dark ground + norma green (mirrors index.css tokens)
      background: "transparent",
      primaryColor: "#1c1c1a",
      primaryBorderColor: "#3a3a37",
      primaryTextColor: "#e7e5e4",
      secondaryColor: "#232320",
      tertiaryColor: "#171715",
      lineColor: "#6b6b66",
      textColor: "#d6d3d1",
      mainBkg: "#1c1c1a",
      nodeBorder: "#44443f",
      clusterBkg: "#161614",
      clusterBorder: "#33332f",
      edgeLabelBackground: "#0f0f0e",
      // norma green accents
      note: "#132a1e",
      noteBkgColor: "#132a1e",
      noteBorderColor: "#2f7d54",
    },
  });
}

/** Renders a ```mermaid fenced block as an SVG diagram. */
export function Mermaid({ chart }: { chart: string }) {
  const rawId = useId();
  const id = `mermaid-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMermaid()
      .then((mermaid) => mermaid.render(id, chart.trim()))
      .then(({ svg }) => {
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (error) {
    // Fall back to the source so nothing is lost if a diagram fails to parse.
    return (
      <pre className="overflow-x-auto rounded-none border border-border bg-card p-4 text-xs text-muted-foreground">
        <code>{chart}</code>
      </pre>
    );
  }

  return (
    <div
      ref={ref}
      className="not-prose my-6 flex justify-center overflow-x-auto rounded-none border border-border bg-card/40 p-4 [&_svg]:h-auto [&_svg]:max-w-full"
      aria-label="diagram"
    />
  );
}
