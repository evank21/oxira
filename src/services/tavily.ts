import { tavilyRateLimiter } from "../utils/rate-limiter.js";
import { withRetry } from "../utils/retry.js";

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface TavilySearchResponse {
  results: TavilySearchResult[];
  query: string;
}

interface TavilyAPIResponse {
  results?: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
  }>;
}

export class TavilyClient {
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.tavily.com/search";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(
    query: string,
    maxResults: number = 10
  ): Promise<TavilySearchResponse> {
    await tavilyRateLimiter.waitForSlot();

    return withRetry(async () => {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: this.apiKey,
          query,
          max_results: maxResults,
          search_depth: "basic",
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `Tavily API error: ${response.status} ${response.statusText} - ${text}`
        );
      }

      const data = (await response.json()) as TavilyAPIResponse;

      const results: TavilySearchResult[] =
        data.results?.map((r) => ({
          title: r.title,
          url: r.url,
          content: r.content,
          score: r.score,
        })) ?? [];

      return { results, query };
    });
  }
}

let client: TavilyClient | null = null;

export function getTavilyClient(): TavilyClient | null {
  if (client) return client;

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return null;

  client = new TavilyClient(apiKey);
  return client;
}
