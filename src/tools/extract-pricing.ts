import { fetchPricingPage } from "../services/web-fetcher.js";
import type {
  ExtractPricingInput,
  ExtractPricingOutput,
  StructuredPricing,
  PricingTier,
} from "../types.js";

const TIER_NAMES =
  /(?:free|basic|starter|hobby|pro|professional|team|business|enterprise|plus|premium|growth|scale|unlimited|standard|essential|advanced|lite)/i;

const PRICE_PATTERN =
  /\$[\d,]+(?:\.\d{1,2})?(?:\s*\/\s*(?:mo(?:nth)?|yr|year|annual(?:ly)?|user[\s/]*mo(?:nth)?|seat[\s/]*mo(?:nth)?))?/i;

const CUSTOM_PATTERN =
  /\b(?:custom|contact\s+(?:us|sales)|get\s+a\s+quote|book\s+a\s+demo|request\s+pricing)\b/i;

function extractBillingPeriod(priceStr: string): string | undefined {
  if (/\/\s*(?:yr|year|annual)/i.test(priceStr)) return "annual";
  if (/\/\s*(?:mo|month)/i.test(priceStr)) return "monthly";
  if (/user|seat/i.test(priceStr)) return "monthly";
  return undefined;
}

function extractTierFeatures(section: string): string[] {
  const features: string[] = [];
  const lines = section.split("\n");
  for (const line of lines) {
    const match = line.match(/^\s*[-*•✓✔☑]\s+(.+)/);
    if (match && match[1].trim().length > 3) {
      features.push(match[1].trim());
      if (features.length >= 5) break;
    }
  }
  return features;
}

function detectPricingModel(markdown: string): string | undefined {
  const lower = markdown.toLowerCase();
  if (/per\s+(?:user|seat|member)/i.test(lower)) return "per-user";
  if (/usage|metered|pay\s+as\s+you\s+go/i.test(lower)) return "usage-based";
  if (/subscri(?:be|ption)|membership/i.test(lower)) return "subscription";
  if (PRICE_PATTERN.test(lower)) return "flat-rate";
  return undefined;
}

export function extractStructuredPricing(markdown: string): StructuredPricing {
  const tiers: PricingTier[] = [];

  // Split by headings that look like tier names
  const tierPattern = /^#{1,3}\s+(.+)|^\*\*(.+?)\*\*/gm;
  const sections: { name: string; content: string; start: number }[] = [];

  let match: RegExpExecArray | null;
  while ((match = tierPattern.exec(markdown)) !== null) {
    const rawName = (match[1] || match[2]).trim();
    sections.push({ name: rawName, content: "", start: match.index + match[0].length });
  }

  // Fill in content between sections
  for (let i = 0; i < sections.length; i++) {
    const end = i + 1 < sections.length ? sections[i + 1].start - (sections[i + 1].name.length + 4) : markdown.length;
    sections[i].content = markdown.slice(sections[i].start, end);
  }

  // Extract tiers from sections that look pricing-related
  for (const section of sections) {
    const nameAndContent = `${section.name} ${section.content}`;
    const hasTierName = TIER_NAMES.test(section.name);
    const hasPrice = PRICE_PATTERN.test(nameAndContent);
    const hasCustom = CUSTOM_PATTERN.test(nameAndContent);

    if (!hasTierName && !hasPrice && !hasCustom) continue;

    const tier: PricingTier = {
      name: section.name.replace(/\s*plan\b/i, "").trim(),
    };

    const priceMatch = nameAndContent.match(PRICE_PATTERN);
    if (priceMatch) {
      tier.price = priceMatch[0].trim();
      tier.billing_period = extractBillingPeriod(tier.price);
    } else if (/free|\$0\b/i.test(nameAndContent)) {
      tier.price = "Free";
      tier.billing_period = "free";
    } else if (hasCustom) {
      tier.price = "Custom";
      tier.billing_period = "custom";
    }

    const features = extractTierFeatures(section.content);
    if (features.length > 0) tier.features = features;

    tiers.push(tier);
  }

  // Fallback: no tier headings found, scan entire markdown for a price
  if (tiers.length === 0) {
    const priceMatch = markdown.match(PRICE_PATTERN);
    if (priceMatch) {
      tiers.push({
        name: "Default",
        price: priceMatch[0].trim(),
        billing_period: extractBillingPeriod(priceMatch[0]),
      });
    }
  }

  return {
    tiers,
    has_free_tier: tiers.some(
      (t) =>
        t.billing_period === "free" ||
        /^free$/i.test(t.price || "") ||
        /^\$0\b/.test(t.price || "")
    ),
    has_enterprise: tiers.some(
      (t) => /enterprise/i.test(t.name)
    ),
    pricing_model: detectPricingModel(markdown),
    currency: PRICE_PATTERN.test(markdown) ? "USD" : undefined,
  };
}

export function generateExtractionHints(
  markdown: string,
  competitorName?: string,
  structured?: StructuredPricing
): string {
  const hints: string[] = [];

  // If structured pricing was extracted, summarize it
  if (structured && structured.tiers.length > 0) {
    const tierSummaries = structured.tiers.map(
      (t) => `${t.name}${t.price ? ` (${t.price})` : ""}`
    );
    hints.push(`Extracted ${structured.tiers.length} pricing tier${structured.tiers.length !== 1 ? "s" : ""}: ${tierSummaries.join(", ")}`);
    if (structured.pricing_model) {
      hints.push(`Pricing model: ${structured.pricing_model}`);
    }
  } else {
    // Fallback to regex-based hints when no structure found
    if (markdown.toLowerCase().includes("free")) {
      hints.push("Has a free tier or free trial");
    }
    if (markdown.toLowerCase().includes("enterprise")) {
      hints.push("Has enterprise/custom pricing");
    }
    const monthlyMatch = markdown.match(/\$[\d,]+(?:\.\d{2})?\s*\/\s*(?:mo|month)/i);
    if (monthlyMatch) {
      hints.push("Contains monthly pricing");
    }
    const yearlyMatch = markdown.match(/\$[\d,]+(?:\.\d{2})?\s*\/\s*(?:yr|year|annual)/i);
    if (yearlyMatch) {
      hints.push("Contains annual pricing");
    }
    if (markdown.match(/per\s+(?:user|seat|member)/i)) {
      hints.push("Per-user/seat pricing model");
    }
    if (markdown.match(/per\s+(?:project|workspace|team)/i)) {
      hints.push("Per-project/workspace pricing model");
    }
    const planHeadings = markdown.match(/#{1,3}\s*(free|basic|starter|pro|professional|team|business|enterprise|plus|premium)/gi);
    if (planHeadings) {
      hints.push(`${planHeadings.length} pricing tiers detected`);
    }
  }

  if (competitorName) {
    hints.push(`Source: ${competitorName}`);
  }

  return hints.join(". ");
}

export function truncateMarkdown(markdown: string, maxLength: number = 5000): string {
  if (markdown.length <= maxLength) {
    return markdown;
  }

  // Try to cut at a natural break point
  const truncated = markdown.slice(0, maxLength);
  const lastNewline = truncated.lastIndexOf("\n");

  if (lastNewline > maxLength * 0.8) {
    return truncated.slice(0, lastNewline) + "\n\n[Content truncated...]";
  }

  return truncated + "\n\n[Content truncated...]";
}

export async function extractPricing(
  input: ExtractPricingInput
): Promise<ExtractPricingOutput> {
  const { url, competitor_name } = input;

  try {
    const result = await fetchPricingPage(url);

    const structured = extractStructuredPricing(result.markdown);
    const markdown = truncateMarkdown(result.markdown);
    const hints = generateExtractionHints(markdown, competitor_name, structured);

    return {
      url: result.url,
      markdown_content: markdown,
      extraction_hints: hints,
      structured_pricing: structured,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    return {
      url,
      markdown_content: `Failed to fetch pricing page: ${errorMessage}`,
      extraction_hints:
        "Could not fetch the pricing page. The URL may be incorrect, the site may be down, or it may be blocking automated requests.",
    };
  }
}
