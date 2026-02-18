import { braveRateLimiter } from "../utils/rate-limiter.js";
import { withRetry } from "../utils/retry.js";

export interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
  age?: string;
}

export interface BraveSearchResponse {
  results: BraveSearchResult[];
  query: string;
}

interface BraveAPIResponse {
  web?: {
    results?: Array<{
      title: string;
      url: string;
      description: string;
      age?: string;
    }>;
  };
}

export class BraveSearchClient {
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.search.brave.com/res/v1/web/search";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(
    query: string,
    count: number = 10
  ): Promise<BraveSearchResponse> {
    await braveRateLimiter.waitForSlot();

    return withRetry(async () => {
      const params = new URLSearchParams({
        q: query,
        count: count.toString(),
      });

      const response = await fetch(`${this.baseUrl}?${params}`, {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": this.apiKey,
        },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `Brave Search API error: ${response.status} ${response.statusText} - ${text}`
        );
      }

      const data = (await response.json()) as BraveAPIResponse;

      const results: BraveSearchResult[] =
        data.web?.results?.map((r) => ({
          title: r.title,
          url: r.url,
          description: r.description,
          age: r.age,
        })) ?? [];

      return { results, query };
    });
  }
}

let client: BraveSearchClient | null = null;

export function getBraveSearchClient(): BraveSearchClient | null {
  if (client) return client;

  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return null;

  client = new BraveSearchClient(apiKey);
  return client;
}
