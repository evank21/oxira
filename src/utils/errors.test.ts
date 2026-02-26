import { describe, it, expect } from "vitest";
import { classifySearchError } from "./errors.js";

describe("classifySearchError", () => {
  it("returns the error message for a plain Error", () => {
    expect(classifySearchError(new Error("API returned 401"))).toBe(
      "API returned 401"
    );
  });

  it("converts non-Error values to string", () => {
    expect(classifySearchError("something went wrong")).toBe(
      "something went wrong"
    );
    expect(classifySearchError(42)).toBe("42");
  });

  it("adds a Node version hint for fetch not defined", () => {
    const err = new ReferenceError("fetch is not defined");
    const result = classifySearchError(err);
    expect(result).toContain("fetch is not available");
    expect(result).toContain("Node.js 18+");
    expect(result).toContain(process.version);
    expect(result).toContain("/opt/homebrew/bin/node");
  });

  it("does not add the hint for other ReferenceErrors", () => {
    const err = new ReferenceError("someVar is not defined");
    const result = classifySearchError(err);
    expect(result).toBe("someVar is not defined");
    expect(result).not.toContain("Node.js 18+");
  });
});
