#!/usr/bin/env node

/**
 * Oxira Integration Test Harness
 *
 * Calls Oxira tool functions directly (bypassing MCP protocol) with real API calls.
 * Use this to verify tool behavior after code changes without restarting Claude Desktop.
 *
 * Usage:
 *   npx tsx test-harness.ts search_competitors '{"industry":"car wash apps"}'
 *   npx tsx test-harness.ts estimate_market_size '{"industry":"mobile car wash services"}'
 *   npx tsx test-harness.ts find_communities '{"target_audience":"car wash owners","topics":["car wash business"]}'
 *   npx tsx test-harness.ts extract_pricing '{"url":"https://asana.com/pricing","competitor_name":"Asana"}'
 *   npx tsx test-harness.ts full_research_report '{"business_idea":"on-demand car wash platform"}'
 *   npx tsx test-harness.ts all  # runs a preset suite of smoke tests
 *
 * Environment:
 *   Reads BRAVE_SEARCH_API_KEY from .env or environment variables.
 */

import { searchCompetitors } from './src/tools/search-competitors.js';
import { estimateMarketSize } from './src/tools/estimate-market-size.js';
import { findCommunities } from './src/tools/find-communities.js';
import { extractPricing } from './src/tools/extract-pricing.js';
import { fullResearchReport } from './src/tools/full-research-report.js';

// Load .env if present
import { readFileSync } from 'node:fs';
try {
  const env = readFileSync('.env', 'utf8');
  for (const line of env.split('\n')) {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
} catch {}


const TOOLS: Record<string, (input: any) => Promise<any>> = {
  search_competitors: searchCompetitors,
  estimate_market_size: estimateMarketSize,
  find_communities: findCommunities,
  extract_pricing: extractPricing,
  full_research_report: fullResearchReport,
};

// Preset smoke tests for "all" command
const SMOKE_TESTS = [
  {
    tool: 'search_competitors',
    input: { industry: 'car wash apps', max_results: 5 },
    label: 'Competitor search: car wash apps (known-bad input)',
    validate: (result: any) => {
      const dominated = ['reddit.com', 'g2.com', 'medium.com', 'tracxn.com', 'crunchbase.com'];
      const names = (result || []).map((r: any) => r.url?.toLowerCase() || '');
      const blocked = names.filter((url: string) => dominated.some(d => url.includes(d)));
      return {
        pass: blocked.length === 0,
        detail: blocked.length ? `Blocked domains still appearing: ${blocked.join(', ')}` : 'No blocked domains in results',
      };
    },
  },
  {
    tool: 'search_competitors',
    input: { industry: 'on-demand car wash service platform', max_results: 5 },
    label: 'Competitor search: optimized query',
    validate: (result: any) => {
      const count = (result || []).length;
      return { pass: count >= 3, detail: `Got ${count} results` };
    },
  },
  {
    tool: 'search_competitors',
    input: { industry: 'project management software', max_results: 5 },
    label: 'Competitor search: project management (known-good category)',
    validate: (result: any) => {
      const count = (result || []).length;
      return { pass: count >= 3, detail: `Got ${count} results` };
    },
  },
  {
    tool: 'estimate_market_size',
    input: { industry: 'mobile car wash services', geography: 'global' },
    label: 'Market size: mobile car wash services',
    validate: (result: any) => {
      const hasEstimate = result?.tam_estimate?.low && result?.tam_estimate?.high;
      return { pass: !!hasEstimate, detail: hasEstimate ? `${result.tam_estimate.low} - ${result.tam_estimate.high}` : 'No estimate returned' };
    },
  },
  {
    tool: 'find_communities',
    input: { target_audience: 'car wash business owners', topics: ['car wash business', 'auto detailing'] },
    label: 'Communities: car wash owners (optimized topics)',
    validate: (result: any) => {
      const communities = result || [];
      const irrelevant = communities.filter((c: any) => {
        const name = (c.name || '').toLowerCase();
        return name.includes('washington') || name.includes('laundry') || name === 'r/wash';
      });
      return {
        pass: irrelevant.length === 0,
        detail: irrelevant.length ? `Irrelevant results: ${irrelevant.map((c: any) => c.name).join(', ')}` : `${communities.length} results, none obviously irrelevant`,
      };
    },
  },
];

function printResult(label: string, result: any) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📋 ${label}`);
  console.log('='.repeat(70));

  if (Array.isArray(result)) {
    // Competitor or community results
    result.forEach((item: any, i: number) => {
      console.log(`\n  ${i + 1}. ${item.name || 'Unknown'}`);
      if (item.url) console.log(`     URL: ${item.url}`);
      if (item.platform) console.log(`     Platform: ${item.platform}`);
      if (item.description) console.log(`     ${item.description.slice(0, 150)}...`);
    });
  } else if (result?.tam_estimate) {
    // Market size
    console.log(`\n  TAM: ${result.tam_estimate.low} — ${result.tam_estimate.high}`);
    console.log(`  Growth: ${result.growth_rate || 'N/A'}`);
    console.log(`  Confidence: ${result.confidence || 'N/A'}`);
    console.log(`  Sources: ${(result.sources || []).length}`);
  } else if (result?.markdown_content) {
    // Pricing
    console.log(`\n  URL: ${result.url}`);
    console.log(`  Hints: ${result.extraction_hints}`);
    console.log(`  Content length: ${result.markdown_content?.length || 0} chars`);
  } else if (result?.summary) {
    // Full report
    console.log(`\n  Key takeaways:`);
    (result.summary.key_takeaways || []).forEach((t: string) => console.log(`    • ${t}`));
    if (result.summary.failed_sections?.length) {
      console.log(`  ⚠️  Failed: ${result.summary.failed_sections.join(', ')}`);
    }
  } else {
    console.log(JSON.stringify(result, null, 2).slice(0, 2000));
  }
}

async function runSingle(toolName: string, inputJson: string) {
  const fn = TOOLS[toolName];
  if (!fn) {
    console.error(`Unknown tool: ${toolName}`);
    console.error(`Available: ${Object.keys(TOOLS).join(', ')}`);
    process.exit(1);
  }

  let input: any;
  try {
    input = JSON.parse(inputJson);
  } catch {
    console.error(`Invalid JSON input: ${inputJson}`);
    process.exit(1);
  }

  console.log(`\n🔧 Running ${toolName} with:`, JSON.stringify(input));
  const start = Date.now();

  try {
    const result = await fn(input);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    printResult(`${toolName} (${elapsed}s)`, result);
  } catch (err: any) {
    console.error(`\n❌ Error: ${err.message}`);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

async function runAll() {
  console.log('🧪 Running Oxira smoke test suite...\n');
  let passed = 0;
  let failed = 0;

  for (const test of SMOKE_TESTS) {
    const fn = TOOLS[test.tool];
    console.log(`\n${'—'.repeat(60)}`);
    console.log(`🔧 ${test.label}`);
    console.log(`   Input: ${JSON.stringify(test.input)}`);

    const start = Date.now();
    try {
      const result = await fn(test.input);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);

      printResult(`${test.tool} (${elapsed}s)`, result);

      if (test.validate) {
        const validation = test.validate(result);
        if (validation.pass) {
          console.log(`\n  ✅ PASS: ${validation.detail}`);
          passed++;
        } else {
          console.log(`\n  ❌ FAIL: ${validation.detail}`);
          failed++;
        }
      } else {
        passed++;
      }
    } catch (err: any) {
      console.log(`\n  ❌ ERROR: ${err.message}`);
      failed++;
    }

    // Rate limit courtesy
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`\n🏁 Results: ${passed} passed, ${failed} failed out of ${SMOKE_TESTS.length} tests`);
  process.exit(failed > 0 ? 1 : 0);
}

// Main
const [toolName, inputJson] = process.argv.slice(2);

if (!toolName) {
  console.log('Usage:');
  console.log('  npx tsx test-harness.ts <tool_name> \'<json_input>\'');
  console.log('  npx tsx test-harness.ts all');
  console.log(`\nAvailable tools: ${Object.keys(TOOLS).join(', ')}`);
  process.exit(0);
}

if (toolName === 'all') {
  runAll();
} else {
  runSingle(toolName, inputJson || '{}');
}
