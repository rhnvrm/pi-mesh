/**
 * Pi Mesh - Activity Tracking
 *
 * Hooks into tool_call/tool_result to track what agents are doing.
 */

import type { MeshState, Dirs } from "./types.js";
import { EDIT_DEBOUNCE_MS, RECENT_WINDOW_MS } from "./types.js";
import { logEvent } from "./feed.js";

// =============================================================================
// Debounce State
// =============================================================================

const pendingEdits = new Map<string, ReturnType<typeof setTimeout>>();
let recentCommit = false;
let recentCommitTimer: ReturnType<typeof setTimeout> | null = null;
let recentTestRuns = 0;
let recentTestTimer: ReturnType<typeof setTimeout> | null = null;
let recentEdits = 0;
let recentEditTimer: ReturnType<typeof setTimeout> | null = null;

// =============================================================================
// Command Detection
// =============================================================================

export function isGitCommit(command: string): boolean {
  return /\bgit\s+commit\b/.test(command);
}

export function isTestRun(command: string): boolean {
  return /\b(npm\s+test|npx\s+(jest|vitest|mocha)|pytest|go\s+test|cargo\s+test|bun\s+test)\b/.test(
    command
  );
}

export function extractCommitMessage(command: string): string {
  const match = command.match(/-m\s+["']([^"']+)["']/);
  return match ? match[1] : "";
}

export function shortenPath(filePath: string): string {
  const parts = filePath.split("/");
  return parts.length > 2 ? parts.slice(-2).join("/") : filePath;
}

// =============================================================================
// Activity Updates
// =============================================================================

export function onToolCall(
  toolName: string,
  input: Record<string, unknown>,
  state: MeshState,
  dirs: Dirs
): void {
  if (!state.registered) return;

  state.activity.lastActivityAt = new Date().toISOString();
  state.session.toolCalls++;

  if (toolName === "write" || toolName === "edit") {
    const path = input.path as string;
    if (path) {
      state.activity.currentActivity = `editing ${shortenPath(path)}`;
      debouncedLogEdit(path, state, dirs);
      trackRecentEdit();
    }
  } else if (toolName === "read") {
    const path = input.path as string;
    if (path) {
      state.activity.currentActivity = `reading ${shortenPath(path)}`;
    }
  } else if (toolName === "bash") {
    const command = input.command as string;
    if (command) {
      if (isGitCommit(command)) {
        state.activity.currentActivity = "committing";
      } else if (isTestRun(command)) {
        state.activity.currentActivity = "running tests";
      }
    }
  }

  updateAutoStatus(state);
}

export function onToolResult(
  toolName: string,
  input: Record<string, unknown>,
  isError: boolean,
  state: MeshState,
  dirs: Dirs
): void {
  if (!state.registered) return;

  if (toolName === "write" || toolName === "edit") {
    const path = input.path as string;
    if (path) {
      state.activity.lastToolCall = `${toolName}: ${shortenPath(path)}`;
      addModifiedFile(path, state);
    }
  }

  if (toolName === "bash") {
    const command = input.command as string;
    if (command) {
      if (isGitCommit(command)) {
        const msg = extractCommitMessage(command);
        logEvent(dirs, state.agentName, "commit", undefined, msg);
        state.activity.lastToolCall = `commit: ${msg}`;
        trackRecentCommit();
      }
      if (isTestRun(command)) {
        const passed = !isError;
        logEvent(
          dirs,
          state.agentName,
          "test",
          undefined,
          passed ? "passed" : "failed"
        );
        state.activity.lastToolCall = `test: ${passed ? "passed" : "failed"}`;
        trackRecentTest();
      }
    }
  }

  state.activity.currentActivity = undefined;
  updateAutoStatus(state);
}

// =============================================================================
// Auto Status
// =============================================================================

export function generateAutoStatus(state: MeshState): string | undefined {
  const sessionAge =
    Date.now() - new Date(state.sessionStartedAt).getTime();

  if (sessionAge < 30_000) return "just arrived";
  if (recentCommit) return "just shipped";
  if (recentTestRuns >= 3) return "debugging...";
  if (recentEdits >= 8) return "on fire";
  if (state.activity.currentActivity?.startsWith("reading"))
    return "exploring the codebase";
  if (state.activity.currentActivity?.startsWith("editing"))
    return "deep in thought";

  return undefined;
}

function updateAutoStatus(state: MeshState): void {
  if (!state.registered || state.customStatus) return;
  state.statusMessage = generateAutoStatus(state);
}

// =============================================================================
// Helpers
// =============================================================================

function addModifiedFile(filePath: string, state: MeshState): void {
  const files = state.session.filesModified;
  const idx = files.indexOf(filePath);
  if (idx !== -1) files.splice(idx, 1);
  files.push(filePath);
  if (files.length > 20) files.shift();
}

function debouncedLogEdit(
  filePath: string,
  state: MeshState,
  dirs: Dirs
): void {
  const existing = pendingEdits.get(filePath);
  if (existing) clearTimeout(existing);
  pendingEdits.set(
    filePath,
    setTimeout(() => {
      logEvent(dirs, state.agentName, "edit", filePath);
      pendingEdits.delete(filePath);
    }, EDIT_DEBOUNCE_MS)
  );
}

function trackRecentCommit(): void {
  recentCommit = true;
  if (recentCommitTimer) clearTimeout(recentCommitTimer);
  recentCommitTimer = setTimeout(() => {
    recentCommit = false;
  }, RECENT_WINDOW_MS);
}

function trackRecentTest(): void {
  recentTestRuns++;
  if (recentTestTimer) clearTimeout(recentTestTimer);
  recentTestTimer = setTimeout(() => {
    recentTestRuns = 0;
  }, RECENT_WINDOW_MS);
}

function trackRecentEdit(): void {
  recentEdits++;
  if (recentEditTimer) clearTimeout(recentEditTimer);
  recentEditTimer = setTimeout(() => {
    recentEdits = 0;
  }, RECENT_WINDOW_MS);
}

/**
 * Cleanup all timers (call on shutdown).
 */
export function cleanup(): void {
  for (const timer of pendingEdits.values()) clearTimeout(timer);
  pendingEdits.clear();
  if (recentCommitTimer) {
    clearTimeout(recentCommitTimer);
    recentCommitTimer = null;
  }
  if (recentTestTimer) {
    clearTimeout(recentTestTimer);
    recentTestTimer = null;
  }
  if (recentEditTimer) {
    clearTimeout(recentEditTimer);
    recentEditTimer = null;
  }
}
