import { RetryableError, isTransientStatus, retryAfterMs, withRetry } from "@norma/tracker";

/** Minimal REST client for the GitHub API (Bearer token). */
export class GhRest {
  constructor(
    private readonly token: string,
    private readonly base = "https://api.github.com",
  ) {}

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return withRetry(() => this.once<T>(method, path, body));
  }

  private async once<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new RetryableError(`GitHub network error: ${e instanceof Error ? e.message : e}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const msg = `GitHub ${method} ${path} → ${res.status} ${res.statusText}: ${text.slice(0, 300)}`;
      if (isTransientStatus(res.status)) {
        throw new RetryableError(msg, retryAfterMs(res.headers.get("retry-after")));
      }
      throw new GitHubError(msg, res.status);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}
