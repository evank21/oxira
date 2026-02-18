#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  EstimateMarketSizeInputSchema,
  SearchCompetitorsInputSchema,
  FindCommunitiesInputSchema,
  ExtractPricingInputSchema,
} from "./types.js";
import { estimateMarketSize } from "./tools/estimate-market-size.js";
import { searchCompetitors } from "./tools/search-competitors.js";
import { findCommunities } from "./tools/find-communities.js";
import { extractPricing } from "./tools/extract-pricing.js";

// Validate required environment variables
const braveApiKey = process.env.BRAVE_SEARCH_API_KEY;
if (!braveApiKey) {
  console.error(
    "BRAVE_SEARCH_API_KEY required. Get a free key at: https://brave.com/search/api/"
  );
  process.exit(1);
}

// Create MCP server
const server = new McpServer({
  name: "oxira",
  version: "0.1.0",
});

function toolResult(content: object) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(content, null, 2) }],
  };
}

function errorResult(message: string, details?: string) {
  return toolResult({
    error: message,
    ...(details && { details }),
  });
}

// Register tools
server.tool(
  "estimate_market_size",
  "Estimate the Total Addressable Market (TAM) for an industry. Returns market size estimates with confidence levels and sources.",
  EstimateMarketSizeInputSchema.shape,
  async (args) => {
    try {
      const result = await estimateMarketSize(args);
      return toolResult(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return errorResult("Market size estimation failed", msg);
    }
  }
);

server.tool(
  "search_competitors",
  "Find competitors in a specific industry or market segment. Returns company information including URLs, descriptions, and features.",
  SearchCompetitorsInputSchema.shape,
  async (args) => {
    try {
      const result = await searchCompetitors(args);
      return toolResult(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return errorResult("Competitor search failed", msg);
    }
  }
);

server.tool(
  "find_communities",
  "Find online communities where a target audience gathers. Searches HackerNews, Reddit, Discord, and forums.",
  FindCommunitiesInputSchema.shape,
  async (args) => {
    try {
      const result = await findCommunities(args);
      return toolResult(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return errorResult("Community discovery failed", msg);
    }
  }
);

server.tool(
  "extract_pricing",
  "Fetch a competitor's pricing page and convert to markdown. Returns the content for LLM analysis.",
  ExtractPricingInputSchema.shape,
  async (args) => {
    try {
      const result = await extractPricing(args);
      return toolResult(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return errorResult("Pricing extraction failed", msg);
    }
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
