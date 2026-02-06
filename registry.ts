/**
 * Pi Mesh - Agent Registry
 *
 * File-based agent registration with PID liveness checking.
 */

import * as fs from "node:fs";
import { join, basename } from "node:path";
import { execSync } from "node:child_process";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type {
  AgentRegistration,
  MeshState,
  Dirs,
  ReservationConflict,
} from "./types.js";
import { findPiDir } from "./config.js";

// =============================================================================
// Cache
// =============================================================================

interface AgentsCache {
  agents: AgentRegistration[];
  timestamp: number;
}

let agentsCache: AgentsCache | null = null;

export function invalidateAgentsCache(): void {
  agentsCache = null;
}

// =============================================================================
// Filesystem Helpers
// =============================================================================

function ensureDirSync(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getGitBranch(cwd: string): string | undefined {
  try {
    const result = execSync("git branch --show-current", {
      cwd,
      encoding: "utf-8",
      timeout: 2000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (result) return result;

    const sha = execSync("git rev-parse --short HEAD", {
      cwd,
      encoding: "utf-8",
      timeout: 2000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return sha ? `@${sha}` : undefined;
  } catch {
    return undefined;
  }
}

// =============================================================================
// Directory Resolution
// =============================================================================

/**
 * Find or create the mesh data directory.
 * Walks up to find .pi/, creates .pi/mesh/ there.
 * Overridable via PI_MESH_DIR env var.
 */
export function resolveDirs(cwd: string): Dirs {
  const envDir = process.env.PI_MESH_DIR;
  if (envDir) {
    const base = envDir;
    return { base, registry: join(base, "registry"), inbox: join(base, "inbox") };
  }

  const piDir = findPiDir(cwd);
  const base = piDir ? join(piDir, "mesh") : join(cwd, ".pi", "mesh");
  return { base, registry: join(base, "registry"), inbox: join(base, "inbox") };
}

export function ensureDataDirs(dirs: Dirs): void {
  ensureDirSync(dirs.registry);
  ensureDirSync(dirs.inbox);
}

// =============================================================================
// Name Generation
// =============================================================================

/**
 * Generate a unique agent name.
 * Format: {agentType}-{N} where N is sequential.
 * Respects PI_AGENT_NAME env var for explicit naming.
 */
export function generateName(agentType: string, dirs: Dirs): string {
  // Explicit name override
  const explicitName = process.env.PI_AGENT_NAME;
  if (explicitName) return explicitName;

  // Sequential naming: find next available number
  if (!fs.existsSync(dirs.registry)) return `${agentType}-1`;

  const existing = new Set<string>();
  try {
    for (const file of fs.readdirSync(dirs.registry)) {
      if (file.endsWith(".json")) {
        existing.add(file.replace(".json", ""));
      }
    }
  } catch {
    return `${agentType}-1`;
  }

  for (let i = 1; i <= 99; i++) {
    const name = `${agentType}-${i}`;
    if (!existing.has(name)) return name;

    // Check if the existing registration is stale
    try {
      const reg: AgentRegistration = JSON.parse(
        fs.readFileSync(join(dirs.registry, `${name}.json`), "utf-8")
      );
      if (!isProcessAlive(reg.pid)) return name;
    } catch {
      return name;
    }
  }

  // Fallback: use PID
  return `${agentType}-${process.pid}`;
}

function isValidAgentName(name: string): boolean {
  if (!name || name.length > 50) return false;
  return /^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/.test(name);
}

// =============================================================================
// Registration
// =============================================================================

export function getRegistrationPath(state: MeshState, dirs: Dirs): string {
  return join(dirs.registry, `${state.agentName}.json`);
}

export function register(
  state: MeshState,
  dirs: Dirs,
  ctx: ExtensionContext
): boolean {
  if (state.registered) return true;

  ensureDataDirs(dirs);

  const name = generateName(state.agentType, dirs);
  if (!isValidAgentName(name)) return false;

  state.agentName = name;

  // Check for collision with live agent
  const regPath = join(dirs.registry, `${name}.json`);
  if (fs.existsSync(regPath)) {
    try {
      const existing: AgentRegistration = JSON.parse(
        fs.readFileSync(regPath, "utf-8")
      );
      if (isProcessAlive(existing.pid) && existing.pid !== process.pid) {
        // Name taken by live agent - shouldn't happen with sequential naming
        // but handle gracefully
        return false;
      }
    } catch {
      // Malformed, overwrite
    }
  }

  // Create inbox directory
  ensureDirSync(join(dirs.inbox, name));

  const gitBranch = getGitBranch(process.cwd());
  const now = new Date().toISOString();

  const registration: AgentRegistration = {
    name,
    agentType: state.agentType,
    pid: process.pid,
    sessionId: ctx.sessionManager.getSessionId(),
    cwd: process.cwd(),
    model: ctx.model?.id ?? "unknown",
    startedAt: now,
    gitBranch,
    isHuman: state.isHuman,
    session: { ...state.session },
    activity: { lastActivityAt: now },
  };

  try {
    fs.writeFileSync(regPath, JSON.stringify(registration, null, 2));
  } catch {
    return false;
  }

  // Verify write
  try {
    const written: AgentRegistration = JSON.parse(
      fs.readFileSync(regPath, "utf-8")
    );
    if (written.pid !== process.pid) return false;
  } catch {
    return false;
  }

  state.registered = true;
  state.model = ctx.model?.id ?? "unknown";
  state.gitBranch = gitBranch;
  state.activity.lastActivityAt = now;
  invalidateAgentsCache();
  return true;
}

export function unregister(state: MeshState, dirs: Dirs): void {
  if (!state.registered) return;

  try {
    fs.unlinkSync(getRegistrationPath(state, dirs));
  } catch {
    // Ignore
  }
  state.registered = false;
  invalidateAgentsCache();
}

// =============================================================================
// Query
// =============================================================================

/**
 * Get all active agents (excluding self). Cached with TTL.
 */
export function getActiveAgents(
  state: MeshState,
  dirs: Dirs,
  cacheTtl: number = 1000
): AgentRegistration[] {
  const now = Date.now();

  if (agentsCache && now - agentsCache.timestamp < cacheTtl) {
    return agentsCache.agents.filter((a) => a.name !== state.agentName);
  }

  const allAgents: AgentRegistration[] = [];

  if (!fs.existsSync(dirs.registry)) {
    agentsCache = { agents: allAgents, timestamp: now };
    return allAgents;
  }

  let files: string[];
  try {
    files = fs.readdirSync(dirs.registry);
  } catch {
    return allAgents;
  }

  for (const file of files) {
    if (!file.endsWith(".json")) continue;

    try {
      const content = fs.readFileSync(join(dirs.registry, file), "utf-8");
      const reg: AgentRegistration = JSON.parse(content);

      if (!isProcessAlive(reg.pid)) {
        // Clean up stale registration
        try {
          fs.unlinkSync(join(dirs.registry, file));
        } catch {
          // Ignore
        }
        continue;
      }

      // Ensure default fields
      if (!reg.session) reg.session = { toolCalls: 0, tokens: 0, filesModified: [] };
      if (!reg.activity) reg.activity = { lastActivityAt: reg.startedAt };

      allAgents.push(reg);
    } catch {
      // Skip malformed
    }
  }

  agentsCache = { agents: allAgents, timestamp: now };
  return allAgents.filter((a) => a.name !== state.agentName);
}

/**
 * Get all agents including self.
 */
export function getAllAgents(state: MeshState, dirs: Dirs): AgentRegistration[] {
  const peers = getActiveAgents(state, dirs);
  // Build self registration
  const self: AgentRegistration = {
    name: state.agentName,
    agentType: state.agentType,
    pid: process.pid,
    sessionId: "",
    cwd: process.cwd(),
    model: state.model,
    startedAt: state.sessionStartedAt,
    gitBranch: state.gitBranch,
    isHuman: state.isHuman,
    session: { ...state.session },
    activity: { ...state.activity },
    reservations: state.reservations.length > 0 ? state.reservations : undefined,
    statusMessage: state.statusMessage,
  };
  return [self, ...peers];
}

// =============================================================================
// Update
// =============================================================================

export function updateRegistration(
  state: MeshState,
  dirs: Dirs,
  ctx: ExtensionContext
): void {
  if (!state.registered) return;

  const regPath = getRegistrationPath(state, dirs);
  if (!fs.existsSync(regPath)) return;

  try {
    const reg: AgentRegistration = JSON.parse(
      fs.readFileSync(regPath, "utf-8")
    );
    reg.model = ctx.model?.id ?? reg.model;
    state.model = reg.model;
    reg.reservations =
      state.reservations.length > 0 ? state.reservations : undefined;
    reg.session = { ...state.session };
    reg.activity = { ...state.activity };
    reg.statusMessage = state.statusMessage;
    fs.writeFileSync(regPath, JSON.stringify(reg, null, 2));
  } catch {
    // Ignore
  }
}

export function flushActivityToRegistry(
  state: MeshState,
  dirs: Dirs,
  ctx: ExtensionContext
): void {
  if (!state.registered) return;

  const regPath = getRegistrationPath(state, dirs);
  if (!fs.existsSync(regPath)) return;

  try {
    const reg: AgentRegistration = JSON.parse(
      fs.readFileSync(regPath, "utf-8")
    );
    reg.model = ctx.model?.id ?? reg.model;
    state.model = reg.model;
    reg.session = { ...state.session };
    reg.activity = { ...state.activity };
    reg.statusMessage = state.statusMessage;
    fs.writeFileSync(regPath, JSON.stringify(reg, null, 2));
  } catch {
    // Ignore
  }
}

// =============================================================================
// Rename
// =============================================================================

export interface RenameResult {
  success: boolean;
  oldName?: string;
  newName?: string;
  error?: string;
}

export function renameAgent(
  state: MeshState,
  dirs: Dirs,
  ctx: ExtensionContext,
  newName: string
): RenameResult {
  if (!state.registered) return { success: false, error: "not_registered" };
  if (!isValidAgentName(newName)) return { success: false, error: "invalid_name" };
  if (newName === state.agentName) return { success: false, error: "same_name" };

  // Check if new name is taken
  const newRegPath = join(dirs.registry, `${newName}.json`);
  if (fs.existsSync(newRegPath)) {
    try {
      const existing: AgentRegistration = JSON.parse(
        fs.readFileSync(newRegPath, "utf-8")
      );
      if (isProcessAlive(existing.pid) && existing.pid !== process.pid) {
        return { success: false, error: "name_taken" };
      }
    } catch {
      // Malformed, overwrite
    }
  }

  const oldName = state.agentName;
  const oldRegPath = getRegistrationPath(state, dirs);

  // Write new registration
  const now = new Date().toISOString();
  const registration: AgentRegistration = {
    name: newName,
    agentType: state.agentType,
    pid: process.pid,
    sessionId: ctx.sessionManager.getSessionId(),
    cwd: process.cwd(),
    model: ctx.model?.id ?? "unknown",
    startedAt: now,
    reservations:
      state.reservations.length > 0 ? state.reservations : undefined,
    gitBranch: state.gitBranch,
    isHuman: state.isHuman,
    session: { ...state.session },
    activity: { lastActivityAt: now },
    statusMessage: state.statusMessage,
  };

  try {
    fs.writeFileSync(newRegPath, JSON.stringify(registration, null, 2));
  } catch {
    return { success: false, error: "write_failed" };
  }

  // Verify
  try {
    const written: AgentRegistration = JSON.parse(
      fs.readFileSync(newRegPath, "utf-8")
    );
    if (written.pid !== process.pid) return { success: false, error: "race_lost" };
  } catch {
    return { success: false, error: "verify_failed" };
  }

  // Clean up old registration
  try {
    fs.unlinkSync(oldRegPath);
  } catch {
    // Ignore
  }

  // Set up new inbox, clean old
  const newInbox = join(dirs.inbox, newName);
  ensureDirSync(newInbox);
  try {
    fs.rmdirSync(join(dirs.inbox, oldName));
  } catch {
    // Ignore
  }

  state.agentName = newName;
  state.sessionStartedAt = now;
  state.activity.lastActivityAt = now;
  invalidateAgentsCache();

  return { success: true, oldName, newName };
}

// =============================================================================
// Reservation Conflicts
// =============================================================================

export function pathMatchesReservation(
  filePath: string,
  pattern: string
): boolean {
  if (pattern.endsWith("/")) {
    return filePath.startsWith(pattern) || filePath + "/" === pattern;
  }
  return filePath === pattern;
}

export function getConflicts(
  filePath: string,
  state: MeshState,
  dirs: Dirs
): ReservationConflict[] {
  const conflicts: ReservationConflict[] = [];
  const agents = getActiveAgents(state, dirs);

  for (const agent of agents) {
    if (!agent.reservations) continue;
    for (const res of agent.reservations) {
      if (pathMatchesReservation(filePath, res.pattern)) {
        conflicts.push({
          path: filePath,
          agent: agent.name,
          pattern: res.pattern,
          reason: res.reason,
          registration: agent,
        });
      }
    }
  }

  return conflicts;
}

// =============================================================================
// Helpers
// =============================================================================

export function extractFolder(cwd: string): string {
  return basename(cwd) || cwd;
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function computeStatus(
  lastActivityAt: string,
  hasReservation: boolean,
  thresholdMs: number
): { status: "active" | "idle" | "away" | "stuck"; idleFor?: string } {
  const elapsed = Date.now() - new Date(lastActivityAt).getTime();
  if (isNaN(elapsed) || elapsed < 0) return { status: "active" };

  const ACTIVE_MS = 30_000;
  const IDLE_MS = 5 * 60_000;

  if (elapsed < ACTIVE_MS) return { status: "active" };
  if (elapsed < IDLE_MS) return { status: "idle", idleFor: formatDuration(elapsed) };
  if (!hasReservation) return { status: "away", idleFor: formatDuration(elapsed) };
  if (elapsed >= thresholdMs) return { status: "stuck", idleFor: formatDuration(elapsed) };
  return { status: "idle", idleFor: formatDuration(elapsed) };
}
