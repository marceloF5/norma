import { RetryableError, isTransientStatus, retryAfterMs, withRetry } from "@norma/tracker";

/** Minimal REST client for Jira Cloud (Basic auth: email + API token). */
export class JiraRest {
  private auth: string;
  constructor(
    private readonly baseUrl: string,
    email: string,
    apiToken: string,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.auth = `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return withRetry(() => this.once<T>(method, path, body));
  }

  private async once<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: this.auth,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new RetryableError(`Jira network error: ${e instanceof Error ? e.message : e}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const msg = `Jira ${method} ${path} → ${res.status} ${res.statusText}: ${text.slice(0, 500)}`;
      if (isTransientStatus(res.status)) {
        throw new RetryableError(msg, retryAfterMs(res.headers.get("retry-after")));
      }
      throw new Error(msg);
    }
    if (res.status === 204) return undefined as T;
    const ct = res.headers.get("content-type") ?? "";
    return (ct.includes("application/json") ? await res.json() : undefined) as T;
  }

  get<T>(path: string) {
    return this.request<T>("GET", path);
  }
  post<T>(path: string, body: unknown) {
    return this.request<T>("POST", path, body);
  }
  put<T>(path: string, body: unknown) {
    return this.request<T>("PUT", path, body);
  }
}

/** Flatten an Atlassian Document Format value to plain text (best-effort). */
export function adfToText(doc: unknown): string {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const node = n as { text?: string; content?: unknown[] };
    if (typeof node.text === "string") out.push(node.text);
    if (Array.isArray(node.content)) for (const c of node.content) walk(c);
  };
  walk(doc);
  return out.join(" ").trim();
}

/** Build a minimal Atlassian Document Format doc from plain text. */
export function adf(text: string) {
  return {
    type: "doc",
    version: 1,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}
