import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArchitectureDiagram } from "@/components/docs/ArchitectureDiagram";
import { Callout } from "@/components/docs/Callout";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { PhaseFlow } from "@/components/docs/PhaseFlow";
import { mdHrefToRoute } from "@/docs";
import { slugifyHeading } from "@/lib/utils";

function toText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(toText).join("");
  // biome-ignore lint: react element children
  const el = node as any;
  return toText(el?.props?.children);
}

const heading = (Tag: "h1" | "h2" | "h3") =>
  function H({ children }: { children?: ReactNode }) {
    const id = slugifyHeading(toText(children));
    return <Tag id={id}>{children}</Tag>;
  };

export function Markdown({ children }: { children: string }) {
  return (
    <article
      className="prose prose-invert max-w-none
        prose-headings:font-display prose-headings:tracking-tight prose-headings:scroll-mt-24
        prose-h1:text-4xl prose-h1:mb-3 prose-h2:mt-12 prose-h2:border-b prose-h2:border-border prose-h2:pb-2
        prose-a:text-brand prose-a:no-underline hover:prose-a:underline
        prose-code:before:content-none prose-code:after:content-none
        prose-code:rounded-none prose-code:bg-card prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.85em]
        prose-table:text-sm prose-th:text-left prose-hr:border-border"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: heading("h1"),
          h2: heading("h2"),
          h3: heading("h3"),
          a({ href, children }) {
            const to = href ? mdHrefToRoute(href) : null;
            if (to !== null) return <Link to={to}>{children}</Link>;
            const external = href?.startsWith("http");
            return (
              <a href={href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
                {children}
              </a>
            );
          },
          pre({ children }) {
            // biome-ignore lint: markdown ast element
            const codeEl = children as any;
            const cls: string = codeEl?.props?.className ?? "";
            const lang = /language-(\w+)/.exec(cls)?.[1];
            const code = toText(codeEl?.props?.children);
            // Swap key ASCII diagrams for graphical components on the site.
            if (code.includes("computePlan (PURE") && code.includes("adapter-linear")) {
              return <ArchitectureDiagram />;
            }
            if (code.includes("needs_rework") && code.includes("released → done")) {
              return <PhaseFlow />;
            }
            return <CodeBlock code={code} lang={lang} />;
          },
          blockquote({ children }) {
            return <Callout kind="note">{children}</Callout>;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </article>
  );
}
