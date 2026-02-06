/**
 * Pi Mesh - File Reservations
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { MeshState, Dirs } from "./types.js";
import * as registry from "./registry.js";
import { logEvent } from "./feed.js";

// =============================================================================
// Validation
// =============================================================================

const BROAD_PATTERNS = new Set([".", "/", "./", "..", "../", ""]);

export interface ValidationResult {
  valid: boolean;
  warning?: string;
}

/**
 * Validate a reservation pattern. Warns on broad patterns but allows them.
 */
export function validateReservation(pattern: string): ValidationResult {
  if (!pattern || pattern.trim() === "") {
    return { valid: false };
  }

  const stripped = pattern.replace(/\/+$/, "");
  if (BROAD_PATTERNS.has(stripped) || BROAD_PATTERNS.has(pattern)) {
    return {
      valid: true,
      warning: `"${pattern}" is very broad and will block most file operations for other agents.`,
    };
  }

  // Warn on single top-level directory patterns
  const segments = pattern.replace(/\/+$/, "").split("/").filter(Boolean);
  if (segments.length === 1 && pattern.endsWith("/")) {
    return {
      valid: true,
      warning: `"${pattern}" covers an entire top-level directory. Consider reserving a more specific path.`,
    };
  }

  return { valid: true };
}

// =============================================================================
// Operations
// =============================================================================

export function addReservation(
  state: MeshState,
  dirs: Dirs,
  ctx: ExtensionContext,
  pattern: string,
  reason?: string
): ValidationResult {
  const validation = validateReservation(pattern);
  if (!validation.valid) return validation;

  const now = new Date().toISOString();

  // Remove existing reservation for same pattern (update)
  state.reservations = state.reservations.filter((r) => r.pattern !== pattern);
  state.reservations.push({ pattern, reason, since: now });

  registry.updateRegistration(state, dirs, ctx);
  logEvent(dirs, state.agentName, "reserve", pattern, reason);

  return validation;
}

export function removeReservation(
  state: MeshState,
  dirs: Dirs,
  ctx: ExtensionContext,
  pattern: string
): boolean {
  const before = state.reservations.length;
  state.reservations = state.reservations.filter((r) => r.pattern !== pattern);

  if (state.reservations.length < before) {
    registry.updateRegistration(state, dirs, ctx);
    logEvent(dirs, state.agentName, "release", pattern);
    return true;
  }
  return false;
}

export function removeAllReservations(
  state: MeshState,
  dirs: Dirs,
  ctx: ExtensionContext
): string[] {
  const released = state.reservations.map((r) => r.pattern);
  state.reservations = [];
  registry.updateRegistration(state, dirs, ctx);
  for (const pattern of released) {
    logEvent(dirs, state.agentName, "release", pattern);
  }
  return released;
}
