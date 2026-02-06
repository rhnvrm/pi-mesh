/**
 * Tests for activity tracking utilities.
 */

import { describe, it, expect } from "bun:test";
import {
  isGitCommit,
  isTestRun,
  extractCommitMessage,
  shortenPath,
} from "../tracking.js";

describe("isGitCommit", () => {
  it("detects git commit", () => {
    expect(isGitCommit('git commit -m "feat: add auth"')).toBe(true);
    expect(isGitCommit("git commit --amend")).toBe(true);
  });

  it("does not match non-commit git commands", () => {
    expect(isGitCommit("git status")).toBe(false);
    expect(isGitCommit("git push")).toBe(false);
    expect(isGitCommit("git log --oneline")).toBe(false);
  });
});

describe("isTestRun", () => {
  it("detects various test runners", () => {
    expect(isTestRun("npm test")).toBe(true);
    expect(isTestRun("npx jest")).toBe(true);
    expect(isTestRun("npx vitest")).toBe(true);
    expect(isTestRun("go test ./...")).toBe(true);
    expect(isTestRun("cargo test")).toBe(true);
    expect(isTestRun("bun test")).toBe(true);
    expect(isTestRun("pytest")).toBe(true);
  });

  it("does not match non-test commands", () => {
    expect(isTestRun("npm install")).toBe(false);
    expect(isTestRun("go build")).toBe(false);
    expect(isTestRun("echo test")).toBe(false);
  });
});

describe("extractCommitMessage", () => {
  it("extracts double-quoted message", () => {
    expect(extractCommitMessage('git commit -m "feat: add auth"')).toBe(
      "feat: add auth"
    );
  });

  it("extracts single-quoted message", () => {
    expect(extractCommitMessage("git commit -m 'fix: typo'")).toBe("fix: typo");
  });

  it("returns empty for no message", () => {
    expect(extractCommitMessage("git commit --amend")).toBe("");
  });
});

describe("shortenPath", () => {
  it("shortens deep paths", () => {
    expect(shortenPath("src/auth/utils/hash.ts")).toBe("utils/hash.ts");
  });

  it("keeps short paths as-is", () => {
    expect(shortenPath("src/index.ts")).toBe("src/index.ts");
    expect(shortenPath("package.json")).toBe("package.json");
  });
});
