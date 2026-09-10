import { RetryableError, isTransientStatus, retryAfterMs, withRetry } from "@norma/tracker";

const API = "https://api.linear.app/graphql";

export interface GqlResult<T> {
  data?: T;
  errors?: unknown;
}

/** Minimal GraphQL client for the Linear API, driven by a personal API key. */
export class LinearGql {
  constructor(private readonly apiKey: string) {}

  async raw<T>(query: string, variables: Record<string, unknown> = {}): Promise<GqlResult<T>> {
    return withRetry(async () => {
      let res: Response;
      try {
        res = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: this.apiKey },
          body: JSON.stringify({ query, variables }),
        });
      } catch (e) {
        throw new RetryableError(`Linear network error: ${e instanceof Error ? e.message : e}`);
      }
      if (isTransientStatus(res.status)) {
        throw new RetryableError(
          `Linear HTTP ${res.status}`,
          retryAfterMs(res.headers.get("retry-after")),
        );
      }
      return (await res.json()) as GqlResult<T>;
    });
  }

  /** Hard variant: throws on GraphQL errors. */
  async query<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const json = await this.raw<T>(query, variables);
    if (json.errors) {
      throw new Error(`Linear GraphQL error: ${JSON.stringify(json.errors)}`);
    }
    if (!json.data) throw new Error("Linear GraphQL returned no data");
    return json.data;
  }
}
