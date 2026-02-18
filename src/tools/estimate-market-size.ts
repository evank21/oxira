import { getBraveSearchClient } from "../services/brave-search.js";
import { getTavilyClient } from "../services/tavily.js";
import type {
  EstimateMarketSizeInput,
  EstimateMarketSizeOutput,
  MarketSizeSource,
  Confidence,
} from "../types.js";

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

/** Exported for testing. Extracts dollar amounts from text using regex patterns. */
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

/** Exported for testing. Extracts CAGR/growth rate percentages from text. */
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
  figureSpread: number
): Confidence {
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

export async function estimateMarketSize(
  input: EstimateMarketSizeInput
): Promise<EstimateMarketSizeOutput> {
  const { industry, geography = "global" } = input;

  // Build search query
  const geoTerm = geography === "global" ? "" : ` ${geography}`;
  const query = `${industry}${geoTerm} market size TAM 2024 2025`;

  // Try Brave Search first, fall back to Tavily
  let searchResults: Array<{ title: string; url: string; snippet: string }> =
    [];

  const braveClient = getBraveSearchClient();
  const tavilyClient = getTavilyClient();

  if (braveClient) {
    try {
      const response = await braveClient.search(query, 10);
      searchResults = response.results.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.description,
      }));
    } catch (error) {
      console.error("Brave Search failed:", error);
    }
  }

  // Fall back to Tavily if Brave failed or returned no results
  if (searchResults.length === 0 && tavilyClient) {
    try {
      const response = await tavilyClient.search(query, 10);
      searchResults = response.results.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content,
      }));
    } catch (error) {
      console.error("Tavily Search failed:", error);
    }
  }

  if (searchResults.length === 0) {
    const hasBrave = !!braveClient;
    const hasTavily = !!tavilyClient;
    const message =
      !hasBrave && !hasTavily
        ? "No search provider configured. Set BRAVE_SEARCH_API_KEY or TAVILY_API_KEY."
        : "Search returned no results. Brave and Tavily both failed or returned empty.";
    return {
      tam_estimate: { low: "Unknown", high: "Unknown" },
      sources: [],
      confidence: "low",
      message,
    };
  }

  // Extract dollar figures from all snippets
  const allFigures: number[] = [];
  const sources: MarketSizeSource[] = [];
  let growthRate: string | undefined;

  for (const result of searchResults) {
    const figures = extractDollarFigures(result.snippet);
    if (figures.length > 0) {
      allFigures.push(...figures);
      sources.push({
        title: result.title,
        url: result.url,
        snippet: result.snippet,
      });
    }

    // Extract growth rate if not already found
    if (!growthRate) {
      growthRate = extractGrowthRate(result.snippet);
    }
  }

  // Calculate low and high estimates
  if (allFigures.length === 0) {
    return {
      tam_estimate: { low: "Unknown", high: "Unknown" },
      sources: sources.slice(0, 5),
      confidence: "low",
    };
  }

  allFigures.sort((a, b) => a - b);
  const low = allFigures[0];
  const high = allFigures[allFigures.length - 1];

  // Calculate spread for confidence assessment
  const spread = high > 0 ? (high - low) / high : 0;
  const confidence = calculateConfidence(sources.length, allFigures.length, spread);

  return {
    tam_estimate: {
      low: formatDollarAmount(low),
      high: formatDollarAmount(high),
    },
    growth_rate: growthRate,
    sources: sources.slice(0, 5),
    confidence,
  };
}
