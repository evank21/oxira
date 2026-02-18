import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all sub-tools before importing the module under test
vi.mock("./estimate-market-size.js", () => ({
  estimateMarketSize: vi.fn(),
}));
vi.mock("./search-competitors.js", () => ({
  searchCompetitors: vi.fn(),
}));
vi.mock("./find-communities.js", () => ({
  findCommunities: vi.fn(),
}));
vi.mock("./extract-pricing.js", () => ({
  extractPricing: vi.fn(),
}));

import {
  fullResearchReport,
  deriveTopics,
  generateSummary,
} from "./full-research-report.js";
import { estimateMarketSize } from "./estimate-market-size.js";
import { searchCompetitors } from "./search-competitors.js";
import { findCommunities } from "./find-communities.js";
import { extractPricing } from "./extract-pricing.js";
import type {
  EstimateMarketSizeOutput,
  Competitor,
  Community,
  ExtractPricingOutput,
} from "../types.js";

// ── Fixtures ────────────────────────────────────────────────────────────────

const mockMarketSize: EstimateMarketSizeOutput = {
  tam_estimate: { low: "$1.0 billion", high: "$5.0 billion" },
  growth_rate: "12%",
  sources: [],
  confidence: "medium",
};

const mockCompetitors: Competitor[] = [
  { name: "Acme", url: "https://acme.com", description: "Acme does X" },
  { name: "Baz", url: "https://baz.io", description: "Baz does Y" },
];

const mockCommunities: Community[] = [
  {
    platform: "Reddit",
    name: "r/saas",
    url: "https://reddit.com/r/saas",
    description: "SaaS discussion",
  },
  {
    platform: "HackerNews",
    name: "Show HN: startup tools",
    url: "https://news.ycombinator.com/item?id=1",
    member_count: "42 comments, 100 points",
  },
];

const mockPricing: ExtractPricingOutput = {
  url: "https://acme.com/pricing",
  markdown_content: "## Pro\n$29/mo\n## Enterprise\nCustom pricing",
  extraction_hints:
    "Has enterprise/custom pricing. Contains monthly pricing. 2 pricing tiers detected.",
};

// ── deriveTopics ─────────────────────────────────────────────────────────────

describe("deriveTopics", () => {
  it("extracts meaningful words, skipping stop words", () => {
    const topics = deriveTopics("a SaaS tool for managing invoices");
    expect(topics).toContain("saas");
    expect(topics).toContain("tool");
    expect(topics).toContain("managing");
    expect(topics).toContain("invoices");
    expect(topics).not.toContain("for");
    expect(topics).not.toContain("a");
  });

  it("deduplicates repeated words", () => {
    const topics = deriveTopics("saas saas platform");
    expect(topics.filter((t) => t === "saas")).toHaveLength(1);
  });

  it("returns at most 5 topics", () => {
    const topics = deriveTopics(
      "project management tool that helps teams collaborate better online"
    );
    expect(topics.length).toBeLessThanOrEqual(5);
  });

  it("falls back to the raw idea when no meaningful words found", () => {
    const idea = "at to be";
    const topics = deriveTopics(idea);
    expect(topics).toEqual([idea]);
  });
});

// ── generateSummary ───────────────────────────────────────────────────────────

describe("generateSummary", () => {
  it("produces key_takeaways when all sections succeed", () => {
    const summary = generateSummary(
      { data: mockCompetitors },
      { data: mockMarketSize },
      { data: mockCommunities },
      { data: [mockPricing] }
    );
    expect(summary.failed_sections).toHaveLength(0);
    expect(summary.key_takeaways.length).toBeGreaterThanOrEqual(4);
    expect(summary.key_takeaways.some((t) => t.includes("$1.0 billion"))).toBe(
      true
    );
    expect(summary.key_takeaways.some((t) => t.includes("12%"))).toBe(true);
    expect(summary.key_takeaways.some((t) => t.includes("Acme"))).toBe(true);
    expect(summary.key_takeaways.some((t) => t.includes("Reddit"))).toBe(true);
    expect(summary.key_takeaways.some((t) => t.includes("pricing"))).toBe(
      true
    );
  });

  it("records failed_sections when a section has no data", () => {
    const summary = generateSummary(
      { data: null, error: "Search failed" },
      { data: null, error: "API error" },
      { data: mockCommunities },
      { data: [] }
    );
    expect(summary.failed_sections).toContain("competitors");
    expect(summary.failed_sections).toContain("market_size");
    expect(summary.failed_sections).not.toContain("communities");
  });

  it("notes when no competitor URLs were available for pricing", () => {
    const summary = generateSummary(
      { data: [] },
      { data: mockMarketSize },
      { data: mockCommunities },
      { data: [] }
    );
    expect(
      summary.key_takeaways.some((t) => t.includes("No competitor pricing"))
    ).toBe(true);
    expect(summary.failed_sections).not.toContain("pricing");
  });

  it("marks pricing as failed when data is null and error is set", () => {
    const summary = generateSummary(
      { data: mockCompetitors },
      { data: mockMarketSize },
      { data: mockCommunities },
      { data: null, error: "Timeout" }
    );
    expect(summary.failed_sections).toContain("pricing");
  });

  it("mentions unknown market size when figures were unavailable", () => {
    const unknownMarket: EstimateMarketSizeOutput = {
      tam_estimate: { low: "Unknown", high: "Unknown" },
      sources: [],
      confidence: "low",
    };
    const summary = generateSummary(
      { data: mockCompetitors },
      { data: unknownMarket },
      { data: mockCommunities },
      { data: [] }
    );
    expect(
      summary.key_takeaways.some((t) => t.includes("unavailable"))
    ).toBe(true);
  });
});

// ── fullResearchReport ────────────────────────────────────────────────────────

describe("fullResearchReport", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns a complete report when all tools succeed", async () => {
    vi.mocked(searchCompetitors).mockResolvedValue(mockCompetitors);
    vi.mocked(estimateMarketSize).mockResolvedValue(mockMarketSize);
    vi.mocked(findCommunities).mockResolvedValue(mockCommunities);
    vi.mocked(extractPricing).mockResolvedValue(mockPricing);

    const report = await fullResearchReport({
      business_idea: "SaaS invoicing tool for freelancers",
    });

    expect(report.business_idea).toBe("SaaS invoicing tool for freelancers");
    expect(report.generated_at).toBeTruthy();
    expect(report.competitors.data).toEqual(mockCompetitors);
    expect(report.market_size.data).toEqual(mockMarketSize);
    expect(report.communities.data).toEqual(mockCommunities);
    expect(report.pricing.data).toHaveLength(2); // top 2 competitors
    expect(report.summary.failed_sections).toHaveLength(0);
  });

  it("calls extractPricing for the top 3 competitors only", async () => {
    const manyCompetitors: Competitor[] = Array.from({ length: 5 }, (_, i) => ({
      name: `Co${i}`,
      url: `https://co${i}.com`,
      description: `Company ${i}`,
    }));

    vi.mocked(searchCompetitors).mockResolvedValue(manyCompetitors);
    vi.mocked(estimateMarketSize).mockResolvedValue(mockMarketSize);
    vi.mocked(findCommunities).mockResolvedValue(mockCommunities);
    vi.mocked(extractPricing).mockResolvedValue(mockPricing);

    await fullResearchReport({ business_idea: "project management SaaS" });

    expect(extractPricing).toHaveBeenCalledTimes(3);
  });

  it("returns partial results when one tool fails", async () => {
    vi.mocked(searchCompetitors).mockRejectedValue(
      new Error("Search API unavailable")
    );
    vi.mocked(estimateMarketSize).mockResolvedValue(mockMarketSize);
    vi.mocked(findCommunities).mockResolvedValue(mockCommunities);
    // extractPricing should not be called when competitors failed

    const report = await fullResearchReport({
      business_idea: "AI writing assistant",
    });

    expect(report.competitors.data).toBeNull();
    expect(report.competitors.error).toBe("Search API unavailable");
    expect(report.market_size.data).toEqual(mockMarketSize);
    expect(report.communities.data).toEqual(mockCommunities);
    // No competitor URLs → pricing is empty array, not called
    expect(extractPricing).not.toHaveBeenCalled();
    expect(report.summary.failed_sections).toContain("competitors");
  });

  it("returns partial results when multiple tools fail", async () => {
    vi.mocked(searchCompetitors).mockRejectedValue(new Error("Timeout"));
    vi.mocked(estimateMarketSize).mockRejectedValue(new Error("API error"));
    vi.mocked(findCommunities).mockResolvedValue(mockCommunities);

    const report = await fullResearchReport({
      business_idea: "email marketing platform",
    });

    expect(report.competitors.data).toBeNull();
    expect(report.market_size.data).toBeNull();
    expect(report.communities.data).toEqual(mockCommunities);
    expect(report.summary.failed_sections).toContain("competitors");
    expect(report.summary.failed_sections).toContain("market_size");
    expect(report.summary.failed_sections).not.toContain("communities");
  });

  it("handles pricing failures gracefully", async () => {
    vi.mocked(searchCompetitors).mockResolvedValue(mockCompetitors);
    vi.mocked(estimateMarketSize).mockResolvedValue(mockMarketSize);
    vi.mocked(findCommunities).mockResolvedValue(mockCommunities);
    vi.mocked(extractPricing).mockRejectedValue(new Error("Fetch timeout"));

    const report = await fullResearchReport({
      business_idea: "time tracking SaaS",
    });

    expect(report.pricing.data).toBeNull();
    expect(report.pricing.error).toMatch(/Failed for 2 competitor/);
    expect(report.summary.failed_sections).toContain("pricing");
  });

  it("handles partial pricing failures (some succeed, some fail)", async () => {
    vi.mocked(searchCompetitors).mockResolvedValue(mockCompetitors);
    vi.mocked(estimateMarketSize).mockResolvedValue(mockMarketSize);
    vi.mocked(findCommunities).mockResolvedValue(mockCommunities);

    vi.mocked(extractPricing)
      .mockResolvedValueOnce(mockPricing)
      .mockRejectedValueOnce(new Error("403 Forbidden"));

    const report = await fullResearchReport({
      business_idea: "customer support platform",
    });

    // One succeeded → data is non-null
    expect(report.pricing.data).toHaveLength(1);
    // One failed → error note is present
    expect(report.pricing.error).toMatch(/Failed for 1 competitor/);
    // Summary should still mention pricing (not in failed_sections)
    expect(report.summary.failed_sections).not.toContain("pricing");
  });

  it("skips pricing entirely when competitor search returns empty list", async () => {
    vi.mocked(searchCompetitors).mockResolvedValue([]);
    vi.mocked(estimateMarketSize).mockResolvedValue(mockMarketSize);
    vi.mocked(findCommunities).mockResolvedValue([]);

    const report = await fullResearchReport({
      business_idea: "niche B2B tool",
    });

    expect(extractPricing).not.toHaveBeenCalled();
    expect(report.pricing.data).toEqual([]);
  });

  it("includes generated_at as a valid ISO date string", async () => {
    vi.mocked(searchCompetitors).mockResolvedValue([]);
    vi.mocked(estimateMarketSize).mockResolvedValue(mockMarketSize);
    vi.mocked(findCommunities).mockResolvedValue([]);

    const report = await fullResearchReport({ business_idea: "test idea" });

    expect(() => new Date(report.generated_at)).not.toThrow();
    expect(new Date(report.generated_at).toISOString()).toBe(
      report.generated_at
    );
  });
});
