/**
 * Pi Mesh - Activity Feed
 *
 * Append-only JSONL feed stored at .pi/mesh/feed.jsonl
 */

import * as fs from "node:fs";
import { join } from "node:path";
import type { Dirs, FeedEvent, FeedEventType } from "./types.js";

function feedPath(dirs: Dirs): string {
  return join(dirs.base, "feed.jsonl");
}

/**
 * Append an event to the feed.
 */
export function appendEvent(dirs: Dirs, event: FeedEvent): void {
  const p = feedPath(dirs);
  try {
    if (!fs.existsSync(dirs.base)) {
      fs.mkdirSync(dirs.base, { recursive: true });
    }
    fs.appendFileSync(p, JSON.stringify(event) + "\n");
  } catch {
    // Best effort
  }
}

/**
 * Read the last N events from the feed.
 */
export function readEvents(dirs: Dirs, limit: number = 20): FeedEvent[] {
  const p = feedPath(dirs);
  if (!fs.existsSync(p)) return [];

  try {
    const content = fs.readFileSync(p, "utf-8").trim();
    if (!content) return [];
    const lines = content.split("\n");
    const events: FeedEvent[] = [];
    for (const line of lines) {
      try {
        events.push(JSON.parse(line));
      } catch {
        // Skip malformed lines (concurrent write corruption)
      }
    }
    return events.slice(-limit);
  } catch {
    return [];
  }
}

/**
 * Prune feed to keep only the last maxEvents entries.
 */
export function pruneFeed(dirs: Dirs, maxEvents: number): void {
  const p = feedPath(dirs);
  if (!fs.existsSync(p)) return;

  try {
    const content = fs.readFileSync(p, "utf-8").trim();
    if (!content) return;
    const lines = content.split("\n");
    if (lines.length <= maxEvents) return;
    const pruned = lines.slice(-maxEvents);
    fs.writeFileSync(p, pruned.join("\n") + "\n");
  } catch {
    // Best effort
  }
}

/**
 * Format a feed event as a human-readable line.
 */
export function formatEvent(event: FeedEvent): string {
  const time = new Date(event.ts).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  let line = `${time} ${event.agent}`;
  switch (event.type) {
    case "join": line += " joined"; break;
    case "leave": line += " left"; break;
    case "reserve": line += ` reserved ${event.target ?? ""}`; break;
    case "release": line += ` released ${event.target ?? ""}`; break;
    case "message": line += ` ${event.preview ?? ""}`; break;
    case "commit": line += ` committed "${event.preview ?? ""}"`; break;
    case "test": line += ` ran tests (${event.preview ?? ""})`; break;
    case "edit": line += ` editing ${event.target ?? ""}`; break;
    case "stuck": line += " appears stuck"; break;
    default: line += ` ${event.type}`; break;
  }
  return line;
}

/**
 * Log a feed event (convenience wrapper).
 */
export function logEvent(
  dirs: Dirs,
  agent: string,
  type: FeedEventType,
  target?: string,
  preview?: string
): void {
  appendEvent(dirs, {
    ts: new Date().toISOString(),
    agent,
    type,
    target,
    preview,
  });
}
