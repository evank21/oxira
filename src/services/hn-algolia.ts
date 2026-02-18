import { withRetry } from "../utils/retry.js";

export interface HNStory {
  objectID: string;
  title: string;
  url?: string;
  author: string;
  points: number;
  num_comments: number;
  created_at: string;
  story_text?: string;
}

export interface HNSearchResponse {
  hits: HNStory[];
  query: string;
  nbHits: number;
}

interface AlgoliaAPIResponse {
  hits?: Array<{
    objectID: string;
    title: string;
    url?: string;
    author: string;
    points: number;
    num_comments: number;
    created_at: string;
    story_text?: string;
  }>;
  nbHits?: number;
}

export class HNAlgoliaClient {
  private readonly baseUrl = "https://hn.algolia.com/api/v1";

  async searchStories(
    query: string,
    hitsPerPage: number = 20
  ): Promise<HNSearchResponse> {
    return withRetry(async () => {
      const params = new URLSearchParams({
        query,
        tags: "story",
        hitsPerPage: hitsPerPage.toString(),
      });

      const response = await fetch(`${this.baseUrl}/search?${params}`);

      if (!response.ok) {
        throw new Error(
          `HN Algolia API error: ${response.status} ${response.statusText}`
        );
      }

      const data = (await response.json()) as AlgoliaAPIResponse;

      const hits: HNStory[] =
        data.hits?.map((h) => ({
          objectID: h.objectID,
          title: h.title,
          url: h.url,
          author: h.author,
          points: h.points,
          num_comments: h.num_comments,
          created_at: h.created_at,
          story_text: h.story_text,
        })) ?? [];

      return {
        hits,
        query,
        nbHits: data.nbHits ?? 0,
      };
    });
  }

  async searchComments(
    query: string,
    hitsPerPage: number = 20
  ): Promise<HNSearchResponse> {
    return withRetry(async () => {
      const params = new URLSearchParams({
        query,
        tags: "comment",
        hitsPerPage: hitsPerPage.toString(),
      });

      const response = await fetch(`${this.baseUrl}/search?${params}`);

      if (!response.ok) {
        throw new Error(
          `HN Algolia API error: ${response.status} ${response.statusText}`
        );
      }

      const data = (await response.json()) as AlgoliaAPIResponse;

      const hits: HNStory[] =
        data.hits?.map((h) => ({
          objectID: h.objectID,
          title: h.title || "",
          url: h.url,
          author: h.author,
          points: h.points || 0,
          num_comments: h.num_comments || 0,
          created_at: h.created_at,
          story_text: h.story_text,
        })) ?? [];

      return {
        hits,
        query,
        nbHits: data.nbHits ?? 0,
      };
    });
  }
}

// Singleton instance (no auth needed)
export const hnAlgoliaClient = new HNAlgoliaClient();
