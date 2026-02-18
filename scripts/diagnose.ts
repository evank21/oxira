// Runs the Brave client directly and surfaces the actual error
import { getBraveSearchClient } from "../src/services/brave-search.js";
import { getTavilyClient } from "../src/services/tavily.js";

console.log("=== ENV ===");
console.log("BRAVE_SEARCH_API_KEY:", process.env.BRAVE_SEARCH_API_KEY ? `set (${process.env.BRAVE_SEARCH_API_KEY.slice(0, 6)}...)` : "MISSING");
console.log("TAVILY_API_KEY:", process.env.TAVILY_API_KEY ? "set" : "not set");

console.log("\n=== CLIENTS ===");
const brave = getBraveSearchClient();
const tavily = getTavilyClient();
console.log("Brave client:", brave ? "created" : "null (key missing)");
console.log("Tavily client:", tavily ? "created" : "null (key missing)");

if (brave) {
  console.log("\n=== BRAVE SEARCH TEST ===");
  try {
    const result = await brave.search("project management software", 3);
    console.log("SUCCESS — result count:", result.results.length);
    if (result.results[0]) console.log("First result:", result.results[0].title, result.results[0].url);
  } catch (e) {
    console.error("BRAVE ERROR:", e instanceof Error ? e.message : e);
  }
}

if (tavily) {
  console.log("\n=== TAVILY SEARCH TEST ===");
  try {
    const result = await tavily.search("project management software", 3);
    console.log("SUCCESS — result count:", result.results.length);
  } catch (e) {
    console.error("TAVILY ERROR:", e instanceof Error ? e.message : e);
  }
}
