/**
 * Pi Mesh - Messaging
 *
 * File-based inbox with fs.watch for delivery.
 */

import * as fs from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type {
  MeshState,
  Dirs,
  MeshMessage,
} from "./types.js";
import * as registry from "./registry.js";

// =============================================================================
// Guard against concurrent processing
// =============================================================================

let isProcessingMessages = false;
let pendingProcessArgs: {
  state: MeshState;
  dirs: Dirs;
  deliverFn: (msg: MeshMessage) => void;
} | null = null;

// =============================================================================
// Send
// =============================================================================

function ensureDirSync(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Validate that a recipient exists and is alive.
 */
export function validateRecipient(
  name: string,
  dirs: Dirs
): { valid: boolean; error?: string } {
  const regPath = join(dirs.registry, `${name}.json`);
  if (!fs.existsSync(regPath)) return { valid: false, error: "not_found" };

  try {
    const reg = JSON.parse(fs.readFileSync(regPath, "utf-8"));
    if (!registry.isProcessAlive(reg.pid)) {
      try {
        fs.unlinkSync(regPath);
      } catch {
        // Ignore
      }
      return { valid: false, error: "not_active" };
    }
  } catch {
    return { valid: false, error: "invalid_registration" };
  }

  return { valid: true };
}

/**
 * Send a message to a specific agent.
 */
export function sendMessage(
  state: MeshState,
  dirs: Dirs,
  to: string,
  text: string,
  urgent: boolean = false,
  replyTo?: string
): MeshMessage {
  const targetInbox = join(dirs.inbox, to);
  ensureDirSync(targetInbox);

  const msg: MeshMessage = {
    id: randomUUID(),
    from: state.agentName,
    to,
    text,
    timestamp: new Date().toISOString(),
    urgent,
    replyTo: replyTo ?? null,
  };

  const random = Math.random().toString(36).substring(2, 8);
  const msgFile = join(targetInbox, `${Date.now()}-${random}.json`);
  try {
    fs.writeFileSync(msgFile, JSON.stringify(msg, null, 2));
  } catch (err) {
    throw new Error(`Failed to write message to ${to}: ${(err as Error).message}`);
  }

  return msg;
}

/**
 * Broadcast a message to all active agents.
 */
export function broadcastMessage(
  state: MeshState,
  dirs: Dirs,
  text: string,
  urgent: boolean = false
): MeshMessage[] {
  const agents = registry.getActiveAgents(state, dirs);
  const messages: MeshMessage[] = [];

  for (const agent of agents) {
    messages.push(sendMessage(state, dirs, agent.name, text, urgent));
  }

  return messages;
}

// =============================================================================
// Receive
// =============================================================================

/**
 * Process all pending messages in inbox.
 */
export function processInbox(
  state: MeshState,
  dirs: Dirs,
  deliverFn: (msg: MeshMessage) => void
): void {
  if (!state.registered) return;

  // Guard against concurrent processing
  if (isProcessingMessages) {
    pendingProcessArgs = { state, dirs, deliverFn };
    return;
  }

  isProcessingMessages = true;

  try {
    const inbox = join(dirs.inbox, state.agentName);
    if (!fs.existsSync(inbox)) return;

    let files: string[];
    try {
      files = fs
        .readdirSync(inbox)
        .filter((f) => f.endsWith(".json"))
        .sort();
    } catch {
      return;
    }

    for (const file of files) {
      const msgPath = join(inbox, file);
      try {
        const content = fs.readFileSync(msgPath, "utf-8");
        const msg: MeshMessage = JSON.parse(content);

        // Store in chat history
        let history = state.chatHistory.get(msg.from);
        if (!history) {
          history = [];
          state.chatHistory.set(msg.from, history);
        }
        history.push(msg);
        if (history.length > 50) history.shift();

        // Track unread
        const current = state.unreadCounts.get(msg.from) ?? 0;
        state.unreadCounts.set(msg.from, current + 1);

        // Deliver
        deliverFn(msg);
        fs.unlinkSync(msgPath);
      } catch {
        // Delete malformed to avoid infinite retry
        try {
          fs.unlinkSync(msgPath);
        } catch {
          // Ignore
        }
      }
    }
  } finally {
    isProcessingMessages = false;

    // Re-process if new calls came in
    if (pendingProcessArgs) {
      const args = pendingProcessArgs;
      pendingProcessArgs = null;
      processInbox(args.state, args.dirs, args.deliverFn);
    }
  }
}

// =============================================================================
// Watcher
// =============================================================================

/**
 * Start fs.watch on inbox directory for message delivery.
 */
export function startWatcher(
  state: MeshState,
  dirs: Dirs,
  deliverFn: (msg: MeshMessage) => void
): void {
  if (!state.registered) return;
  if (state.watcher) return;
  if (state.watcherRetries >= 5) return;

  const inbox = join(dirs.inbox, state.agentName);
  ensureDirSync(inbox);

  // Process any pending messages first
  processInbox(state, dirs, deliverFn);

  function scheduleRetry(): void {
    state.watcherRetries++;
    if (state.watcherRetries < 5) {
      const delay = Math.min(
        1000 * Math.pow(2, state.watcherRetries - 1),
        30000
      );
      state.watcherRetryTimer = setTimeout(() => {
        state.watcherRetryTimer = null;
        startWatcher(state, dirs, deliverFn);
      }, delay);
    }
  }

  try {
    state.watcher = fs.watch(inbox, () => {
      // Debounce rapid events
      if (state.watcherDebounceTimer) {
        clearTimeout(state.watcherDebounceTimer);
      }
      state.watcherDebounceTimer = setTimeout(() => {
        state.watcherDebounceTimer = null;
        processInbox(state, dirs, deliverFn);
      }, 50);
    });
  } catch {
    scheduleRetry();
    return;
  }

  state.watcher.on("error", () => {
    stopWatcher(state);
    scheduleRetry();
  });

  state.watcherRetries = 0;
}

/**
 * Stop the inbox watcher.
 */
export function stopWatcher(state: MeshState): void {
  if (state.watcherDebounceTimer) {
    clearTimeout(state.watcherDebounceTimer);
    state.watcherDebounceTimer = null;
  }
  if (state.watcherRetryTimer) {
    clearTimeout(state.watcherRetryTimer);
    state.watcherRetryTimer = null;
  }
  if (state.watcher) {
    state.watcher.close();
    state.watcher = null;
  }
}

/**
 * Recover watcher if it died (e.g., after session fork).
 */
export function recoverWatcherIfNeeded(
  state: MeshState,
  dirs: Dirs,
  deliverFn: (msg: MeshMessage) => void
): void {
  if (state.registered && !state.watcher && !state.watcherRetryTimer) {
    state.watcherRetries = 0;
    startWatcher(state, dirs, deliverFn);
  }
}
