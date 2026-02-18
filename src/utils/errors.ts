/**
 * Classifies a caught error into a human-readable message.
 * Adds actionable hints for known failure modes (e.g. wrong Node version).
 */
export function classifySearchError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (error instanceof ReferenceError && message.includes("fetch is not defined")) {
    return (
      `fetch is not available in Node.js ${process.version}. ` +
      `Oxira requires Node.js 18+. ` +
      `If using Claude Desktop or another MCP client, set "command" to an absolute ` +
      `path such as "/opt/homebrew/bin/node" instead of "node".`
    );
  }

  return message;
}
