import { describe, it, expect } from "vitest";
import {
  extractTagline,
  extractFeatures,
  extractDomain,
} from "./search-competitors.js";

describe("extractDomain", () => {
  it("strips www prefix", () => {
    expect(extractDomain("https://www.example.com/path")).toBe("example.com");
  });

  it("preserves subdomains other than www", () => {
    expect(extractDomain("https://app.example.com")).toBe("app.example.com");
  });

  it("returns the input unchanged for an invalid URL", () => {
    expect(extractDomain("not-a-url")).toBe("not-a-url");
  });
});

describe("extractTagline", () => {
  it("returns the first short line from the top of the page", () => {
    const md = "# Acme\nThe fastest way to ship invoices.\nMore text here.";
    expect(extractTagline(md)).toBe("The fastest way to ship invoices.");
  });

  it("strips leading markdown heading markers", () => {
    const md = "## Ship faster, stress less\nOther content";
    expect(extractTagline(md)).toBe("Ship faster, stress less");
  });

  it("skips lines that are too short (< 10 chars)", () => {
    const md = "Hi\nThis is a proper tagline right here\nMore";
    expect(extractTagline(md)).toBe("This is a proper tagline right here");
  });

  it("skips lines that are too long (> 100 chars)", () => {
    const long = "a".repeat(101);
    const md = `${long}\nShort enough tagline here`;
    expect(extractTagline(md)).toBe("Short enough tagline here");
  });

  it("skips navigation-like lines containing pipes", () => {
    const md = "Home | About | Pricing\nThe real tagline";
    expect(extractTagline(md)).toBe("The real tagline");
  });

  it("skips lines containing 'log in'", () => {
    const md = "Log in to continue\nActual tagline here please";
    expect(extractTagline(md)).toBe("Actual tagline here please");
  });

  it("skips lines containing 'sign up'", () => {
    const md = "Sign up for free\nActual tagline here please";
    expect(extractTagline(md)).toBe("Actual tagline here please");
  });

  it("returns undefined when no suitable line exists", () => {
    expect(extractTagline("Log in | Sign up\nShort")).toBeUndefined();
  });
});

describe("extractFeatures", () => {
  it("extracts bullet point features", () => {
    const md = "- Real-time collaboration\n- Unlimited projects\n- API access";
    const features = extractFeatures(md);
    expect(features).toContain("Real-time collaboration");
    expect(features).toContain("Unlimited projects");
    expect(features).toContain("API access");
  });

  it("supports * and • bullet styles", () => {
    const md = "* Automated backups\n• Priority support";
    const features = extractFeatures(md);
    expect(features).toContain("Automated backups");
    expect(features).toContain("Priority support");
  });

  it("caps results at 5 features", () => {
    const lines = Array.from(
      { length: 10 },
      (_, i) => `- Feature number ${i + 1}`
    ).join("\n");
    expect(extractFeatures(lines)).toHaveLength(5);
  });

  it("filters out items shorter than 10 chars", () => {
    const md = "- Short\n- Long enough feature description";
    expect(extractFeatures(md)).not.toContain("Short");
    expect(extractFeatures(md)).toContain("Long enough feature description");
  });

  it("filters out nav/legal items", () => {
    const md =
      "- Log in to your account\n- Sign up for free today\n- Read our privacy policy\n- Terms of service apply\n- A real feature lives here";
    const features = extractFeatures(md);
    expect(features).not.toContain("Log in to your account");
    expect(features).not.toContain("Sign up for free today");
    expect(features).not.toContain("Read our privacy policy");
    expect(features).not.toContain("Terms of service apply");
    expect(features).toContain("A real feature lives here");
  });

  it("returns an empty array when no bullets exist", () => {
    expect(extractFeatures("No bullets here at all")).toEqual([]);
  });
});
