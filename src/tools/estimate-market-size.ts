import { getBraveSearchClient } from "../services/brave-search.js";
import { getTavilyClient } from "../services/tavily.js";
import { classifySearchError } from "../utils/errors.js";
import type {
  EstimateMarketSizeInput,
  EstimateMarketSizeOutput,
  MarketSizeSource,
  ScopeEstimate,
  Confidence,
} from "../types.js";

export type MarketScope = "narrow" | "broad";

// Regex patterns for extracting dollar amounts
const dollarPatterns = [
  // $X billion/million/trillion
  /\$\s*([\d,.]+)\s*(billion|million|trillion|B|M|T)\b/gi,
  // X billion/million dollars
  /([\d,.]+)\s*(billion|million|trillion)\s*(?:USD|dollars?|usd)/gi,
  // USD X billion
  /(?:USD|usd)\s*([\d,.]+)\s*(billion|million|trillion|B|M|T)\b/gi,
];

const multipliers: Record<string, number> = {
  trillion: 1_000_000_000_000,
  t: 1_000_000_000_000,
  billion: 1_000_000_000,
  b: 1_000_000_000,
  million: 1_000_000,
  m: 1_000_000,
};

export function extractDollarFigures(text: string): number[] {
  const figures: number[] = [];

  for (const pattern of dollarPatterns) {
    pattern.lastIndex = 0; // Reset global regex state for reuse across calls
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const numStr = match[1].replace(/,/g, "");
      const num = parseFloat(numStr);
      const unit = match[2].toLowerCase();
      const multiplier = multipliers[unit] || 1;

      if (!isNaN(num)) {
        figures.push(num * multiplier);
      }
    }
  }

  return figures;
}

/**
 * Removes statistical outliers from a sorted array of market size figures.
 * Any value more than 10x above or below the median is considered an outlier
 * (e.g. a $590B figure alongside $3-20B figures for the same industry).
 * Returns the original array unchanged if it has fewer than 3 values.
 */
export function filterOutliers(values: number[]): number[] {
  if (values.length < 3) return values;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
  const filtered = sorted.filter(v => v >= median / 10 && v <= median * 10);
  // Keep at least 2 values so callers always have a range
  return filtered.length >= 2 ? filtered : sorted.slice(0, 2);
}

export function extractGrowthRate(text: string): string | undefined {
  // Look for CAGR or growth rate patterns
  const patterns = [
    /CAGR\s*(?:of\s*)?([\d.]+)%/i,
    /compound\s+annual\s+growth\s+rate\s*(?:of\s*)?([\d.]+)%/i,
    /grow(?:ing|th)\s+(?:at\s+)?([\d.]+)%/i,
    /([\d.]+)%\s*(?:annual\s+)?(?:growth|CAGR)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return `${match[1]}%`;
    }
  }

  return undefined;
}

const NARROW_INDICATORS =
  /\b(?:app|software|platform|saas|digital|online|on-demand|mobile\s+app|cloud|subscription)\b/i;
const BROAD_INDICATORS =
  /\b(?:industry|services?\s+(?:market|sector)|sector|total\s+market|overall|traditional)\b/i;

export function classifyScope(text: string): MarketScope {
  const hasNarrow = NARROW_INDICATORS.test(text);
  const hasBroad = BROAD_INDICATORS.test(text);

  if (hasNarrow && !hasBroad) return "narrow";
  if (hasBroad && !hasNarrow) return "broad";
  // Both or neither — default to broad as the safer assumption
  if (hasNarrow && hasBroad) return "broad";
  return "broad";
}

function formatDollarAmount(value: number): string {
  if (value >= 1_000_000_000_000) {
    return `$${(value / 1_000_000_000_000).toFixed(1)} trillion`;
  }
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)} billion`;
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)} million`;
  }
  return `$${value.toLocaleString()}`;
}

function calculateConfidence(
  sourceCount: number,
  figureCount: number,
  figureSpread: number,
  hasScopeMismatch: boolean
): Confidence {
  // Scope mismatch caps confidence at medium
  if (hasScopeMismatch) {
    if (sourceCount >= 2 && figureCount >= 2) return "medium";
    return "low";
  }
  // High confidence: multiple sources agreeing within 50% range
  if (sourceCount >= 3 && figureCount >= 3 && figureSpread < 0.5) {
    return "high";
  }
  // Medium confidence: at least 2 sources with some agreement
  if (sourceCount >= 2 && figureCount >= 2 && figureSpread < 2) {
    return "medium";
  }
  return "low";
}

type SearchResult = { title: string; url: string; snippet: string };

async function runSearch(query: string, count: number): Promise<{ results: SearchResult[]; error?: string }> {
  const braveClient = getBraveSearchClient();
  const tavilyClient = getTavilyClient();

  if (braveClient) {
    try {
      const response = await braveClient.search(query, count);
      return {
        results: response.results.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.description,
        })),
      };
    } catch (error) {
      console.error(`Brave Search failed for "${query}":`, error);
    }
  }

  if (tavilyClient) {
    try {
      const response = await tavilyClient.search(query, count);
      return {
        results: response.results.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.content,
        })),
      };
    } catch (error) {
      console.error(`Tavily Search failed for "${query}":`, error);
      return { results: [], error: classifySearchError(error) };
    }
  }

  return { results: [], error: "No search provider configured. Set BRAVE_SEARCH_API_KEY or TAVILY_API_KEY." };
}

interface ScopedFigure {
  value: number;
  scope: MarketScope;
}

export async function estimateMarketSize(
  input: EstimateMarketSizeInput
): Promise<EstimateMarketSizeOutput> {
  const { industry, geography = "global" } = input;

  const geoTerm = geography === "global" ? "" : ` ${geography}`;
  const narrowQuery = `${industry}${geoTerm} market size 2024 2025`;
  const broadQuery = `${industry}${geoTerm} industry market size 2024`;

  // Run narrow and broad searches in parallel
  const [narrowResult, broadResult] = await Promise.all([
    runSearch(narrowQuery, 10),
    runSearch(broadQuery, 5),
  ]);

  // Deduplicate by URL
  const seenUrls = new Set<string>();
  const allResults: SearchResult[] = [];
  for (const r of [...narrowResult.results, ...broadResult.results]) {
    const normalized = r.url.toLowerCase().replace(/\/$/, "");
    if (!seenUrls.has(normalized)) {
      seenUrls.add(normalized);
      allResults.push(r);
    }
  }

  if (allResults.length === 0) {
    const error = narrowResult.error || broadResult.error;
    return {
      tam_estimate: { low: "Unknown", high: "Unknown" },
      sources: [],
      confidence: "low",
      message: error || "Search returned no results.",
    };
  }

  // Extract and classify figures by scope
  const scopedFigures: ScopedFigure[] = [];
  const sources: MarketSizeSource[] = [];
  let growthRate: string | undefined;

  for (const result of allResults) {
    const figures = extractDollarFigures(result.snippet);
    if (figures.length > 0) {
      const scope = classifyScope(`${result.title} ${result.snippet}`);
      for (const value of figures) {
        scopedFigures.push({ value, scope });
      }
      sources.push({
        title: result.title,
        url: result.url,
        snippet: result.snippet,
      });
    }

    if (!growthRate) {
      growthRate = extractGrowthRate(result.snippet);
    }
  }

  if (scopedFigures.length === 0) {
    return {
      tam_estimate: { low: "Unknown", high: "Unknown" },
      sources: sources.slice(0, 5),
      confidence: "low",
    };
  }

  // Separate by scope, filtering outliers within each group
  const narrowFigures = filterOutliers(
    scopedFigures
      .filter((f) => f.scope === "narrow")
      .map((f) => f.value)
      .sort((a, b) => a - b)
  );
  const broadFigures = filterOutliers(
    scopedFigures
      .filter((f) => f.scope === "broad")
      .map((f) => f.value)
      .sort((a, b) => a - b)
  );

  const allValues = filterOutliers(
    scopedFigures.map((f) => f.value).sort((a, b) => a - b)
  );

  // Prefer narrow figures for top-level estimate; fall back to broad, then all
  const primaryFigures =
    narrowFigures.length >= 2
      ? narrowFigures
      : broadFigures.length >= 2
        ? broadFigures
        : allValues;

  const low = primaryFigures[0];
  const high = primaryFigures[primaryFigures.length - 1];

  // Build scope breakdowns
  let narrow_estimate: ScopeEstimate | undefined;
  let broad_estimate: ScopeEstimate | undefined;

  if (narrowFigures.length >= 1) {
    narrow_estimate = {
      low: formatDollarAmount(narrowFigures[0]),
      high: formatDollarAmount(narrowFigures[narrowFigures.length - 1]),
      description: "Digital/platform segment (apps, SaaS, online)",
    };
  }
  if (broadFigures.length >= 1) {
    broad_estimate = {
      low: formatDollarAmount(broadFigures[0]),
      high: formatDollarAmount(broadFigures[broadFigures.length - 1]),
      description: "Total industry including traditional services",
    };
  }

  // Detect scope mismatch
  const hasScopeMismatch =
    narrowFigures.length > 0 &&
    broadFigures.length > 0 &&
    broadFigures[broadFigures.length - 1] > narrowFigures[narrowFigures.length - 1] * 2;

  const spread = high > 0 ? (high - low) / high : 0;
  const confidence = calculateConfidence(
    sources.length,
    primaryFigures.length,
    spread,
    hasScopeMismatch
  );

  let note: string | undefined;
  if (hasScopeMismatch) {
    note =
      "Figures span different market scopes (digital/platform vs total industry). " +
      "The primary estimate uses the narrower digital/platform segment. " +
      "See narrow_estimate and broad_estimate for the breakdown.";
  }

  return {
    tam_estimate: {
      low: formatDollarAmount(low),
      high: formatDollarAmount(high),
      ...(narrow_estimate && { narrow_estimate }),
      ...(broad_estimate && { broad_estimate }),
    },
    growth_rate: growthRate,
    sources: sources.slice(0, 5),
    confidence,
    ...(note && { note }),
  };
}
