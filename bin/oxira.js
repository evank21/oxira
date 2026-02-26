#!/usr/bin/env node

const [major] = process.versions.node.split(".").map(Number);

if (major < 18) {
  process.stderr.write(
    `Oxira requires Node.js 18 or later. Current version: ${process.version}.\n` +
    `If using Claude Desktop or another MCP client, set "command" to an absolute\n` +
    `path to Node 18+, e.g. "/opt/homebrew/bin/npx" instead of "npx".\n`
  );
  process.exit(1);
}

await import("../dist/index.js");
