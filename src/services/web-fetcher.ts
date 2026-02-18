import TurndownService from "turndown";
import { withRetry } from "../utils/retry.js";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

// Remove script, style, nav, footer, and other non-content elements
turndown.remove(["script", "style", "nav", "footer", "header", "aside", "noscript"]);

export interface FetchResult {
  url: string;
  markdown: string;
  title?: string;
  statusCode: number;
}

export async function fetchAsMarkdown(
  url: string,
  options: { timeout?: number } = {}
): Promise<FetchResult> {
  const { timeout = 10000 } = options;

  return withRetry(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; OxiraBot/1.0; +https://github.com/oxira)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
      }

      const html = await response.text();

      // Extract title from HTML
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch?.[1]?.trim();

      // Convert to markdown
      const markdown = turndown.turndown(html);

      // Clean up excessive whitespace
      const cleanedMarkdown = markdown
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      return {
        url,
        markdown: cleanedMarkdown,
        title,
        statusCode: response.status,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  });
}

export async function fetchPricingPage(baseUrl: string): Promise<FetchResult> {
  // Try common pricing page paths
  const pricingPaths = ["/pricing", "/price", "/plans", "/subscription"];

  // First, try the URL as-is if it already contains pricing-related path
  const lowerUrl = baseUrl.toLowerCase();
  if (
    pricingPaths.some((p) => lowerUrl.includes(p)) ||
    lowerUrl.includes("price")
  ) {
    return fetchAsMarkdown(baseUrl);
  }

  // Try to construct pricing URL from base
  const urlObj = new URL(baseUrl);
  const baseUrlClean = `${urlObj.protocol}//${urlObj.host}`;

  for (const path of pricingPaths) {
    try {
      const result = await fetchAsMarkdown(`${baseUrlClean}${path}`);
      if (result.statusCode === 200) {
        return result;
      }
    } catch {
      // Try next path
      continue;
    }
  }

  // Fall back to the original URL
  return fetchAsMarkdown(baseUrl);
}
