import { describe, it, expect } from "vitest";
import TurndownService from "turndown";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

turndown.remove(["script", "style", "nav", "footer", "header", "aside", "noscript"]);

describe("HTML to Markdown conversion", () => {
  it("converts headings", () => {
    const html = "<h1>Title</h1><h2>Subtitle</h2>";
    const md = turndown.turndown(html);
    expect(md).toContain("# Title");
    expect(md).toContain("## Subtitle");
  });

  it("converts paragraphs", () => {
    const html = "<p>Hello world</p><p>Second paragraph</p>";
    const md = turndown.turndown(html);
    expect(md).toContain("Hello world");
    expect(md).toContain("Second paragraph");
  });

  it("converts links", () => {
    const html = '<a href="https://example.com">Example</a>';
    const md = turndown.turndown(html);
    expect(md).toContain("[Example](https://example.com)");
  });

  it("converts lists", () => {
    const html = "<ul><li>Item 1</li><li>Item 2</li></ul>";
    const md = turndown.turndown(html);
    // Turndown uses * for bullet points by default
    expect(md).toContain("Item 1");
    expect(md).toContain("Item 2");
    expect(md).toMatch(/[*-]\s+Item 1/);
  });

  it("removes script tags", () => {
    const html = "<p>Content</p><script>alert('hi')</script>";
    const md = turndown.turndown(html);
    expect(md).toContain("Content");
    expect(md).not.toContain("alert");
  });

  it("removes style tags", () => {
    const html = "<style>.foo { color: red; }</style><p>Content</p>";
    const md = turndown.turndown(html);
    expect(md).toContain("Content");
    expect(md).not.toContain("color");
  });

  it("removes nav elements", () => {
    const html = "<nav><a href='/'>Home</a></nav><main>Content</main>";
    const md = turndown.turndown(html);
    expect(md).toContain("Content");
    expect(md).not.toContain("Home");
  });
});

describe("URL parsing", () => {
  it("extracts domain from URL", () => {
    const url = "https://www.example.com/pricing";
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace(/^www\./, "");
    expect(domain).toBe("example.com");
  });

  it("handles URLs without www", () => {
    const url = "https://example.com/about";
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace(/^www\./, "");
    expect(domain).toBe("example.com");
  });
});
