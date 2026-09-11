// The docs are the repo-root markdown files, imported as raw text — single source
// of truth, rendered on the site (no GitHub redirect).
import agileMapping from "../../../docs/AGILE-MAPPING.md?raw";
import architecture from "../../../docs/ARCHITECTURE.md?raw";
import gettingStarted from "../../../docs/GETTING-STARTED.md?raw";
import positioning from "../../../docs/POSITIONING.md?raw";
import validation from "../../../docs/VALIDATION.md?raw";
import whyDeterministic from "../../../docs/WHY-DETERMINISTIC.md?raw";

export interface Doc {
  slug: string;
  title: string;
  blurb: string;
  content: string;
}

export const DOCS: Doc[] = [
  { slug: "getting-started", title: "Getting started", blurb: "Install → init → epic → cycle → ship.", content: gettingStarted },
  { slug: "architecture", title: "Architecture", blurb: "The engine, phases, and packages.", content: architecture },
  { slug: "why-deterministic", title: "Why deterministic", blurb: "Why a pure engine drives orchestration.", content: whyDeterministic },
  { slug: "agile-mapping", title: "Agile mapping", blurb: "The engineering-squad mental model.", content: agileMapping },
  { slug: "positioning", title: "Positioning", blurb: "What Norma is — and isn't.", content: positioning },
  { slug: "validation", title: "Validation", blurb: "Live-API status per adapter.", content: validation },
];

export const getDoc = (slug: string): Doc | undefined => DOCS.find((d) => d.slug === slug);

/** Map a repo-relative .md link (e.g. "ARCHITECTURE.md") to its on-site route. */
export function mdHrefToRoute(href: string): string | null {
  const file = href.split("/").pop() ?? href;
  const base = file.replace(/\.md$/i, "").toUpperCase();
  const map: Record<string, string> = {
    "GETTING-STARTED": "getting-started",
    ARCHITECTURE: "architecture",
    "WHY-DETERMINISTIC": "why-deterministic",
    "AGILE-MAPPING": "agile-mapping",
    POSITIONING: "positioning",
    VALIDATION: "validation",
    README: "",
  };
  const slug = map[base];
  return slug === undefined ? null : `/docs${slug ? `/${slug}` : ""}`;
}
