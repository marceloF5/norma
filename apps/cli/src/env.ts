import { readFileSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** Parse a minimal .env file (KEY=VALUE lines, `#` comments, optional quotes). */
function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

/**
 * Load `.env` (and `.env.local`, which wins) from `dir` into `process.env`,
 * without overriding variables already set in the real environment.
 */
export function loadDotenv(dir: string = process.cwd()): void {
  for (const name of [".env", ".env.local"]) {
    const path = join(dir, name);
    if (!existsSync(path)) continue;
    try {
      const parsed = parseDotenv(readFileSync(path, "utf8"));
      for (const [k, v] of Object.entries(parsed)) {
        if (process.env[k] === undefined) process.env[k] = v;
      }
    } catch {
      /* a malformed .env shouldn't crash the CLI */
    }
  }
}

/**
 * Upsert `entries` into `dir/.env` (creating it if needed), preserving other lines.
 * Returns the file path written.
 */
export function saveEnv(dir: string, entries: Record<string, string>): string {
  const path = join(dir, ".env");
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const lines = existing ? existing.split(/\r?\n/) : [];
  const seen = new Set<string>();

  const next = lines.map((line) => {
    const eq = line.indexOf("=");
    if (eq === -1) return line;
    const key = line.slice(0, eq).trim();
    if (key in entries) {
      seen.add(key);
      return `${key}=${entries[key]}`;
    }
    return line;
  });

  for (const [k, v] of Object.entries(entries)) {
    if (!seen.has(k)) next.push(`${k}=${v}`);
  }

  const body = `${next.join("\n").replace(/\n+$/, "")}\n`;
  writeFileSync(path, body, "utf8");
  return path;
}

/** Ensure `.gitignore` in `dir` ignores `.env` (append if missing). */
export function ensureGitignoreEnv(dir: string): void {
  const path = join(dir, ".gitignore");
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (/^\.env(\.local)?\s*$/m.test(current) || /^\.env\*?\s*$/m.test(current)) return;
  const suffix = current && !current.endsWith("\n") ? "\n" : "";
  writeFileSync(path, `${current}${suffix}.env\n.env.local\n`, "utf8");
}
