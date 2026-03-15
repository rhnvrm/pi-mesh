/**
 * Pi Mesh - Types
 */

import type * as fs from "node:fs";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { RenameResult } from "./registry.js";

// =============================================================================
// Configuration
// =============================================================================

export interface MeshConfig {
  autoRegister: boolean;
  autoRegisterPaths: string[];
  contextMode: "full" | "minimal" | "none";
  feedRetention: number;
  stuckThreshold: number;
  autoStatus: boolean;
  hooksModule?: string;
}

// =============================================================================
// Agent Registration
// =============================================================================

export interface FileReservation {
  pattern: string;
  reason?: string;
  since: string;
}

export interface AgentSession {
  toolCalls: number;
  tokens: number;
  filesModified: string[];
}

export interface AgentActivity {
  lastActivityAt: string;
  currentActivity?: string;
  lastToolCall?: string;
}

export interface AgentRegistration {
  name: string;
  agentType: string;
  pid: number;
  sessionId: string;
  cwd: string;
  model: string;
  startedAt: string;
  reservations?: FileReservation[];
  gitBranch?: string;
  isHuman: boolean;
  session: AgentSession;
  activity: AgentActivity;
  statusMessage?: string;
}

// =============================================================================
// Messaging
// =============================================================================

export interface MeshMessage {
  id: string;
  from: string;
  to: string;
  text: string;
  timestamp: string;
  urgent: boolean;
  replyTo: string | null;
}

// =============================================================================
// Activity Feed
// =============================================================================

export type FeedEventType =
  | "join"
  | "leave"
  | "reserve"
  | "release"
  | "message"
  | "commit"
  | "test"
  | "edit"
  | "stuck";

export interface FeedEvent {
  ts: string;
  agent: string;
  type: FeedEventType;
  target?: string;
  preview?: string;
}

// =============================================================================
// State
// =============================================================================

export type AgentStatus = "active" | "idle" | "away" | "stuck";

export interface ComputedStatus {
  status: AgentStatus;
  idleFor?: string;
}

export interface Dirs {
  base: string;
  registry: string;
  inbox: string;
}

export interface MeshState {
  agentName: string;
  agentType: string;
  registered: boolean;
  watcher: fs.FSWatcher | null;
  watcherRetries: number;
  watcherRetryTimer: ReturnType<typeof setTimeout> | null;
  watcherDebounceTimer: ReturnType<typeof setTimeout> | null;
  reservations: FileReservation[];
  chatHistory: Map<string, MeshMessage[]>;
  unreadCounts: Map<string, number>;
  broadcastHistory: MeshMessage[];
  model: string;
  gitBranch?: string;
  isHuman: boolean;
  session: AgentSession;
  activity: AgentActivity;
  statusMessage?: string;
  customStatus: boolean;
  registryFlushTimer: ReturnType<typeof setTimeout> | null;
  sessionStartedAt: string;

  // Lifecycle hook state — managed by hook implementations, opaque to pi-mesh core.
  hookState?: Record<string, unknown>;
}

// =============================================================================
// Lifecycle Hooks
// =============================================================================

/**
 * Actions available to hooks for triggering mesh operations.
 *
 * Hooks observe mesh events, but sometimes need to act — e.g., a poll tick
 * that detects an external tmux rename needs to push that rename into the
 * mesh registry. HookActions provides a safe way to do this without hooks
 * reaching into pi-mesh internals (watcher stop/start, registry writes, etc.).
 */
export interface HookActions {
  /** Rename this agent in the mesh. Handles watcher cycling and registry update. */
  rename(newName: string): Promise<RenameResult>;
}

/**
 * Lifecycle hooks that external code can implement to react to mesh events.
 *
 * Loaded from a module path specified in pi-mesh.json via `hooksModule`.
 * The module should export a `createHooks` function that returns this interface.
 */
export interface MeshLifecycleHooks {
  /** Called after successful registration. state.agentName is set. */
  onRegistered?(state: MeshState, ctx: ExtensionContext, actions: HookActions): void | Promise<void>;

  /** Called after a successful rename via mesh_manage or programmatic rename. */
  onRenamed?(state: MeshState, ctx: ExtensionContext, result: RenameResult): void | Promise<void>;

  /** Called on a configurable interval while registered. */
  onPollTick?(state: MeshState, ctx: ExtensionContext, actions: HookActions): void | Promise<void>;

  /**
   * Called during session shutdown, before unregister.
   * Does not receive ctx or actions to avoid async shutdown complexity — use
   * onRegistered or onPollTick for ctx-dependent work, and clean up
   * synchronously here.
   */
  onShutdown?(state: MeshState): void;
}

export type CreateHooksFn = (config: MeshConfig) => MeshLifecycleHooks;

// =============================================================================
// Reservation Conflicts
// =============================================================================

export interface ReservationConflict {
  path: string;
  agent: string;
  pattern: string;
  reason?: string;
  registration: AgentRegistration;
}

// =============================================================================
// Constants
// =============================================================================

export const MAX_WATCHER_RETRIES = 5;
export const MAX_CHAT_HISTORY = 50;
export const WATCHER_DEBOUNCE_MS = 50;
export const REGISTRY_FLUSH_MS = 10000;
export const AGENTS_CACHE_TTL_MS = 1000;
export const EDIT_DEBOUNCE_MS = 5000;
export const RECENT_WINDOW_MS = 60_000;

// =============================================================================
// Status Indicators
// =============================================================================

export const STATUS_INDICATORS: Record<AgentStatus, string> = {
  active: "●",
  idle: "○",
  away: "◌",
  stuck: "✕",
};
