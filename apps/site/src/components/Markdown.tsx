import { Link } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { mdHrefToRoute } from "@/docs";

export function Markdown({ children }: { children: string }) {
  return (
    <article
      className="prose prose-invert max-w-none
        prose-headings:font-display prose-headings:tracking-tight
        prose-h1:text-4xl prose-h1:mb-3 prose-h2:mt-12 prose-h2:border-b prose-h2:border-border prose-h2:pb-2
        prose-a:text-brand prose-a:no-underline hover:prose-a:underline
        prose-code:before:content-none prose-code:after:content-none
        prose-code:rounded-none prose-code:bg-card prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.85em]
        prose-pre:rounded-none prose-pre:border prose-pre:border-border prose-pre:bg-card
        prose-table:text-sm prose-th:text-left prose-hr:border-border"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
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
        }}
      >
        {children}
      </ReactMarkdown>
    </article>
  );
}
