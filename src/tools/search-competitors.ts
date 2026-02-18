import { getBraveSearchClient } from "../services/brave-search.js";
import { getTavilyClient } from "../services/tavily.js";
import { fetchAsMarkdown } from "../services/web-fetcher.js";
import type {
  SearchCompetitorsInput,
  SearchCompetitorsOutput,
  Competitor,
} from "../types.js";

function extractTagline(markdown: string): string | undefined {
  // Look for common tagline patterns in the first 500 chars
  const header = markdown.slice(0, 500);

  // Often taglines are near the top, look for short sentences
  const lines = header.split("\n").filter((l) => l.trim().length > 0);

  for (const line of lines.slice(0, 5)) {
    const cleaned = line.replace(/^#+\s*/, "").trim();
    // Taglines are typically 10-100 chars and end with punctuation or are standalone
    if (cleaned.length >= 10 && cleaned.length <= 100) {
      // Skip navigation-like text
      if (
        !cleaned.includes("|") &&
        !cleaned.toLowerCase().includes("log in") &&
        !cleaned.toLowerCase().includes("sign up")
      ) {
        return cleaned;
      }
    }
  }

  return undefined;
}

function extractFeatures(markdown: string): string[] {
  const features: string[] = [];

  // Look for bullet points or numbered lists
  const listItemPattern = /^[-*•]\s+(.+)$/gm;
  let match;

  while ((match = listItemPattern.exec(markdown)) !== null) {
    const feature = match[1].trim();
    // Filter out navigation items and keep meaningful features
    if (
      feature.length >= 10 &&
      feature.length <= 100 &&
      !feature.toLowerCase().includes("log in") &&
      !feature.toLowerCase().includes("sign up") &&
      !feature.toLowerCase().includes("terms") &&
      !feature.toLowerCase().includes("privacy")
    ) {
      features.push(feature);
      if (features.length >= 5) break;
    }
  }

  return features;
}

function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function extractCompanyName(url: string, title: string): string {
  // Try to get name from domain
  const domain = extractDomain(url);
  const domainParts = domain.split(".");
  if (domainParts.length > 0) {
    const name = domainParts[0];
    // Capitalize first letter
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  // Fall back to title
  const titleParts = title.split(/[|\-–—:]/);
  if (titleParts.length > 0) {
    return titleParts[0].trim();
  }

  return title;
}

export async function searchCompetitors(
  input: SearchCompetitorsInput
): Promise<SearchCompetitorsOutput> {
  const { industry, product_type, max_results = 5 } = input;

  // Build search query
  const productTerm = product_type ? ` ${product_type}` : "";
  const query = `${industry}${productTerm} competitors alternatives`;

  // Try Brave Search first, fall back to Tavily
  let searchResults: Array<{ title: string; url: string; description: string }> =
    [];

  const braveClient = getBraveSearchClient();
  const tavilyClient = getTavilyClient();

  if (braveClient) {
    try {
      const response = await braveClient.search(query, max_results + 5);
      searchResults = response.results.map((r) => ({
        title: r.title,
        url: r.url,
        description: r.description,
      }));
    } catch (error) {
      console.error("Brave Search failed:", error);
    }
  }

  if (searchResults.length === 0 && tavilyClient) {
    try {
      const response = await tavilyClient.search(query, max_results + 5);
      searchResults = response.results.map((r) => ({
        title: r.title,
        url: r.url,
        description: r.content,
      }));
    } catch (error) {
      console.error("Tavily Search failed:", error);
    }
  }

  if (searchResults.length === 0) {
    const hasBrave = !!braveClient;
    const hasTavily = !!tavilyClient;
    if (!hasBrave && !hasTavily) {
      throw new Error(
        "No search provider configured. Set BRAVE_SEARCH_API_KEY or TAVILY_API_KEY."
      );
    }
    throw new Error(
      "Search returned no results. Brave and Tavily both failed or returned empty."
    );
  }

  // Dedupe by domain
  const seenDomains = new Set<string>();
  const uniqueResults = searchResults.filter((r) => {
    const domain = extractDomain(r.url);
    if (seenDomains.has(domain)) return false;
    seenDomains.add(domain);
    return true;
  });

  // Fetch and parse landing pages (limit parallel requests)
  const competitors: Competitor[] = [];

  for (const result of uniqueResults.slice(0, max_results)) {
    try {
      const fetchResult = await fetchAsMarkdown(result.url);

      const competitor: Competitor = {
        name: extractCompanyName(result.url, result.title),
        url: result.url,
        description: result.description,
        tagline: extractTagline(fetchResult.markdown),
        features: extractFeatures(fetchResult.markdown),
      };

      competitors.push(competitor);
    } catch {
      // If fetch fails, still include basic info from search results
      competitors.push({
        name: extractCompanyName(result.url, result.title),
        url: result.url,
        description: result.description,
      });
    }
  }

  return competitors;
}
