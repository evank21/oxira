import { describe, it, expect } from "vitest";
import {
  extractTagline,
  extractFeatures,
  extractDomain,
  scoreResult,
  isProductPage,
  buildSearchQueries,
  normalizeProductUrl,
  looksLikeProductDomain,
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

describe("scoreResult", () => {
  const result = (
    url: string,
    title = "Some Title",
    description = "Some description"
  ) => ({ url, title, description });

  describe("disqualifies content platforms", () => {
    it("filters reddit", () => {
      expect(scoreResult(result("https://reddit.com/r/something"))).toBe(0);
    });

    it("filters medium", () => {
      expect(scoreResult(result("https://medium.com/@user/article"))).toBe(0);
    });

    it("filters youtube", () => {
      expect(scoreResult(result("https://youtube.com/watch?v=123"))).toBe(0);
    });

    it("filters wikipedia", () => {
      expect(scoreResult(result("https://en.wikipedia.org/wiki/Foo"))).toBe(0);
    });

    it("filters g2 and capterra", () => {
      expect(scoreResult(result("https://g2.com/products/foo"))).toBe(0);
      expect(scoreResult(result("https://capterra.com/p/foo"))).toBe(0);
    });

    it("filters www.g2.com (www prefix variant)", () => {
      expect(
        scoreResult(
          result("https://www.g2.com/products/foo/competitors")
        )
      ).toBe(0);
    });

    it("filters tracxn.com", () => {
      expect(
        scoreResult(result("https://tracxn.com/d/companies/foo"))
      ).toBe(0);
    });

    it("filters clutch.co and goodfirms.co", () => {
      expect(scoreResult(result("https://clutch.co/profile/foo"))).toBe(0);
      expect(scoreResult(result("https://goodfirms.co/software/foo"))).toBe(0);
    });

    it("filters sourceforge.net", () => {
      expect(
        scoreResult(result("https://sourceforge.net/software/foo"))
      ).toBe(0);
    });
  });

  describe("penalizes content paths", () => {
    it("penalizes /blog/ paths", () => {
      const blog = scoreResult(result("https://acme.com/blog/top-tools"));
      const home = scoreResult(result("https://acme.com/"));
      expect(blog).toBeLessThan(home);
    });

    it("penalizes /article paths", () => {
      const article = scoreResult(
        result("https://acme.com/articles/best-picks")
      );
      const home = scoreResult(result("https://acme.com/"));
      expect(article).toBeLessThan(home);
    });

    it("penalizes /resources/ paths", () => {
      const resources = scoreResult(
        result(
          "https://asana.com/resources/best-project-management-software",
          "Best Project Management Software"
        )
      );
      const home = scoreResult(
        result("https://asana.com/", "Asana - Project Management")
      );
      expect(resources).toBeLessThan(home);
    });

    it("penalizes /guide/ and /faq/ paths", () => {
      const guide = scoreResult(
        result("https://wrike.com/project-management-guide/faq/what-is-pm")
      );
      const home = scoreResult(result("https://wrike.com/"));
      expect(guide).toBeLessThan(home);
    });
  });

  describe("penalizes listicle titles", () => {
    it("penalizes 'Top 10' titles", () => {
      const listicle = scoreResult(
        result("https://blog.example.com/", "Top 10 Car Wash Apps in 2025")
      );
      const product = scoreResult(
        result("https://washos.com/", "Washos - On-demand Car Wash")
      );
      expect(listicle).toBeLessThan(product);
    });

    it("penalizes 'Best X software' titles", () => {
      const listicle = scoreResult(
        result("https://example.com/", "Best car wash software solutions")
      );
      const product = scoreResult(
        result("https://washos.com/", "Washos - Car Wash App")
      );
      expect(listicle).toBeLessThan(product);
    });

    it("penalizes development company titles", () => {
      const agency = scoreResult(
        result(
          "https://gmtasoftware.com/",
          "Car Wash App Development Company"
        )
      );
      const product = scoreResult(
        result("https://washos.com/", "Washos - Car Wash App")
      );
      expect(agency).toBeLessThan(product);
    });
  });

  describe("penalizes agency domains", () => {
    it("penalizes domains ending in 'solutions'", () => {
      const agency = scoreResult(
        result("https://techsolutions.com/", "Tech Solutions")
      );
      const product = scoreResult(
        result("https://washos.com/", "Washos")
      );
      expect(agency).toBeLessThan(product);
    });

    it("penalizes domains with 'agency'", () => {
      const agency = scoreResult(
        result("https://devagency.com/", "Dev Agency")
      );
      const product = scoreResult(
        result("https://washos.com/", "Washos")
      );
      expect(agency).toBeLessThan(product);
    });
  });

  describe("penalizes forum domains", () => {
    it("penalizes domains containing 'forum'", () => {
      const forum = scoreResult(
        result("https://carwashforum.com/", "Car Wash Forum")
      );
      const product = scoreResult(
        result("https://washos.com/", "Washos")
      );
      expect(forum).toBeLessThan(product);
    });
  });

  describe("boosts product signals", () => {
    it("boosts results with /pricing path", () => {
      const withPricing = scoreResult(
        result("https://acme.com/pricing", "Acme Pricing")
      );
      const plain = scoreResult(
        result("https://acme.com/about", "Acme About")
      );
      expect(withPricing).toBeGreaterThan(plain);
    });

    it("boosts results with first-person description", () => {
      const firstPerson = scoreResult(
        result(
          "https://acme.com/",
          "Acme",
          "We offer the best car wash platform"
        )
      );
      const thirdPerson = scoreResult(
        result(
          "https://acme.com/",
          "Acme",
          "A review of car wash platforms"
        )
      );
      expect(firstPerson).toBeGreaterThan(thirdPerson);
    });
  });

  describe("real-world examples from the bug report", () => {
    it("scores Washos (real product) higher than On-demand-app (blog)", () => {
      const washos = scoreResult(
        result(
          "https://washos.com/",
          "Washos - On-demand Car Wash",
          "We offer convenient car wash services at your doorstep."
        )
      );
      const blog = scoreResult(
        result(
          "https://on-demand-app.com/blog/top-10-car-wash-apps",
          "Top 10 Car Wash Apps - On Demand App Development",
          "Here are the best car wash apps available in 2025."
        )
      );
      expect(washos).toBeGreaterThan(blog);
    });

    it("filters out forum sites", () => {
      const forum = scoreResult(
        result(
          "https://carwashforum.com/threads/best-apps",
          "Best apps for car wash - Car Wash Forum",
          "Discussion about the best car wash apps."
        )
      );
      expect(forum).toBeLessThan(30); // below threshold
    });

    it("scores dev agency lower than real product", () => {
      const agency = scoreResult(
        result(
          "https://gmtasoftware.com/top-car-wash-apps",
          "Top Car Wash App Development Company",
          "We build custom car wash apps for businesses."
        )
      );
      const product = scoreResult(
        result(
          "https://washify.com/",
          "Washify - Car Wash Management Platform",
          "Our platform helps car wash owners manage operations."
        )
      );
      expect(product).toBeGreaterThan(agency);
    });
  });
});

describe("isProductPage", () => {
  it("returns true for pages with signup CTA and pricing", () => {
    const md =
      "# Acme Platform\nOur platform helps you manage everything.\nSign up for free.\nPricing starts at $10/mo.";
    expect(isProductPage(md)).toBe(true);
  });

  it("returns true for pages with first-person language and signup", () => {
    const md =
      "# Washos\nWe offer on-demand car wash services.\nGet started today.\nRequest a demo.";
    expect(isProductPage(md)).toBe(true);
  });

  it("returns false for blog/listicle content", () => {
    const md =
      "# Top 10 Car Wash Apps\nHere are the best car wash apps you should try in 2025.\n1. App A\n2. App B\n3. App C";
    expect(isProductPage(md)).toBe(false);
  });

  it("returns false for forum content", () => {
    const md =
      "# Car Wash Forum - Best Apps Thread\nUser123 posted: What car wash app do you recommend?\nUser456 replied: I like App X.";
    expect(isProductPage(md)).toBe(false);
  });

  it("returns true for pages with pricing and first-person language", () => {
    const md =
      "# Washify\nWe help car wash owners manage their business.\nFree plan available. Premium is $49/mo.";
    expect(isProductPage(md)).toBe(true);
  });
});

describe("buildSearchQueries", () => {
  it("generates three queries for a basic industry", () => {
    const queries = buildSearchQueries("car wash");
    expect(queries).toHaveLength(3);
    expect(queries[0]).toContain("car wash");
    expect(queries[0]).toContain("software platform");
    expect(queries[1]).toContain("competitors alternatives");
    expect(queries[2]).toContain("pricing signup");
  });

  it("includes product_type in queries when provided", () => {
    const queries = buildSearchQueries("car wash", "mobile app");
    expect(queries[0]).toContain("mobile app");
    expect(queries[1]).toContain("mobile app");
    expect(queries[2]).toContain("mobile app");
  });

  it("omits product_type suffix when not provided", () => {
    const queries = buildSearchQueries("car wash");
    expect(queries[0]).toBe("car wash software platform");
    expect(queries[1]).toBe("car wash competitors alternatives");
    expect(queries[2]).toBe('"car wash" pricing signup');
  });

  it("third query uses quoted exact-match for the industry term", () => {
    const queries = buildSearchQueries("project management");
    expect(queries[2]).toBe('"project management" pricing signup');
  });
});

describe("looksLikeProductDomain", () => {
  it("returns true for short branded domains", () => {
    expect(looksLikeProductDomain("asana.com")).toBe(true);
    expect(looksLikeProductDomain("wrike.com")).toBe(true);
    expect(looksLikeProductDomain("washos.com")).toBe(true);
  });

  it("returns true stripping www prefix", () => {
    expect(looksLikeProductDomain("www.asana.com")).toBe(true);
  });

  it("returns false for agency domains", () => {
    expect(looksLikeProductDomain("techsolutions.com")).toBe(false);
    expect(looksLikeProductDomain("devagency.com")).toBe(false);
    expect(looksLikeProductDomain("webdevelopment.com")).toBe(false);
  });

  it("returns false for forum/magazine domains", () => {
    expect(looksLikeProductDomain("carwashforum.com")).toBe(false);
    expect(looksLikeProductDomain("carwashmag.com")).toBe(false);
  });

  it("returns false for very long hostnames", () => {
    expect(
      looksLikeProductDomain("some-really-long-domain-name-here.com")
    ).toBe(false);
  });
});

describe("normalizeProductUrl", () => {
  it("rewrites blog paths to domain root for product domains", () => {
    expect(
      normalizeProductUrl(
        "https://asana.com/resources/best-project-management-software"
      )
    ).toBe("https://asana.com");
  });

  it("rewrites /blog/ paths to root for product domains", () => {
    expect(
      normalizeProductUrl("https://paymoapp.com/blog/project-management-software/")
    ).toBe("https://paymoapp.com");
  });

  it("rewrites /guide/ and /faq/ paths", () => {
    expect(
      normalizeProductUrl(
        "https://wrike.com/project-management-guide/faq/what-is-pm"
      )
    ).toBe("https://wrike.com");
  });

  it("preserves product-related paths that are not noise", () => {
    expect(normalizeProductUrl("https://asana.com/pricing")).toBe(
      "https://asana.com/pricing"
    );
    expect(normalizeProductUrl("https://asana.com/features")).toBe(
      "https://asana.com/features"
    );
  });

  it("preserves root URLs", () => {
    expect(normalizeProductUrl("https://washos.com/")).toBe(
      "https://washos.com/"
    );
  });

  it("does not rewrite blog paths on non-product domains (agencies)", () => {
    expect(
      normalizeProductUrl(
        "https://devtechnosoftware.com/blog/top-car-wash-apps"
      )
    ).toBe("https://devtechnosoftware.com/blog/top-car-wash-apps");
  });

  it("does not rewrite blog paths on magazine/forum domains", () => {
    expect(
      normalizeProductUrl("https://carwashmag.com/articles/best-apps")
    ).toBe("https://carwashmag.com/articles/best-apps");
  });

  it("returns invalid URLs unchanged", () => {
    expect(normalizeProductUrl("not-a-url")).toBe("not-a-url");
  });
});
