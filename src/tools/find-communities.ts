import { hnAlgoliaClient } from "../services/hn-algolia.js";
import { getBraveSearchClient } from "../services/brave-search.js";
import { getTavilyClient } from "../services/tavily.js";
import { classifySearchError } from "../utils/errors.js";
import type {
  FindCommunitiesInput,
  FindCommunitiesOutput,
  Community,
} from "../types.js";

type WebSearchResult = { title: string; url: string; description: string };

/**
 * Tries Brave then Tavily. Returns results if either succeeds.
 * Throws if a provider is configured but all fail, so callers can surface the error.
 * Returns [] only if no providers are configured.
 */
async function webSearch(
  query: string,
  count: number
): Promise<WebSearchResult[]> {
  const braveClient = getBraveSearchClient();
  const tavilyClient = getTavilyClient();
  let lastError: unknown;

  if (braveClient) {
    try {
      const response = await braveClient.search(query, count);
      return response.results.map((r) => ({
        title: r.title,
        url: r.url,
        description: r.description,
      }));
    } catch (error) {
      console.error(`Brave search failed for "${query}":`, error);
      lastError = error;
    }
  }

  if (tavilyClient) {
    try {
      const response = await tavilyClient.search(query, count);
      return response.results.map((r) => ({
        title: r.title,
        url: r.url,
        description: r.content,
      }));
    } catch (error) {
      console.error(`Tavily search failed for "${query}":`, error);
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return [];
}

export function extractSubredditName(url: string): string | undefined {
  const match = url.match(/reddit\.com\/r\/([^/]+)/i);
  return match ? `r/${match[1]}` : undefined;
}

export function dedupeByUrl(communities: Community[]): Community[] {
  const seen = new Set<string>();
  return communities.filter((c) => {
    const normalized = c.url.toLowerCase().replace(/\/$/, "");
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export async function findCommunities(
  input: FindCommunitiesInput
): Promise<FindCommunitiesOutput> {
  const { target_audience, topics } = input;
  const communities: Community[] = [];
  const errors: string[] = [];

  // Search HackerNews for relevant discussions
  const hnQueries = [target_audience, ...topics.slice(0, 2)];

  for (const query of hnQueries) {
    try {
      const response = await hnAlgoliaClient.searchStories(query, 10);

      for (const story of response.hits.slice(0, 3)) {
        if (story.points >= 10) {
          // Only include stories with some engagement
          communities.push({
            platform: "HackerNews",
            name: story.title,
            url: `https://news.ycombinator.com/item?id=${story.objectID}`,
            description: story.story_text?.slice(0, 200),
            member_count: `${story.num_comments} comments, ${story.points} points`,
          });
        }
      }
    } catch (error) {
      console.error(`HN search failed for "${query}":`, error);
      errors.push(classifySearchError(error));
    }
  }

  // Search for Reddit communities (Brave or Tavily fallback)
  const redditQueries = [
    `site:reddit.com ${target_audience} community subreddit`,
    ...topics.map((t) => `site:reddit.com r/${t}`),
  ];

  for (const query of redditQueries.slice(0, 3)) {
    try {
      const results = await webSearch(query, 5);
      for (const result of results) {
        const subredditName = extractSubredditName(result.url);
        if (subredditName) {
          communities.push({
            platform: "Reddit",
            name: subredditName,
            url: result.url,
            description: result.description?.slice(0, 200),
          });
        }
      }
    } catch (error) {
      errors.push(classifySearchError(error));
    }
  }

  // Search for Discord communities
  const discordQuery = `site:discord.gg OR site:discord.com ${target_audience} ${topics.join(" ")}`;
  try {
    const discordResults = await webSearch(discordQuery, 5);
    for (const result of discordResults) {
      if (
        result.url.includes("discord.gg") ||
        result.url.includes("discord.com/invite")
      ) {
        communities.push({
          platform: "Discord",
          name: result.title.replace(/ - Discord$/, "").trim(),
          url: result.url,
          description: result.description?.slice(0, 200),
        });
      }
    }
  } catch (error) {
    errors.push(classifySearchError(error));
  }

  // Search for other forums and communities
  const forumQuery = `${target_audience} forum community ${topics.slice(0, 2).join(" ")}`;
  try {
    const forumResults = await webSearch(forumQuery, 10);
    for (const result of forumResults) {
      const url = result.url.toLowerCase();
      if (
        url.includes("forum") ||
        url.includes("community") ||
        url.includes("slack") ||
        url.includes("groups") ||
        url.includes("circle.so")
      ) {
        communities.push({
          platform: "Forum",
          name: result.title,
          url: result.url,
          description: result.description?.slice(0, 200),
        });
      }
    }
  } catch (error) {
    errors.push(classifySearchError(error));
  }

  const unique = dedupeByUrl(communities).slice(0, 15);

  // If every search failed and we found nothing, surface the root cause
  if (unique.length === 0 && errors.length > 0) {
    throw new Error(`All community searches failed: ${errors[0]}`);
  }

  return unique;
}
