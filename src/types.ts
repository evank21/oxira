import { z } from "zod";

// Common types
export type Confidence = "high" | "medium" | "low";
export type Geography = "global" | "us" | "eu" | "apac";

// estimate_market_size
export const EstimateMarketSizeInputSchema = z.object({
  industry: z
    .string()
    .describe(
      "Market segment to estimate. Use market research terminology. Good: 'on-demand mobile car wash services', 'cloud project management software'. Bad: 'car wash apps' (too vague, mixes segments)."
    ),
  geography: z
    .enum(["global", "us", "eu", "apac"])
    .optional()
    .default("global")
    .describe("Geographic scope: 'global' (default), 'us', 'eu', or 'apac'."),
});

export type EstimateMarketSizeInput = z.infer<
  typeof EstimateMarketSizeInputSchema
>;

export interface MarketSizeSource {
  title: string;
  url: string;
  snippet: string;
}

export interface ScopeEstimate {
  low: string;
  high: string;
  description: string;
}

export interface EstimateMarketSizeOutput {
  tam_estimate: {
    low: string;
    high: string;
    narrow_estimate?: ScopeEstimate;
    broad_estimate?: ScopeEstimate;
  };
  growth_rate?: string;
  sources: MarketSizeSource[];
  confidence: Confidence;
  /** Present when search failed (no results due to API unavailability) */
  message?: string;
  /** Explains wide ranges or scope mismatches */
  note?: string;
}

// search_competitors
export const SearchCompetitorsInputSchema = z.object({
  industry: z
    .string()
    .describe(
      "Search query for finding product companies. Use specific product/service terms. Good: 'on-demand car wash service', 'project management platform'. Bad: 'car wash apps' (attracts dev agencies), 'PM software startup' (attracts articles)."
    ),
  product_type: z
    .string()
    .optional()
    .describe(
      "Optional product type filter. Examples: 'SaaS', 'mobile app', 'marketplace', 'API'. Appended to search query when provided."
    ),
  max_results: z
    .number()
    .optional()
    .default(5)
    .describe("Maximum number of competitors to return (default: 5, max: 10)"),
});

export type SearchCompetitorsInput = z.infer<
  typeof SearchCompetitorsInputSchema
>;

export interface Competitor {
  name: string;
  url: string;
  description: string;
  tagline?: string;
  features?: string[];
}

export type SearchCompetitorsOutput = Competitor[];

// find_communities
export const FindCommunitiesInputSchema = z.object({
  target_audience: z
    .string()
    .describe(
      "The people to find communities for. Describe humans, not products. Good: 'car wash business owners and operators', 'freelance web developers'. Bad: 'car wash apps' (product, not audience)."
    ),
  topics: z
    .array(z.string())
    .describe(
      "Array of specific topic phrases. Use multi-word compounds, never single generic words. Good: ['car wash business', 'auto detailing']. Bad: ['wash', 'car'] (matches unrelated communities)."
    ),
});

export type FindCommunitiesInput = z.infer<typeof FindCommunitiesInputSchema>;

export interface Community {
  platform: string;
  name: string;
  url: string;
  description?: string;
  member_count?: string;
}

export type FindCommunitiesOutput = Community[];

// extract_pricing
export const ExtractPricingInputSchema = z.object({
  url: z
    .string()
    .url()
    .describe(
      "URL to extract pricing from. For best results, provide the direct /pricing page URL."
    ),
  competitor_name: z
    .string()
    .optional()
    .describe("Company name for labeling. Does not affect what is fetched."),
});

export type ExtractPricingInput = z.infer<typeof ExtractPricingInputSchema>;

export interface PricingTier {
  name: string;
  price?: string;
  billing_period?: string;
  features?: string[];
}

export interface StructuredPricing {
  tiers: PricingTier[];
  has_free_tier: boolean;
  has_enterprise: boolean;
  pricing_model?: string;
  currency?: string;
}

export interface ExtractPricingOutput {
  url: string;
  markdown_content: string;
  extraction_hints: string;
  structured_pricing?: StructuredPricing;
}

// full_research_report
export const FullResearchReportInputSchema = z.object({
  business_idea: z
    .string()
    .describe(
      "Detailed product description. Be specific about what it does, who it serves, and the category. Good: 'SaaS platform for car wash operators to manage memberships, scheduling, and payments'. Bad: 'car wash app' (too vague, returns dev agencies)."
    ),
  target_segment: z
    .string()
    .optional()
    .describe(
      "Optional niche focus to narrow results. Examples: 'B2B SaaS for car wash operators', 'consumer marketplace for auto detailing'."
    ),
  geography: z
    .enum(["global", "us", "eu", "apac"])
    .optional()
    .default("global")
    .describe("Geographic scope for market sizing: 'global' (default), 'us', 'eu', 'apac'."),
  product_type: z
    .string()
    .optional()
    .describe(
      "Product form factor for competitor filtering. Examples: 'mobile app', 'SaaS platform', 'marketplace', 'API service'."
    ),
});

export type FullResearchReportInput = z.infer<
  typeof FullResearchReportInputSchema
>;

export interface FullResearchReportSection<T> {
  data: T | null;
  error?: string;
}

export interface FullResearchReportSummary {
  key_takeaways: string[];
  failed_sections: string[];
}

export interface FullResearchReportOutput {
  business_idea: string;
  generated_at: string;
  market_size: FullResearchReportSection<EstimateMarketSizeOutput>;
  competitors: FullResearchReportSection<Competitor[]>;
  communities: FullResearchReportSection<Community[]>;
  pricing: FullResearchReportSection<ExtractPricingOutput[]>;
  summary: FullResearchReportSummary;
}
