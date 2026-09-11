import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Entrance animation that NEVER gates visibility: it's a load-time CSS animation
 * whose end state (and reduced-motion fallback) is fully visible, so content is
 * never blank — even in headless renders or when JS/IO doesn't run.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li";
}) {
  // biome-ignore lint: dynamic tag
  const Component = Tag as any;
  return (
    <Component
      className={cn("reveal", className)}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Component>
  );
}
