import { fetchPricingPage } from "../services/web-fetcher.js";
import type { ExtractPricingInput, ExtractPricingOutput } from "../types.js";

export function generateExtractionHints(
  markdown: string,
  competitorName?: string
): string {
  const hints: string[] = [];

  // Check for common pricing elements
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

  // Count number of plan-like headings
  const planHeadings = markdown.match(/#{1,3}\s*(free|basic|starter|pro|professional|team|business|enterprise|plus|premium)/gi);
  if (planHeadings) {
    hints.push(`${planHeadings.length} pricing tiers detected`);
  }

  // Base hints
  hints.push("Pricing information extracted as markdown");
  if (competitorName) {
    hints.push(`Source: ${competitorName}`);
  }
  hints.push("Parse the markdown content to extract specific prices and features");

  return hints.join(". ");
}

export function truncateMarkdown(markdown: string, maxLength: number = 15000): string {
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

    const markdown = truncateMarkdown(result.markdown);
    const hints = generateExtractionHints(markdown, competitor_name);

    return {
      url: result.url,
      markdown_content: markdown,
      extraction_hints: hints,
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
