import { getBraveSearchClient } from "../services/brave-search.js";
import { getTavilyClient } from "../services/tavily.js";
import { fetchAsMarkdown } from "../services/web-fetcher.js";
import { classifySearchError } from "../utils/errors.js";
import type {
  SearchCompetitorsInput,
  SearchCompetitorsOutput,
  Competitor,
} from "../types.js";

export function extractTagline(markdown: string): string | undefined {
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

export function extractFeatures(markdown: string): string[] {
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

export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

interface SearchResult {
  title: string;
  url: string;
  description: string;
  source?: "search" | "g2";
}

interface G2Product {
  name: string;
  url: string;
  description?: string;
}

const G2_SKIP_DOMAINS = new Set([
  "facebook.com",
  "twitter.com",
  "linkedin.com",
  "youtube.com",
  "github.com",
  "instagram.com",
  "tiktok.com",
  "pinterest.com",
  "g2.com",
  "www.g2.com",
]);

export function isProductUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (G2_SKIP_DOMAINS.has(hostname)) return false;
    if (G2_SKIP_DOMAINS.has(hostname.replace(/^www\./, ""))) return false;
    // Skip CDN/asset domains
    if (/^(cdn|assets|fonts|analytics|static|media)\./i.test(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export function extractG2Products(markdown: string): G2Product[] {
  const products: G2Product[] = [];
  const seenDomains = new Set<string>();

  // Match markdown links: [Link Text](https://example.com/...)
  const urlRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let match;
  while ((match = urlRegex.exec(markdown)) !== null) {
    const [, linkText, url] = match;
    if (!isProductUrl(url)) continue;

    try {
      const origin = new URL(url).origin;
      const domain = extractDomain(origin);
      if (seenDomains.has(domain)) continue;
      seenDomains.add(domain);

      const name = linkText
        .replace(/\s*[-|–—:].*/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (name.length < 2 || name.length > 60) continue;

      products.push({ name, url: origin });
    } catch {
      // skip malformed URLs
    }
  }

  return products;
}

async function mineG2Category(
  industry: string,
  searchFn: (query: string, count: number) => Promise<SearchResult[]>
): Promise<G2Product[]> {
  try {
    const g2Query = `site:g2.com/categories ${industry} software`;
    const g2Results = await searchFn(g2Query, 3);

    // Find a G2 category page (not a product/compare/reviews page)
    const categoryUrl = g2Results.find(
      (r) =>
        r.url.includes("g2.com/categories/") &&
        !r.url.includes("/compare") &&
        !r.url.includes("/reviews")
    )?.url;

    if (!categoryUrl) return [];

    const { markdown } = await fetchAsMarkdown(categoryUrl);
    if (!markdown || markdown.length < 100) return [];

    return extractG2Products(markdown);
  } catch {
    return [];
  }
}

const CONTENT_DOMAINS = new Set([
  "reddit.com",
  "medium.com",
  "news.ycombinator.com",
  "quora.com",
  "youtube.com",
  "wikipedia.org",
  "forbes.com",
  "techcrunch.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "tiktok.com",
  "instagram.com",
  "pinterest.com",
  "g2.com",
  "capterra.com",
  "trustpilot.com",
  "crunchbase.com",
  "glassdoor.com",
  "yelp.com",
  "tracxn.com",
  "clutch.co",
  "goodfirms.co",
  "sourceforge.net",
]);

const CONTENT_PATH_PATTERNS = [
  /\/blog\b/i,
  /\/article/i,
  /\/top-/i,
  /\/best-/i,
  /\/category\//i,
  /\/tag\//i,
  /\/news\//i,
  /\/reviews?\//i,
  /\/comparison/i,
  /\/vs\//i,
  /\/resources\//i,
  /\/guide\//i,
  /\/faq\//i,
];

const LISTICLE_TITLE_PATTERNS = [
  /\btop\s+\d+\b/i,
  /\bbest\s+\d+\b/i,
  /\bbest\b.*\b(software|tools|apps|platforms|solutions)\b/i,
  /\d+\s+best\b/i,
  /\bhow\s+to\s+build\b/i,
  /\bdevelopment\s+company\b/i,
  /\bdevelopment\s+services?\b/i,
  /\bvs\.?\s+\w/i,
  /\balternatives?\s+to\b/i,
  /\breviews?\s+of\b/i,
  /\bcomparison\b/i,
];

const AGENCY_DOMAIN_PATTERNS = [
  /solutions?$/i,
  /agency$/i,
  /consulting$/i,
  /development$/i,
  /developers?$/i,
  /services?$/i,
  /technologies$/i,
  /techno$/i,
  /soft$/i,
  /infotech$/i,
];

const PRODUCT_PATH_PATTERNS = [
  /\/pricing/i,
  /\/features/i,
  /\/product/i,
  /\/plans/i,
  /\/demo/i,
  /\/signup/i,
  /\/register/i,
  /\/get-?started/i,
];

const FIRST_PERSON_PATTERNS = [
  /\bwe offer\b/i,
  /\bour (platform|product|solution|app|software|tool)\b/i,
  /\bsign up\b/i,
  /\bstart (your |a )?free trial\b/i,
  /\bget started\b/i,
  /\btry (it |us )?free\b/i,
];

export function scoreResult(result: SearchResult): number {
  let score = 50; // neutral baseline
  const domain = extractDomain(result.url);
  const domainName = domain.split(".")[0];

  // --- Negative signals ---

  // Known content/social platforms
  for (const contentDomain of CONTENT_DOMAINS) {
    if (domain === contentDomain || domain.endsWith(`.${contentDomain}`)) {
      return 0; // immediate disqualify
    }
  }

  // Content-oriented URL paths
  const path = (() => {
    try {
      return new URL(result.url).pathname;
    } catch {
      return "";
    }
  })();

  for (const pattern of CONTENT_PATH_PATTERNS) {
    if (pattern.test(path)) {
      score -= 20;
      break; // only penalize once for path
    }
  }

  // Listicle/comparison titles
  for (const pattern of LISTICLE_TITLE_PATTERNS) {
    if (pattern.test(result.title)) {
      score -= 25;
      break;
    }
  }

  // Agency/dev-shop domains
  for (const pattern of AGENCY_DOMAIN_PATTERNS) {
    if (pattern.test(domainName)) {
      score -= 25;
      break;
    }
  }

  // Forum/community domains
  if (/forum|community|discuss/i.test(domainName)) {
    score -= 30;
  }

  // --- Positive signals ---

  // Short branded domain (likely a product)
  if (domainName.length <= 12) {
    score += 5;
  }

  // Product-related URL paths
  for (const pattern of PRODUCT_PATH_PATTERNS) {
    if (pattern.test(path)) {
      score += 10;
      break;
    }
  }

  // First-person product language in description
  for (const pattern of FIRST_PERSON_PATTERNS) {
    if (pattern.test(result.description)) {
      score += 15;
      break;
    }
  }

  // Landing on root or shallow path suggests a product homepage
  if (path === "/" || path === "" || path.split("/").filter(Boolean).length <= 1) {
    score += 5;
  }

  return Math.max(0, score);
}

export function isProductPage(markdown: string): boolean {
  const sample = markdown.slice(0, 3000).toLowerCase();

  let signals = 0;

  // Signup/login CTAs
  if (/sign\s*up|create\s+(an?\s+)?account|get\s+started|start\s+(your\s+)?free\s+trial|request\s+a?\s*demo/i.test(sample)) {
    signals++;
  }

  // Pricing mentions
  if (/pricing|plans?\s+(&|and)\s+pricing|\$\d|free\s+plan|per\s+month|\/mo\b/i.test(sample)) {
    signals++;
  }

  // First-person product description
  if (/\bour (platform|product|solution|software|app|tool)\b|\bwe (help|offer|provide|enable|make)\b/i.test(sample)) {
    signals++;
  }

  // At least 2 out of 3 signals → likely a product page
  return signals >= 2;
}

const NOISE_PATH_PREFIXES = [
  "/blog/",
  "/blog",
  "/resources/",
  "/guide/",
  "/faq/",
  "/article/",
  "/articles/",
  "/top-",
  "/best-",
  "/news/",
  "/comparison",
  "/vs/",
  "/reviews/",
  "/review/",
];

export function looksLikeProductDomain(hostname: string): boolean {
  const clean = hostname.replace(/^www\./, "");
  if (clean.length >= 20) return false;
  const domainName = clean.split(".")[0];
  for (const pattern of AGENCY_DOMAIN_PATTERNS) {
    if (pattern.test(domainName)) return false;
  }
  if (/forum|community|discuss|magazine|mag\b/i.test(domainName)) return false;
  return true;
}

export function normalizeProductUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const pathLower = parsed.pathname.toLowerCase();
    const hasNoisePath = NOISE_PATH_PREFIXES.some((p) => pathLower.startsWith(p) || pathLower.includes(p));
    if (hasNoisePath && looksLikeProductDomain(parsed.hostname)) {
      return `${parsed.protocol}//${parsed.host}`;
    }
    return url;
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

const SCORE_THRESHOLD = 30;

export function buildSearchQueries(
  industry: string,
  productType?: string
): string[] {
  const base = productType ? `${industry} ${productType}` : industry;
  return [
    `${base} software platform`,
    `${base} competitors alternatives`,
    `"${base}" pricing signup`,
  ];
}

async function searchOne(
  query: string,
  count: number
): Promise<SearchResult[]> {
  const braveClient = getBraveSearchClient();
  const tavilyClient = getTavilyClient();

  if (braveClient) {
    try {
      const response = await braveClient.search(query, count);
      return response.results.map((r) => ({
        title: r.title,
        url: r.url,
        description: r.description,
        source: "search" as const,
      }));
    } catch (error) {
      console.error(`Brave Search failed for "${query}":`, error);
    }
  }

  if (tavilyClient) {
    try {
      const response = await tavilyClient.search(query, count);
      return response.results.map((r) => ({
        title: r.title,
        url: r.url,
        description: r.content,
        source: "search" as const,
      }));
    } catch (error) {
      console.error(`Tavily Search failed for "${query}":`, error);
    }
  }

  return [];
}

async function runSearch(
  queries: string[],
  countPerQuery: number
): Promise<{ results: SearchResult[]; error?: string }> {
  const braveClient = getBraveSearchClient();
  const tavilyClient = getTavilyClient();

  if (!braveClient && !tavilyClient) {
    throw new Error(
      "No search provider configured. Set BRAVE_SEARCH_API_KEY or TAVILY_API_KEY."
    );
  }

  const settled = await Promise.allSettled(
    queries.map((q) => searchOne(q, countPerQuery))
  );

  const allResults: SearchResult[] = [];
  let searchError: string | undefined;

  for (const result of settled) {
    if (result.status === "fulfilled") {
      allResults.push(...result.value);
    } else {
      searchError = classifySearchError(result.reason);
    }
  }

  return { results: allResults, error: searchError };
}

export async function searchCompetitors(
  input: SearchCompetitorsInput
): Promise<SearchCompetitorsOutput> {
  const { industry, product_type, max_results = 5 } = input;

  const queries = buildSearchQueries(industry, product_type);
  const countPerQuery = max_results + 10;

  // Run Brave/Tavily queries and G2 mining in parallel
  const [searchResult, g2Products] = await Promise.allSettled([
    runSearch(queries, countPerQuery),
    mineG2Category(industry, searchOne),
  ]);

  const { results: searchResults, error: searchError } =
    searchResult.status === "fulfilled"
      ? searchResult.value
      : { results: [] as SearchResult[], error: "Search failed" };

  // Convert G2 products to SearchResults
  const g2Results: SearchResult[] =
    g2Products.status === "fulfilled"
      ? g2Products.value.map((p) => ({
          title: p.name,
          url: p.url,
          description: p.description || "",
          source: "g2" as const,
        }))
      : [];

  const allResults = [...searchResults, ...g2Results];

  if (allResults.length === 0) {
    if (searchError) {
      throw new Error(`Search failed: ${searchError}`);
    }
    throw new Error("Search returned no results.");
  }

  // Dedupe by domain, tracking which domains appeared in multiple sources
  const domainSources = new Map<string, Set<string>>();
  for (const r of allResults) {
    const domain = extractDomain(r.url);
    const sources = domainSources.get(domain) || new Set();
    sources.add(r.source || "search");
    domainSources.set(domain, sources);
  }

  const seenDomains = new Set<string>();
  const uniqueResults = allResults.filter((r) => {
    const domain = extractDomain(r.url);
    if (seenDomains.has(domain)) return false;
    seenDomains.add(domain);
    return true;
  });

  // Score and filter results, then sort by score descending
  // G2-sourced results get a curated-source bonus
  // Domains appearing in multiple sources get a multi-source bonus
  const scoredResults = uniqueResults
    .map((r) => {
      const domain = extractDomain(r.url);
      const sources = domainSources.get(domain);
      const g2Bonus = r.source === "g2" ? 15 : 0;
      const multiSourceBonus = sources && sources.size > 1 ? 20 : 0;
      return { result: r, score: scoreResult(r) + g2Bonus + multiSourceBonus };
    })
    .filter((s) => s.score >= SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  // Normalize URLs: redirect product domains from blog/resources pages to root
  const normalizedResults = scoredResults.map((s) => ({
    ...s,
    result: { ...s.result, url: normalizeProductUrl(s.result.url) },
  }));

  // Re-dedupe after normalization (multiple blog URLs may collapse to same root)
  const seenFetchDomains = new Set<string>();
  const dedupedResults = normalizedResults.filter((s) => {
    const domain = extractDomain(s.result.url);
    if (seenFetchDomains.has(domain)) return false;
    seenFetchDomains.add(domain);
    return true;
  });

  // Fetch and validate top candidates (fetch more than needed to allow for post-fetch filtering)
  const fetchLimit = Math.min(dedupedResults.length, max_results + 3);
  const competitors: Competitor[] = [];

  for (const { result } of dedupedResults.slice(0, fetchLimit)) {
    if (competitors.length >= max_results) break;

    try {
      const fetchResult = await fetchAsMarkdown(result.url);

      // Post-fetch validation: demote non-product pages
      if (!isProductPage(fetchResult.markdown)) {
        continue;
      }

      competitors.push({
        name: extractCompanyName(result.url, result.title),
        url: result.url,
        description: result.description,
        tagline: extractTagline(fetchResult.markdown),
        features: extractFeatures(fetchResult.markdown),
      });
    } catch {
      // If fetch fails, still include basic info (search score was good)
      competitors.push({
        name: extractCompanyName(result.url, result.title),
        url: result.url,
        description: result.description,
      });
    }
  }

  // If post-fetch filtering was too aggressive, backfill from remaining scored results
  if (competitors.length < max_results) {
    for (const { result } of dedupedResults.slice(fetchLimit)) {
      if (competitors.length >= max_results) break;
      const domain = extractDomain(result.url);
      if (competitors.some((c) => extractDomain(c.url) === domain)) continue;

      try {
        const fetchResult = await fetchAsMarkdown(result.url);
        competitors.push({
          name: extractCompanyName(result.url, result.title),
          url: result.url,
          description: result.description,
          tagline: extractTagline(fetchResult.markdown),
          features: extractFeatures(fetchResult.markdown),
        });
      } catch {
        competitors.push({
          name: extractCompanyName(result.url, result.title),
          url: result.url,
          description: result.description,
        });
      }
    }
  }

  return competitors;
}
