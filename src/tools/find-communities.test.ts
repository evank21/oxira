import { describe, it, expect } from "vitest";
import { extractSubredditName, dedupeByUrl, isRelevantResult } from "./find-communities.js";
import type { Community } from "../types.js";

describe("extractSubredditName", () => {
  it("extracts subreddit from a standard URL", () => {
    expect(extractSubredditName("https://www.reddit.com/r/saas")).toBe("r/saas");
  });

  it("extracts subreddit from a URL with a trailing path", () => {
    expect(
      extractSubredditName("https://reddit.com/r/entrepreneur/comments/abc123")
    ).toBe("r/entrepreneur");
  });

  it("is case-insensitive on the domain", () => {
    expect(extractSubredditName("https://Reddit.com/r/indiehackers")).toBe(
      "r/indiehackers"
    );
  });

  it("returns undefined for non-reddit URLs", () => {
    expect(extractSubredditName("https://news.ycombinator.com")).toBeUndefined();
    expect(extractSubredditName("https://example.com/r/fake")).toBeUndefined();
  });
});

describe("isRelevantResult", () => {
  it("matches multi-word compound phrases", () => {
    expect(isRelevantResult("Best car wash services in LA", ["car wash"])).toBe(true);
  });

  it("rejects substring matches like 'wash' in 'Washington'", () => {
    expect(isRelevantResult("Washington Post breaking news", ["wash"])).toBe(false);
  });

  it("rejects single-word match when fewer than 2 terms match", () => {
    expect(isRelevantResult("r/laundry - laundry tips", ["wash", "apps"])).toBe(false);
  });

  it("accepts when at least 2 single-word terms match with word boundaries", () => {
    expect(isRelevantResult("car wash mobile service", ["car", "wash", "mobile"])).toBe(true);
  });

  it("is case insensitive", () => {
    expect(isRelevantResult("CAR WASH forum", ["car wash"])).toBe(true);
  });

  it("rejects completely irrelevant text", () => {
    expect(isRelevantResult("FBI raids on reporters", ["car wash", "detailing"])).toBe(false);
  });
});

describe("dedupeByUrl", () => {
  const make = (url: string): Community => ({
    platform: "Reddit",
    name: "test",
    url,
  });

  it("removes exact duplicate URLs", () => {
    const result = dedupeByUrl([
      make("https://reddit.com/r/saas"),
      make("https://reddit.com/r/saas"),
    ]);
    expect(result).toHaveLength(1);
  });

  it("removes duplicates that differ only by trailing slash", () => {
    const result = dedupeByUrl([
      make("https://reddit.com/r/saas"),
      make("https://reddit.com/r/saas/"),
    ]);
    expect(result).toHaveLength(1);
  });

  it("removes duplicates that differ only by case", () => {
    const result = dedupeByUrl([
      make("https://Reddit.com/r/SaaS"),
      make("https://reddit.com/r/saas"),
    ]);
    expect(result).toHaveLength(1);
  });

  it("keeps genuinely different URLs", () => {
    const result = dedupeByUrl([
      make("https://reddit.com/r/saas"),
      make("https://reddit.com/r/entrepreneur"),
    ]);
    expect(result).toHaveLength(2);
  });

  it("preserves order (first occurrence wins)", () => {
    const a = make("https://reddit.com/r/saas");
    const b = make("https://reddit.com/r/saas/");
    const result = dedupeByUrl([a, b]);
    expect(result[0]).toBe(a);
  });
});
