import { describe, it, expect } from "vitest";
import {
  generateExtractionHints,
  truncateMarkdown,
  extractStructuredPricing,
} from "./extract-pricing.js";

describe("generateExtractionHints", () => {
  it("detects a free tier", () => {
    expect(generateExtractionHints("Get started for free today")).toContain(
      "Has a free tier or free trial"
    );
  });

  it("detects enterprise pricing", () => {
    expect(generateExtractionHints("Enterprise plan available")).toContain(
      "Has enterprise/custom pricing"
    );
  });

  it("detects monthly pricing", () => {
    expect(generateExtractionHints("$29/mo billed monthly")).toContain(
      "Contains monthly pricing"
    );
    expect(generateExtractionHints("$49/month")).toContain(
      "Contains monthly pricing"
    );
  });

  it("detects annual pricing", () => {
    expect(generateExtractionHints("$299/year")).toContain(
      "Contains annual pricing"
    );
    expect(generateExtractionHints("$199/yr")).toContain(
      "Contains annual pricing"
    );
  });

  it("detects per-user pricing", () => {
    expect(generateExtractionHints("$10 per user per month")).toContain(
      "Per-user/seat pricing model"
    );
    expect(generateExtractionHints("pricing per seat")).toContain(
      "Per-user/seat pricing model"
    );
  });

  it("detects per-workspace pricing", () => {
    expect(generateExtractionHints("$25 per workspace")).toContain(
      "Per-project/workspace pricing model"
    );
  });

  it("counts plan headings", () => {
    const markdown = "## Free\n## Pro\n## Enterprise\n";
    const hints = generateExtractionHints(markdown);
    expect(hints).toContain("3 pricing tiers detected");
  });

  it("includes competitor name when provided", () => {
    expect(generateExtractionHints("some content", "Acme")).toContain(
      "Source: Acme"
    );
  });

  it("uses structured summary when structured pricing is provided", () => {
    const structured = {
      tiers: [
        { name: "Free", price: "Free" },
        { name: "Pro", price: "$29/mo" },
      ],
      has_free_tier: true,
      has_enterprise: false,
      pricing_model: "flat-rate" as const,
    };
    const hints = generateExtractionHints("some content", "Acme", structured);
    expect(hints).toContain("Extracted 2 pricing tiers: Free (Free), Pro ($29/mo)");
    expect(hints).toContain("Pricing model: flat-rate");
    expect(hints).toContain("Source: Acme");
    // Should not include fallback hints
    expect(hints).not.toContain("Parse the markdown content");
  });

  it("falls back to regex hints when no structured tiers", () => {
    const hints = generateExtractionHints("$29/mo plan with free tier");
    expect(hints).toContain("Has a free tier or free trial");
    expect(hints).toContain("Contains monthly pricing");
  });

  it("omits source hint when no competitor name given", () => {
    expect(generateExtractionHints("anything")).not.toContain("Source:");
  });
});

describe("extractStructuredPricing", () => {
  it("extracts basic tiers from headings", () => {
    const markdown =
      "## Free\n$0/mo\n- 1 project\n\n## Pro\n$29/mo\n- Unlimited projects\n- Priority support";
    const result = extractStructuredPricing(markdown);

    expect(result.tiers).toHaveLength(2);
    expect(result.tiers[0].name).toBe("Free");
    expect(result.tiers[0].price).toBe("$0/mo");
    expect(result.tiers[0].billing_period).toBe("monthly");
    expect(result.tiers[1].name).toBe("Pro");
    expect(result.tiers[1].price).toBe("$29/mo");
    expect(result.tiers[1].features).toContain("Unlimited projects");
    expect(result.has_free_tier).toBe(true);
    expect(result.has_enterprise).toBe(false);
    expect(result.currency).toBe("USD");
  });

  it("detects enterprise/custom pricing", () => {
    const markdown =
      "## Enterprise\nContact sales for pricing\n- Custom integrations\n- Dedicated support";
    const result = extractStructuredPricing(markdown);

    expect(result.tiers).toHaveLength(1);
    expect(result.tiers[0].name).toBe("Enterprise");
    expect(result.tiers[0].price).toBe("Custom");
    expect(result.tiers[0].billing_period).toBe("custom");
    expect(result.has_enterprise).toBe(true);
    expect(result.tiers[0].features).toContain("Custom integrations");
  });

  it("detects per-user pricing model", () => {
    const markdown = "## Team\n$10 per user per month\n- Collaboration features";
    const result = extractStructuredPricing(markdown);

    expect(result.pricing_model).toBe("per-user");
  });

  it("falls back to Default tier when no headings found", () => {
    const markdown = "Starting at $19.99/month for unlimited washes";
    const result = extractStructuredPricing(markdown);

    expect(result.tiers).toHaveLength(1);
    expect(result.tiers[0].name).toBe("Default");
    expect(result.tiers[0].price).toBe("$19.99/month");
    expect(result.tiers[0].billing_period).toBe("monthly");
  });

  it("returns empty tiers when no pricing found", () => {
    const markdown = "Welcome to our product page. Sign up today!";
    const result = extractStructuredPricing(markdown);

    expect(result.tiers).toHaveLength(0);
    expect(result.has_free_tier).toBe(false);
    expect(result.has_enterprise).toBe(false);
  });

  it("extracts annual pricing", () => {
    const markdown = "## Pro\n$299/year\n- Everything included";
    const result = extractStructuredPricing(markdown);

    expect(result.tiers[0].price).toBe("$299/year");
    expect(result.tiers[0].billing_period).toBe("annual");
  });

  it("detects usage-based pricing model", () => {
    const markdown = "## Pay As You Go\n$0.01 per request\nUsage-based billing";
    const result = extractStructuredPricing(markdown);

    expect(result.pricing_model).toBe("usage-based");
  });

  it("limits features to 5 per tier", () => {
    const features = Array.from({ length: 8 }, (_, i) => `- Feature ${i + 1}`).join("\n");
    const markdown = `## Pro\n$49/mo\n${features}`;
    const result = extractStructuredPricing(markdown);

    expect(result.tiers[0].features).toHaveLength(5);
  });

  it("handles bold tier names", () => {
    const markdown = "**Basic**\n$9/mo\n- 5 users\n\n**Premium**\n$49/mo\n- Unlimited users";
    const result = extractStructuredPricing(markdown);

    expect(result.tiers).toHaveLength(2);
    expect(result.tiers[0].name).toBe("Basic");
    expect(result.tiers[1].name).toBe("Premium");
  });
});

describe("truncateMarkdown", () => {
  it("returns content unchanged when under the limit", () => {
    const short = "hello world";
    expect(truncateMarkdown(short)).toBe(short);
  });

  it("truncates at a newline when one falls past the 80% threshold", () => {
    const base = "a".repeat(900) + "\n" + "b".repeat(200);
    const result = truncateMarkdown(base, 1000);
    expect(result).toContain("[Content truncated...]");
    expect(result.endsWith("[Content truncated...]")).toBe(true);
    // Should cut at the newline, not mid-word
    expect(result).not.toContain("b");
  });

  it("truncates at maxLength when no good newline exists", () => {
    const long = "a".repeat(2000);
    const result = truncateMarkdown(long, 1000);
    expect(result).toContain("[Content truncated...]");
    expect(result.startsWith("a".repeat(1000))).toBe(true);
  });

  it("respects a custom maxLength", () => {
    const content = "x".repeat(100);
    expect(truncateMarkdown(content, 50)).toContain("[Content truncated...]");
    expect(truncateMarkdown(content, 200)).toBe(content);
  });
});
