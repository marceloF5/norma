import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** GitHub-style heading slug (matches the ids we set on headings for TOC anchors). */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

export interface TocItem {
  depth: 2 | 3;
  text: string;
  id: string;
}

/** Extract h2/h3 headings from markdown for an "on this page" rail (skips code fences). */
export function extractToc(md: string): TocItem[] {
  const out: TocItem[] = [];
  let inFence = false;
  for (const line of md.split("\n")) {
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{2,3})\s+(.*)$/.exec(line);
    if (m) {
      const text = (m[2] ?? "").replace(/[`*_]/g, "").trim();
      out.push({ depth: m[1]?.length === 2 ? 2 : 3, text, id: slugifyHeading(text) });
    }
  }
  return out;
}
