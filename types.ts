/**
 * Pi Mesh - Types
 */

import type * as fs from "node:fs";

// =============================================================================
// Configuration
// =============================================================================

export interface MeshConfig {
  autoRegister: boolean;
  autoRegisterPaths: string[];
  contextMode: "full" | "minimal" | "none";
  feedRetention: number;
  stuckThreshold: number;
  stuckNotify: boolean;
  autoStatus: boolean;
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
}

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
