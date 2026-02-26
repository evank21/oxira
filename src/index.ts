#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  EstimateMarketSizeInputSchema,
  SearchCompetitorsInputSchema,
  FindCommunitiesInputSchema,
  ExtractPricingInputSchema,
  FullResearchReportInputSchema,
} from "./types.js";
import { estimateMarketSize } from "./tools/estimate-market-size.js";
import { searchCompetitors } from "./tools/search-competitors.js";
import { findCommunities } from "./tools/find-communities.js";
import { extractPricing } from "./tools/extract-pricing.js";
import { fullResearchReport } from "./tools/full-research-report.js";

// Fail fast if running on an unsupported Node.js version
const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);
if (nodeMajor < 18) {
  console.error(
    `Oxira requires Node.js 18 or later. Currently running ${process.version}. ` +
    `If using Claude Desktop or another MCP client, set "command" to an absolute ` +
    `path such as "/opt/homebrew/bin/node" instead of "node".`
  );
  process.exit(1);
}

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
  "Estimate the Total Addressable Market (TAM) for an industry. Returns market size ranges with confidence levels and sources.\n\nIMPORTANT: The 'industry' parameter is used as a search query for market reports. Use established market research terminology: 'mobile car wash services market', 'project management software market'. Include 'market' or 'services' to target research reports. Be specific about the segment — 'on-demand car wash' vs 'car wash industry' returns very different numbers.",
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
  "Find existing product companies in a specific industry. Returns company URLs, descriptions, and features.\n\nIMPORTANT: The 'industry' parameter is used directly as a search query. Optimize it for finding actual product/service companies, NOT articles about building them.\n- Use product/service terms: 'on-demand car wash service', 'mobile car wash booking platform'\n- AVOID generic 'app' or 'software' suffixes that attract dev agencies: 'car wash apps' → 'car wash service platform'\n- AVOID meta-terms: 'startup', 'business', 'company', 'competitors'\n- Be specific about the product category, not the business model",
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
  "Find online communities (Reddit, HackerNews, Discord, forums) where a target audience gathers.\n\nIMPORTANT: Both parameters are used as search queries.\n- target_audience should describe PEOPLE, not a product: 'car wash business owners' not 'car wash apps'\n- topics must be specific compound phrases, not single words: ['car wash business', 'auto detailing'] NOT ['wash', 'car']. Single generic words match unrelated communities.",
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
  "Fetch a competitor's pricing page and extract pricing data. Returns structured tiers and raw markdown.\n\nIMPORTANT: Provide the most specific pricing URL possible. Best: direct /pricing page. OK: company homepage. Bad: blog post or review site (returns article content, not pricing).",
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

server.tool(
  "full_research_report",
  "Run a comprehensive market research report combining competitor search, market sizing, community discovery, and pricing extraction.\n\nIMPORTANT: 'business_idea' drives all sub-queries. Write it as a clear, specific product description, NOT a casual pitch.\n- Good: 'On-demand mobile car wash booking platform connecting consumers with local detailers for doorstep cleaning'\n- Bad: 'car wash app' (too vague, returns dev agencies and generic results)\n- Include: what the product does, who it's for, and the product category",
  FullResearchReportInputSchema.shape,
  async (args) => {
    try {
      const result = await fullResearchReport(args);
      return toolResult(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return errorResult("Full research report failed", msg);
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
