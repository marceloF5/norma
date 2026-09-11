import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const LANG_LABEL: Record<string, string> = {
  bash: "shell",
  sh: "shell",
  shell: "shell",
  json: "json",
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  md: "markdown",
};

/** Highlight shell comments + the leading prompt, kept intentionally light. */
function renderShell(code: string) {
  return code.split("\n").map((line, i) => {
    const hashIdx = line.indexOf(" # ");
    let head = line;
    let comment = "";
    if (line.trimStart().startsWith("#")) {
      head = "";
      comment = line;
    } else if (hashIdx >= 0) {
      head = line.slice(0, hashIdx);
      comment = line.slice(hashIdx);
    }
    const prompt = head.startsWith("$ ");
    return (
      // biome-ignore lint: static lines
      <div key={i}>
        {prompt && <span className="select-none text-muted-foreground">$ </span>}
        <span className="text-foreground">{prompt ? head.slice(2) : head}</span>
        {comment && <span className="text-muted-foreground">{comment}</span>}
      </div>
    );
  });
}

export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const text = code.replace(/\n$/, "");
  const isShell = lang === "bash" || lang === "sh" || lang === "shell";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="group not-prose my-6 border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {lang ? (LANG_LABEL[lang] ?? lang) : "code"}
        </span>
        <button
          type="button"
          onClick={copy}
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground",
          )}
          aria-label="Copy code"
        >
          {copied ? <Check className="size-3.5" style={{ color: "var(--brand)" }} /> : <Copy className="size-3.5" />}
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
        {isShell ? <code>{renderShell(text)}</code> : <code className="text-foreground">{text}</code>}
      </pre>
    </div>
  );
}
