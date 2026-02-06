/**
 * Tests for reservation validation and path matching.
 */

import { describe, it, expect } from "bun:test";
import { validateReservation } from "../reservations.js";
import { pathMatchesReservation } from "../registry.js";

describe("validateReservation", () => {
  it("accepts normal file paths", () => {
    expect(validateReservation("src/auth/login.ts").valid).toBe(true);
    expect(validateReservation("src/auth/login.ts").warning).toBeUndefined();
  });

  it("accepts normal directory paths", () => {
    expect(validateReservation("src/auth/").valid).toBe(true);
    expect(validateReservation("src/auth/").warning).toBeUndefined();
  });

  it("accepts single files", () => {
    expect(validateReservation("package.json").valid).toBe(true);
    expect(validateReservation("package.json").warning).toBeUndefined();
  });

  it("warns on degenerate patterns", () => {
    expect(validateReservation(".").warning).toBeTruthy();
    expect(validateReservation("/").warning).toBeTruthy();
    expect(validateReservation("./").warning).toBeTruthy();
  });

  it("warns on broad single-segment directory patterns", () => {
    const result = validateReservation("src/");
    expect(result.valid).toBe(true);
    expect(result.warning).toBeTruthy();
  });

  it("does not warn on deep directory patterns", () => {
    expect(validateReservation("src/auth/").warning).toBeUndefined();
  });

  it("rejects empty patterns", () => {
    expect(validateReservation("").valid).toBe(false);
    expect(validateReservation("  ").valid).toBe(false);
  });
});

describe("pathMatchesReservation", () => {
  it("matches exact file path", () => {
    expect(pathMatchesReservation("src/auth/login.ts", "src/auth/login.ts")).toBe(true);
  });

  it("does not match different file", () => {
    expect(pathMatchesReservation("src/auth/signup.ts", "src/auth/login.ts")).toBe(false);
  });

  it("matches directory prefix", () => {
    expect(pathMatchesReservation("src/auth/login.ts", "src/auth/")).toBe(true);
    expect(pathMatchesReservation("src/auth/utils/hash.ts", "src/auth/")).toBe(true);
  });

  it("does not match partial directory names", () => {
    expect(pathMatchesReservation("src/authorization/login.ts", "src/auth/")).toBe(false);
  });

  it("matches directory itself", () => {
    expect(pathMatchesReservation("src/auth", "src/auth/")).toBe(true);
  });

  it("handles root-level files", () => {
    expect(pathMatchesReservation("package.json", "package.json")).toBe(true);
    expect(pathMatchesReservation("package-lock.json", "package.json")).toBe(false);
  });

  it("normalizes paths with ./ prefix", () => {
    expect(pathMatchesReservation("./src/auth/login.ts", "src/auth/")).toBe(true);
    expect(pathMatchesReservation("src/auth/login.ts", "./src/auth/")).toBe(true);
  });

  it("normalizes paths with ../ segments", () => {
    expect(pathMatchesReservation("src/../src/auth/login.ts", "src/auth/")).toBe(true);
  });
});
