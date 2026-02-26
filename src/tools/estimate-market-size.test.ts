import { describe, it, expect } from "vitest";
import {
  extractDollarFigures,
  extractGrowthRate,
  classifyScope,
} from "./estimate-market-size.js";

describe("extractDollarFigures", () => {
  it("extracts $X billion format", () => {
    const text = "The market is valued at $5.2 billion";
    const figures = extractDollarFigures(text);
    expect(figures).toContain(5_200_000_000);
  });

  it("extracts $X million format", () => {
    const text = "Revenue of $150 million expected";
    const figures = extractDollarFigures(text);
    expect(figures).toContain(150_000_000);
  });

  it("extracts X billion USD format", () => {
    const text = "Market size: 3.5 billion USD";
    const figures = extractDollarFigures(text);
    expect(figures).toContain(3_500_000_000);
  });

  it("extracts USD X billion format", () => {
    const text = "TAM estimated at USD 8.7 billion";
    const figures = extractDollarFigures(text);
    expect(figures).toContain(8_700_000_000);
  });

  it("extracts multiple figures from text", () => {
    const text =
      "The market grew from $2 billion in 2020 to $5 billion in 2024";
    const figures = extractDollarFigures(text);
    expect(figures).toHaveLength(2);
    expect(figures).toContain(2_000_000_000);
    expect(figures).toContain(5_000_000_000);
  });

  it("handles comma-separated numbers", () => {
    const text = "Market size is $1,500 million";
    const figures = extractDollarFigures(text);
    expect(figures).toContain(1_500_000_000);
  });

  it("handles shorthand B notation", () => {
    const text = "Worth $10B annually";
    const figures = extractDollarFigures(text);
    expect(figures).toContain(10_000_000_000);
  });

  it("handles multiple calls without regex state leak (lastIndex bug)", () => {
    const text1 = "Market A is $1 billion";
    const text2 = "Market B is $2 billion";
    const figures1 = extractDollarFigures(text1);
    const figures2 = extractDollarFigures(text2);
    expect(figures1).toContain(1_000_000_000);
    expect(figures2).toContain(2_000_000_000);
  });
});

describe("classifyScope", () => {
  it("classifies app/platform mentions as narrow", () => {
    expect(
      classifyScope("The mobile car wash app market is valued at $3.2B")
    ).toBe("narrow");
  });

  it("classifies SaaS/software as narrow", () => {
    expect(
      classifyScope("Project management software market size")
    ).toBe("narrow");
  });

  it("classifies on-demand platform as narrow", () => {
    expect(
      classifyScope("Market size for on-demand car wash platforms")
    ).toBe("narrow");
  });

  it("classifies industry/services as broad", () => {
    expect(
      classifyScope("The car wash services industry reached $16.6 billion")
    ).toBe("broad");
  });

  it("classifies sector as broad", () => {
    expect(
      classifyScope("The global car washing sector is expected to grow")
    ).toBe("broad");
  });

  it("classifies total market as broad", () => {
    expect(
      classifyScope("The total market for car wash reached $20B")
    ).toBe("broad");
  });

  it("defaults to broad when both indicators present", () => {
    expect(
      classifyScope("The car wash app services industry is growing")
    ).toBe("broad");
  });

  it("defaults to broad when no indicators found", () => {
    expect(
      classifyScope("Car wash market valued at $5 billion")
    ).toBe("broad");
  });
});

describe("extractGrowthRate", () => {
  it("extracts CAGR percentage", () => {
    expect(extractGrowthRate("CAGR of 12.5%")).toBe("12.5%");
    expect(extractGrowthRate("with a CAGR 8%")).toBe("8%");
  });

  it("extracts growth rate percentage", () => {
    expect(extractGrowthRate("growing at 15% annually")).toBe("15%");
    expect(extractGrowthRate("growth 10%")).toBe("10%");
  });

  it("extracts percentage followed by CAGR", () => {
    expect(extractGrowthRate("expected 7.5% CAGR")).toBe("7.5%");
  });
});
