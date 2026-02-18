import { fullResearchReport } from "../src/tools/full-research-report.js";

const idea = process.argv[2] ?? "AI-powered invoice automation for freelancers";

console.log(`\nResearching: "${idea}"\n${"─".repeat(60)}\n`);

const result = await fullResearchReport({ business_idea: idea });

// Print summary first
console.log("SUMMARY");
console.log("─".repeat(40));
result.summary.key_takeaways.forEach((t) => console.log(`• ${t}`));
if (result.summary.failed_sections.length > 0) {
  console.log(`\n⚠ Failed sections: ${result.summary.failed_sections.join(", ")}`);
}

// Market size
console.log("\nMARKET SIZE");
console.log("─".repeat(40));
if (result.market_size.data) {
  const { tam_estimate, growth_rate, confidence } = result.market_size.data;
  console.log(`TAM: ${tam_estimate.low} – ${tam_estimate.high}`);
  if (growth_rate) console.log(`Growth: ${growth_rate}`);
  console.log(`Confidence: ${confidence}`);
} else {
  console.log(`Error: ${result.market_size.error}`);
}

// Competitors
console.log("\nCOMPETITORS");
console.log("─".repeat(40));
if (result.competitors.data) {
  result.competitors.data.forEach((c) => {
    console.log(`${c.name} — ${c.url}`);
    if (c.tagline) console.log(`  "${c.tagline}"`);
  });
} else {
  console.log(`Error: ${result.competitors.error}`);
}

// Communities
console.log("\nCOMMUNITIES");
console.log("─".repeat(40));
if (result.communities.data) {
  result.communities.data.slice(0, 5).forEach((c) => {
    console.log(`[${c.platform}] ${c.name} — ${c.url}`);
  });
  if (result.communities.data.length > 5) {
    console.log(`  … and ${result.communities.data.length - 5} more`);
  }
} else {
  console.log(`Error: ${result.communities.error}`);
}

// Pricing
console.log("\nPRICING");
console.log("─".repeat(40));
if (result.pricing.data && result.pricing.data.length > 0) {
  result.pricing.data.forEach((p) => {
    console.log(`${p.url}`);
    console.log(`  Hints: ${p.extraction_hints}`);
  });
} else if (result.pricing.error) {
  console.log(`Error: ${result.pricing.error}`);
} else {
  console.log("No pricing pages available.");
}

console.log("\n" + "─".repeat(60));
console.log("Full JSON written to stdout — pipe to jq for details:");
console.log("  npx tsx scripts/smoke.ts | tail -1 | jq .\n");
