/**
 * Tests for config loading and path matching.
 */

import { describe, it, expect } from "bun:test";
import { matchesAutoRegisterPath } from "../config.js";

describe("matchesAutoRegisterPath", () => {
  it("matches exact path", () => {
    expect(matchesAutoRegisterPath("/home/user/project", ["/home/user/project"])).toBe(true);
  });

  it("does not match different path", () => {
    expect(matchesAutoRegisterPath("/home/user/other", ["/home/user/project"])).toBe(false);
  });

  it("matches wildcard suffix", () => {
    expect(matchesAutoRegisterPath("/home/user/projects/foo", ["/home/user/projects/*"])).toBe(true);
    expect(matchesAutoRegisterPath("/home/user/projects/foo/bar", ["/home/user/projects/*"])).toBe(true);
  });

  it("matches prefix glob", () => {
    expect(matchesAutoRegisterPath("/home/user/project-a", ["/home/user/project*"])).toBe(true);
    expect(matchesAutoRegisterPath("/home/user/project-b", ["/home/user/project*"])).toBe(true);
  });

  it("strips trailing slashes", () => {
    expect(matchesAutoRegisterPath("/home/user/project/", ["/home/user/project"])).toBe(true);
    expect(matchesAutoRegisterPath("/home/user/project", ["/home/user/project/"])).toBe(true);
  });

  it("returns false for empty paths", () => {
    expect(matchesAutoRegisterPath("/home/user/project", [])).toBe(false);
  });

  it("matches any of multiple paths", () => {
    expect(matchesAutoRegisterPath("/a", ["/b", "/a", "/c"])).toBe(true);
    expect(matchesAutoRegisterPath("/d", ["/a", "/b", "/c"])).toBe(false);
  });
});
