# Oxira

An MCP (Model Context Protocol) server for indie hackers to evaluate business ideas. Provides tools for market research, competitor analysis, community discovery, and pricing extraction.

## Features

- **estimate_market_size** — Estimate Total Addressable Market (TAM) for an industry with confidence levels and sources
- **search_competitors** — Find competitors with descriptions, taglines, and features
- **find_communities** — Discover HackerNews, Reddit, Discord, and forum communities
- **extract_pricing** — Fetch pricing pages as markdown for LLM analysis

## Prerequisites

- Node.js 18+
- [Brave Search API](https://brave.com/search/api/) key (free tier available)
- Optional: [Tavily API](https://tavily.com/) key for fallback when Brave is unavailable

## Installation

```bash
git clone https://github.com/your-username/oxira.git
cd oxira
npm install
npm run build
```

## Configuration

Create a `.env` file (or set environment variables):

```
BRAVE_SEARCH_API_KEY=your_key_here
TAVILY_API_KEY=optional_fallback_key
```

See [.env.example](.env.example) for the template.

## Usage

### MCP clients (Claude Desktop, Cline, etc.)

Add Oxira to your MCP configuration. Example for Claude Desktop (`~/.config/claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "oxira": {
      "command": "node",
      "args": ["/path/to/oxira/dist/index.js"],
      "env": {
        "BRAVE_SEARCH_API_KEY": "your_key",
        "TAVILY_API_KEY": "optional_fallback_key"
      }
    }
  }
}
```

Replace `/path/to/oxira` with the absolute path to your Oxira installation.

### Run manually

```bash
npm start
```

The server communicates over stdio using JSON-RPC. MCP clients manage the lifecycle.

## Development

```bash
npm run build      # Compile TypeScript to dist/
npm run dev        # Watch mode
npm test           # Run tests
npm run test:watch # Tests in watch mode
npm run lint       # Run ESLint
```

## Architecture

```
src/
├── index.ts       # MCP server entry point
├── types.ts       # Zod schemas and TypeScript types
├── tools/         # Tool implementations
├── services/      # API clients (Brave, Tavily, HN Algolia, web fetcher)
└── utils/         # Rate limiter, retry logic
```

## License

MIT — see [LICENSE](LICENSE).
