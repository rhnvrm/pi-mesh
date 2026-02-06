import { describe, expect, test } from "bun:test";

/**
 * Standalone replica of the message renderer truncation logic from index.ts (~line 579):
 *   line.length > width ? line.slice(0, width - 3) + "..." : line
 *
 * We replicate it here because the renderer is defined inside the extension
 * factory and cannot be imported directly.
 */
function truncateLine(line: string, width: number): string {
  return line.length > width ? line.slice(0, width - 3) + "..." : line;
}

describe("renderer truncation logic", () => {
  test("line shorter than width is unchanged", () => {
    const line = "hello";
    const result = truncateLine(line, 20);
    expect(result).toBe("hello");
    expect(result.length).toBe(5);
  });

  test("line equal to width is unchanged", () => {
    const line = "abcdefghij"; // 10 chars
    const result = truncateLine(line, 10);
    expect(result).toBe("abcdefghij");
    expect(result.length).toBe(10);
  });

  test("line longer than width is truncated to exactly width chars", () => {
    const line = "abcdefghijklmnop"; // 16 chars
    const width = 10;
    const result = truncateLine(line, width);
    // slice(0, 10-3) + "..." = "abcdefg" + "..." = "abcdefg..."
    expect(result).toBe("abcdefg...");
    expect(result.length).toBe(width);
  });

  test("empty line stays empty", () => {
    const result = truncateLine("", 20);
    expect(result).toBe("");
  });

  test("width=3 edge case produces just '...'", () => {
    // A line longer than 3: slice(0, 0) + "..." = "..."
    const result = truncateLine("abcdef", 3);
    expect(result).toBe("...");
    expect(result.length).toBe(3);
  });
});
