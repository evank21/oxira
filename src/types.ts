import { z } from "zod";

// Common types
export type Confidence = "high" | "medium" | "low";
export type Geography = "global" | "us" | "eu" | "apac";

// estimate_market_size
export const EstimateMarketSizeInputSchema = z.object({
  industry: z.string().describe("The industry or market to research"),
  geography: z
    .enum(["global", "us", "eu", "apac"])
    .optional()
    .default("global")
    .describe("Geographic scope for the market estimate"),
});

export type EstimateMarketSizeInput = z.infer<
  typeof EstimateMarketSizeInputSchema
>;

export interface MarketSizeSource {
  title: string;
  url: string;
  snippet: string;
}

export interface EstimateMarketSizeOutput {
  tam_estimate: {
    low: string;
    high: string;
  };
  growth_rate?: string;
  sources: MarketSizeSource[];
  confidence: Confidence;
  /** Present when search failed (no results due to API unavailability) */
  message?: string;
}

// search_competitors
export const SearchCompetitorsInputSchema = z.object({
  industry: z.string().describe("The industry or market segment"),
  product_type: z
    .string()
    .optional()
    .describe("Specific product type (e.g., SaaS, mobile app)"),
  max_results: z
    .number()
    .optional()
    .default(5)
    .describe("Maximum number of competitors to return"),
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
  target_audience: z.string().describe("The target audience to find"),
  topics: z
    .array(z.string())
    .describe("Topics to search for in communities"),
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
  url: z.string().url().describe("The URL to extract pricing from"),
  competitor_name: z
    .string()
    .optional()
    .describe("Name of the competitor (for context)"),
});

export type ExtractPricingInput = z.infer<typeof ExtractPricingInputSchema>;

export interface ExtractPricingOutput {
  url: string;
  markdown_content: string;
  extraction_hints: string;
}

// full_research_report
export const FullResearchReportInputSchema = z.object({
  business_idea: z
    .string()
    .describe("A business idea or product description to research"),
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
