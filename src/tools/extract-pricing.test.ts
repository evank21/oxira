import { describe, it, expect } from "vitest";
import {
  generateExtractionHints,
  truncateMarkdown,
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

  it("always includes base hints", () => {
    const hints = generateExtractionHints("anything");
    expect(hints).toContain("Pricing information extracted as markdown");
    expect(hints).toContain("Parse the markdown content");
  });

  it("omits source hint when no competitor name given", () => {
    expect(generateExtractionHints("anything")).not.toContain("Source:");
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
