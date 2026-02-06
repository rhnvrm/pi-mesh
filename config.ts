/**
 * Pi Mesh - Configuration
 *
 * Priority (highest to lowest):
 * 1. Project: .pi/pi-mesh.json
 * 2. User: ~/.pi/agent/pi-mesh.json
 * 3. Settings: ~/.pi/agent/settings.json -> "mesh" key
 * 4. Defaults
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import type { MeshConfig } from "./types.js";

const DEFAULT_CONFIG: MeshConfig = {
  autoRegister: false,
  autoRegisterPaths: [],
  contextMode: "full",
  feedRetention: 50,
  stuckThreshold: 900,

  autoStatus: true,
};

function readJsonFile(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function expandHome(p: string): string {
  if (p.startsWith("~/")) {
    return join(homedir(), p.slice(2));
  }
  return p;
}

/**
 * Find the .pi/ directory by walking up from cwd.
 */
export function findPiDir(startDir: string): string | null {
  let dir = startDir;
  while (true) {
    const candidate = join(dir, ".pi");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Check if cwd matches any auto-register path pattern.
 */
export function matchesAutoRegisterPath(cwd: string, paths: string[]): boolean {
  const normalized = cwd.replace(/\/+$/, "");

  for (const pattern of paths) {
    const expanded = expandHome(pattern).replace(/\/+$/, "");

    if (expanded.endsWith("/*")) {
      const base = expanded.slice(0, -2);
      if (normalized === base || normalized.startsWith(base + "/")) return true;
    } else if (expanded.endsWith("*")) {
      const prefix = expanded.slice(0, -1);
      if (normalized.startsWith(prefix)) return true;
    } else {
      if (normalized === expanded) return true;
    }
  }

  return false;
}

/**
 * Load mesh configuration with layered priority.
 */
export function loadConfig(cwd: string): MeshConfig {
  const piDir = findPiDir(cwd);
  const projectPath = piDir ? join(piDir, "pi-mesh.json") : null;
  const userPath = join(homedir(), ".pi", "agent", "pi-mesh.json");
  const settingsPath = join(homedir(), ".pi", "agent", "settings.json");

  // Layer 4: defaults
  let merged: Record<string, unknown> = { ...DEFAULT_CONFIG };

  // Layer 3: settings.json "mesh" key
  const settings = readJsonFile(settingsPath);
  if (settings && typeof settings.mesh === "object" && settings.mesh !== null) {
    merged = { ...merged, ...(settings.mesh as Record<string, unknown>) };
  }

  // Layer 2: user config
  const userConfig = readJsonFile(userPath);
  if (userConfig) {
    merged = { ...merged, ...userConfig };
  }

  // Layer 1: project config (highest priority)
  if (projectPath) {
    const projectConfig = readJsonFile(projectPath);
    if (projectConfig) {
      merged = { ...merged, ...projectConfig };
    }
  }

  return {
    autoRegister: merged.autoRegister === true,
    autoRegisterPaths: Array.isArray(merged.autoRegisterPaths) ? merged.autoRegisterPaths : [],
    contextMode: validateContextMode(merged.contextMode),
    feedRetention: typeof merged.feedRetention === "number" ? merged.feedRetention : DEFAULT_CONFIG.feedRetention,
    stuckThreshold: typeof merged.stuckThreshold === "number" ? merged.stuckThreshold : DEFAULT_CONFIG.stuckThreshold,

    autoStatus: merged.autoStatus !== false,
  };
}

function validateContextMode(value: unknown): "full" | "minimal" | "none" {
  if (value === "full" || value === "minimal" || value === "none") return value;
  return "full";
}
