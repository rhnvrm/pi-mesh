import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { register, renameAgent, resolveDirs } from "../registry.js";
import type { MeshState } from "../types.js";

function makeState(agentType: string = "agent"): MeshState {
  return {
    agentName: "",
    agentType,
    registered: false,
    watcher: null,
    watcherRetries: 0,
    watcherRetryTimer: null,
    watcherDebounceTimer: null,
    reservations: [],
    chatHistory: new Map(),
    unreadCounts: new Map(),
    broadcastHistory: [],
    model: "",
    gitBranch: undefined,
    isHuman: false,
    session: { toolCalls: 0, tokens: 0, filesModified: [] },
    activity: { lastActivityAt: new Date().toISOString() },
    statusMessage: undefined,
    customStatus: false,
    registryFlushTimer: null,
    sessionStartedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    hookState: {},
  };
}

function makeCtx(sessionId: string = "session-1") {
  return {
    model: { id: "test-model" },
    sessionManager: {
      getSessionId: () => sessionId,
    },
  } as any;
}

describe("registry", () => {
  let tmpDir: string;
  let prevMeshDir: string | undefined;
  let prevAgentName: string | undefined;
  const childPids: number[] = [];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-mesh-registry-"));
    prevMeshDir = process.env.PI_MESH_DIR;
    prevAgentName = process.env.PI_AGENT_NAME;
    process.env.PI_MESH_DIR = path.join(tmpDir, ".pi", "mesh");
    delete process.env.PI_AGENT_NAME;
  });

  afterEach(() => {
    if (prevMeshDir === undefined) delete process.env.PI_MESH_DIR;
    else process.env.PI_MESH_DIR = prevMeshDir;

    if (prevAgentName === undefined) delete process.env.PI_AGENT_NAME;
    else process.env.PI_AGENT_NAME = prevAgentName;

    for (const pid of childPids) {
      try { process.kill(pid, "SIGTERM"); } catch {}
    }

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("registers with sequential name", () => {
    const dirs = resolveDirs(tmpDir);
    const state = makeState();
    const ok = register(state, dirs, makeCtx());

    expect(ok).toBe(true);
    expect(state.agentName).toBe("agent-1");
    expect(state.registered).toBe(true);
    expect(fs.existsSync(path.join(dirs.registry, "agent-1.json"))).toBe(true);
  });

  it("falls back from a taken PI_AGENT_NAME without recursion", () => {
    const dirs = resolveDirs(tmpDir);
    fs.mkdirSync(dirs.registry, { recursive: true });
    fs.mkdirSync(dirs.inbox, { recursive: true });

    process.env.PI_AGENT_NAME = "agent-2";

    // Spawn a real live process so PID check passes
    const liveProc = spawn("sleep", ["30"]);
    if (!liveProc.pid) throw new Error("failed to spawn");
    childPids.push(liveProc.pid);

    fs.writeFileSync(
      path.join(dirs.registry, "agent-2.json"),
      JSON.stringify({
        name: "agent-2",
        agentType: "agent",
        pid: liveProc.pid,
        sessionId: "live",
        cwd: tmpDir,
        model: "test",
        startedAt: new Date().toISOString(),
        isHuman: false,
        session: { toolCalls: 0, tokens: 0, filesModified: [] },
        activity: { lastActivityAt: new Date().toISOString() },
      }),
    );

    const state = makeState();
    const ok = register(state, dirs, makeCtx());

    expect(ok).toBe(true);
    // Should have fallen back to agent-1, not recursed infinitely
    expect(state.agentName).toBe("agent-1");
    expect(fs.existsSync(path.join(dirs.registry, "agent-1.json"))).toBe(true);
  });

  it("preserves sessionStartedAt across rename", () => {
    const dirs = resolveDirs(tmpDir);
    const state = makeState();
    const ctx = makeCtx();

    register(state, dirs, ctx);
    const startedAt = state.sessionStartedAt;

    const result = renameAgent(state, dirs, ctx, "renamed-agent");

    expect(result.success).toBe(true);
    expect(state.sessionStartedAt).toBe(startedAt);

    const reg = JSON.parse(
      fs.readFileSync(path.join(dirs.registry, "renamed-agent.json"), "utf-8"),
    );
    expect(reg.startedAt).toBe(startedAt);
  });

  it("does not mutate state.agentName before write succeeds", () => {
    const dirs = resolveDirs(tmpDir);
    const state = makeState();

    // agentName should be empty before register
    expect(state.agentName).toBe("");

    const ok = register(state, dirs, makeCtx());
    expect(ok).toBe(true);
    // Now it should be set
    expect(state.agentName).toBe("agent-1");
  });
});
