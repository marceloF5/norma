import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

export interface Tab {
  label: string;
  content: ReactNode;
}

/** Minimal accessible tabs — for showing per-option examples side by side. */
export function Tabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(0);
  return (
    <div className="not-prose my-6">
      <div role="tablist" className="flex gap-1 border-b border-border">
        {tabs.map((t, i) => (
          <button
            type="button"
            role="tab"
            aria-selected={i === active}
            key={t.label}
            onClick={() => setActive(i)}
            className={cn(
              "border-b-2 px-3 py-2 text-sm transition-colors",
              i === active
                ? "border-brand text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="pt-3">{tabs[active]?.content}</div>
    </div>
  );
}
