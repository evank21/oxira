import { estimateMarketSize } from "./estimate-market-size.js";
import { searchCompetitors } from "./search-competitors.js";
import { findCommunities } from "./find-communities.js";
import { extractPricing } from "./extract-pricing.js";
import type {
  FullResearchReportInput,
  FullResearchReportOutput,
  FullResearchReportSection,
  FullResearchReportSummary,
  EstimateMarketSizeOutput,
  Competitor,
  Community,
  ExtractPricingOutput,
} from "../types.js";

const STOP_WORDS = new Set([
  "a", "an", "the", "for", "and", "or", "of", "in", "to", "that",
  "with", "is", "are", "on", "it", "as", "at", "by", "be", "do",
  "we", "my", "our", "your", "this", "from", "into", "was",
]);

/** Derives a list of topics from a free-form business idea string. */
export function deriveTopics(businessIdea: string): string[] {
  const words = businessIdea
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

  const topics = [...new Set(words)].slice(0, 5);
  return topics.length > 0 ? topics : [businessIdea];
}

function settledToSection<T>(
  result: PromiseSettledResult<T>
): FullResearchReportSection<T> {
  if (result.status === "fulfilled") {
    return { data: result.value };
  }
  const error =
    result.reason instanceof Error
      ? result.reason.message
      : "Unknown error";
  return { data: null, error };
}

export function generateSummary(
  competitors: FullResearchReportSection<Competitor[]>,
  marketSize: FullResearchReportSection<EstimateMarketSizeOutput>,
  communities: FullResearchReportSection<Community[]>,
  pricing: FullResearchReportSection<ExtractPricingOutput[]>
): FullResearchReportSummary {
  const key_takeaways: string[] = [];
  const failed_sections: string[] = [];

  // Market size takeaway
  if (marketSize.data) {
    const { tam_estimate, growth_rate, confidence } = marketSize.data;
    if (tam_estimate.low !== "Unknown") {
      const growthSuffix = growth_rate ? `, growing at ${growth_rate}` : "";
      key_takeaways.push(
        `Market size is estimated between ${tam_estimate.low} and ${tam_estimate.high} (${confidence} confidence)${growthSuffix}.`
      );
    } else {
      key_takeaways.push(
        "Market size data was unavailable from search results."
      );
    }
  } else {
    failed_sections.push("market_size");
  }

  // Competitors takeaway
  if (competitors.data) {
    const count = competitors.data.length;
    const topNames = competitors.data
      .slice(0, 3)
      .map((c) => c.name)
      .join(", ");
    const suffix = count > 0 ? `, including ${topNames}` : "";
    key_takeaways.push(
      `Found ${count} competitor${count !== 1 ? "s" : ""}${suffix}.`
    );
  } else {
    failed_sections.push("competitors");
  }

  // Communities takeaway
  if (communities.data) {
    const count = communities.data.length;
    const platforms = [
      ...new Set(communities.data.map((c) => c.platform)),
    ];
    key_takeaways.push(
      `Identified ${count} communit${count !== 1 ? "ies" : "y"} across ${platforms.join(", ")}.`
    );
  } else {
    failed_sections.push("communities");
  }

  // Pricing takeaway
  if (pricing.data && pricing.data.length > 0) {
    const count = pricing.data.length;
    const allHints = pricing.data.map((p) => p.extraction_hints).join(" ");
    const hasFreeTier = /free tier/i.test(allHints);
    const hasEnterprise = /enterprise/i.test(allHints);
    const extras = [
      hasFreeTier ? "at least one offers a free tier" : null,
      hasEnterprise ? "enterprise pricing is common" : null,
    ]
      .filter(Boolean)
      .join("; ");
    key_takeaways.push(
      `Pricing analysis completed for ${count} competitor${count !== 1 ? "s" : ""}${extras ? `; ${extras}` : ""}.`
    );
  } else if (!pricing.data || pricing.data.length === 0) {
    if (pricing.error) {
      failed_sections.push("pricing");
    } else {
      key_takeaways.push(
        "No competitor pricing pages could be analysed (no competitor URLs available)."
      );
    }
  }

  return { key_takeaways, failed_sections };
}

export async function fullResearchReport(
  input: FullResearchReportInput
): Promise<FullResearchReportOutput> {
  const { business_idea } = input;

  const topics = deriveTopics(business_idea);

  // Run competitors, market size, and communities in parallel
  const [competitorsSettled, marketSizeSettled, communitiesSettled] =
    await Promise.allSettled([
      searchCompetitors({ industry: business_idea, max_results: 5 }),
      estimateMarketSize({ industry: business_idea, geography: "global" }),
      findCommunities({ target_audience: business_idea, topics }),
    ]);

  const competitorsSection = settledToSection(competitorsSettled);
  const marketSizeSection = settledToSection(marketSizeSettled);
  const communitiesSection = settledToSection(communitiesSettled);

  // Extract pricing for the top competitors (depends on competitor results)
  let pricingSection: FullResearchReportSection<ExtractPricingOutput[]>;

  if (competitorsSection.data && competitorsSection.data.length > 0) {
    const topCompetitors = competitorsSection.data.slice(0, 3);

    const pricingSettled = await Promise.allSettled(
      topCompetitors.map((c) =>
        extractPricing({ url: c.url, competitor_name: c.name })
      )
    );

    const succeeded = pricingSettled
      .filter(
        (r): r is PromiseFulfilledResult<ExtractPricingOutput> =>
          r.status === "fulfilled"
      )
      .map((r) => r.value);

    const failedMessages = pricingSettled
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) =>
        r.reason instanceof Error ? r.reason.message : "Unknown error"
      );

    pricingSection = {
      data: succeeded.length > 0 ? succeeded : null,
      ...(failedMessages.length > 0 && {
        error: `Failed for ${failedMessages.length} competitor(s): ${failedMessages.join("; ")}`,
      }),
    };
  } else {
    pricingSection = { data: [] };
  }

  const summary = generateSummary(
    competitorsSection,
    marketSizeSection,
    communitiesSection,
    pricingSection
  );

  return {
    business_idea,
    generated_at: new Date().toISOString(),
    market_size: marketSizeSection,
    competitors: competitorsSection,
    communities: communitiesSection,
    pricing: pricingSection,
    summary,
  };
}
