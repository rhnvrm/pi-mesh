/**
 * Pi Mesh - Multi-Agent Coordination Extension
 *
 * Provides presence, messaging, file reservations, activity tracking,
 * and an interactive overlay for multiple Pi sessions.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { MeshState, Dirs, MeshMessage, MeshConfig } from "./types.js";
import { STATUS_INDICATORS, REGISTRY_FLUSH_MS } from "./types.js";
import { loadConfig, matchesAutoRegisterPath } from "./config.js";
import * as registry from "./registry.js";
import * as reservations from "./reservations.js";
import * as messaging from "./messaging.js";
import * as feed from "./feed.js";
import * as tracking from "./tracking.js";

export default function piMeshExtension(pi: ExtensionAPI) {
  // ===========================================================================
  // State & Configuration
  // ===========================================================================

  const config: MeshConfig = loadConfig(process.cwd());

  const state: MeshState = {
    agentName: "",
    agentType: process.env.PI_AGENT ?? "agent",
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
    sessionStartedAt: new Date().toISOString(),
  };

  let dirs: Dirs = registry.resolveDirs(process.cwd());

  // ===========================================================================
  // Message Delivery
  // ===========================================================================

  function deliverMessage(msg: MeshMessage): void {
    const replyHint =
      config.contextMode !== "none"
        ? ` - reply: mesh_send({ to: "${msg.from}", message: "..." })`
        : "";

    const content = `**Message from ${msg.from}**${replyHint}\n\n${msg.text}`;

    // Urgent messages steer (interrupt), normal messages follow up (wait for turn end)
    const deliverAs = msg.urgent ? "steer" : "followUp";

    pi.sendMessage(
      { customType: "mesh_message", content, display: true, details: msg },
      { triggerTurn: true, deliverAs }
    );
  }

  // ===========================================================================
  // Status Bar
  // ===========================================================================

  function updateStatusBar(ctx: ExtensionContext): void {
    if (!ctx.hasUI || !state.registered) return;

    const agents = registry.getActiveAgents(state, dirs);
    const count = agents.length;
    const theme = ctx.ui.theme;

    let totalUnread = 0;
    for (const n of state.unreadCounts.values()) totalUnread += n;

    const nameStr = theme.fg("accent", state.agentName);
    const countStr = theme.fg("dim", ` (${count} peer${count === 1 ? "" : "s"})`);
    const unreadStr =
      totalUnread > 0 ? theme.fg("accent", ` ${totalUnread}`) : "";

    ctx.ui.setStatus("mesh", `mesh: ${nameStr}${countStr}${unreadStr}`);
  }

  // ===========================================================================
  // Registry Flush Scheduling
  // ===========================================================================

  function scheduleRegistryFlush(ctx: ExtensionContext): void {
    if (state.registryFlushTimer) return;
    state.registryFlushTimer = setTimeout(() => {
      state.registryFlushTimer = null;
      registry.flushActivityToRegistry(state, dirs, ctx);
    }, REGISTRY_FLUSH_MS);
  }

  // ===========================================================================
  // Tool: mesh_peers
  // ===========================================================================

  pi.registerTool({
    name: "mesh_peers",
    label: "Mesh Peers",
    description:
      "List active agents in the mesh with their current activity, reservations, and status.",
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      if (!state.registered) {
        return notRegistered();
      }

      const thresholdMs = config.stuckThreshold * 1000;
      const allAgents = registry.getAllAgents(state, dirs);
      const folder = registry.extractFolder(process.cwd());

      const lines: string[] = [];
      lines.push(`# Mesh (${allAgents.length} agents - ${folder})`, "");

      for (const a of allAgents) {
        const isSelf = a.name === state.agentName;
        const hasRes = (a.reservations?.length ?? 0) > 0;
        const computed = registry.computeStatus(
          a.activity?.lastActivityAt ?? a.startedAt,
          hasRes,
          thresholdMs
        );
        const indicator = STATUS_INDICATORS[computed.status];
        const nameLabel = isSelf ? `${a.name} (you)` : a.name;

        const parts: string[] = [`${indicator} ${nameLabel}`];

        if (a.activity?.currentActivity) {
          parts.push(a.activity.currentActivity);
        } else if (computed.idleFor) {
          parts.push(`${computed.status} ${computed.idleFor}`);
        }

        parts.push(`${a.session?.toolCalls ?? 0} tools`);

        const tokens = a.session?.tokens ?? 0;
        parts.push(tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : `${tokens}`);

        if (a.model) parts.push(a.model);

        if (a.reservations && a.reservations.length > 0) {
          parts.push(
            a.reservations.map((r) => r.pattern).join(", ")
          );
        }

        if (a.statusMessage) parts.push(a.statusMessage);

        lines.push(parts.join(" - "));
      }

      // Recent activity
      const recentEvents = feed.readEvents(dirs, 5);
      if (recentEvents.length > 0) {
        lines.push("", "# Recent Activity", "");
        for (const event of recentEvents) {
          lines.push(feed.formatEvent(event));
        }
      }

      return result(lines.join("\n").trim());
    },
  });

  // ===========================================================================
  // Tool: mesh_send
  // ===========================================================================

  pi.registerTool({
    name: "mesh_send",
    label: "Mesh Send",
    description: [
      "Send a message to another agent in the mesh.",
      "Normal messages are delivered after the recipient finishes their current work.",
      "Urgent messages interrupt the recipient immediately.",
    ].join(" "),
    parameters: Type.Object({
      to: Type.Optional(
        Type.String({ description: "Recipient agent name" })
      ),
      broadcast: Type.Optional(
        Type.Boolean({ description: "Send to all agents" })
      ),
      message: Type.String({ description: "Message text" }),
      urgent: Type.Optional(
        Type.Boolean({
          description: "Interrupt recipient immediately (default: false)",
        })
      ),
      replyTo: Type.Optional(
        Type.String({ description: "Message ID if replying" })
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!state.registered) return notRegistered();

      const { to, broadcast, message, urgent, replyTo } = params as {
        to?: string;
        broadcast?: boolean;
        message: string;
        urgent?: boolean;
        replyTo?: string;
      };

      if (!message) return result("Error: message is required.");

      if (broadcast) {
        const msgs = messaging.broadcastMessage(
          state,
          dirs,
          message,
          urgent ?? false
        );
        if (msgs.length === 0) return result("No active agents to broadcast to.");

        const preview =
          message.length > 60 ? message.slice(0, 57) + "..." : message;
        feed.logEvent(
          dirs,
          state.agentName,
          "message",
          undefined,
          `broadcast: "${preview}"`
        );
        return result(`Broadcast sent to ${msgs.length} agent(s).`);
      }

      if (!to) return result("Error: specify 'to' or 'broadcast: true'.");
      if (to === state.agentName) return result("Error: cannot send to self.");

      const validation = messaging.validateRecipient(to, dirs);
      if (!validation.valid) {
        return result(`Error: agent "${to}" ${validation.error ?? "not found"}.`);
      }

      messaging.sendMessage(state, dirs, to, message, urgent ?? false, replyTo);

      const preview =
        message.length > 60 ? message.slice(0, 57) + "..." : message;
      feed.logEvent(
        dirs,
        state.agentName,
        "message",
        to,
        `-> ${to}: "${preview}"`
      );
      return result(
        `Message sent to ${to}.${urgent ? " (urgent - will interrupt)" : ""}`
      );
    },
  });

  // ===========================================================================
  // Tool: mesh_reserve
  // ===========================================================================

  pi.registerTool({
    name: "mesh_reserve",
    label: "Mesh Reserve",
    description:
      "Reserve files or directories to prevent other agents from editing them.",
    parameters: Type.Object({
      paths: Type.Array(Type.String(), {
        description:
          "Paths to reserve. Use trailing / for directories (e.g., 'src/auth/')",
      }),
      reason: Type.Optional(
        Type.String({ description: "Why you're reserving these paths" })
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!state.registered) return notRegistered();

      const { paths, reason } = params as {
        paths: string[];
        reason?: string;
      };

      if (!paths || paths.length === 0) {
        return result("Error: at least one path required.");
      }

      const warnings: string[] = [];
      for (const pattern of paths) {
        const validation = reservations.addReservation(
          state,
          dirs,
          ctx,
          pattern,
          reason
        );
        if (!validation.valid) {
          return result(`Error: invalid pattern "${pattern}".`);
        }
        if (validation.warning) warnings.push(validation.warning);
      }

      let text = `Reserved: ${paths.join(", ")}`;
      if (warnings.length > 0) {
        text += `\n\nWarnings:\n${warnings.map((w) => `- ${w}`).join("\n")}`;
      }
      return result(text);
    },
  });

  // ===========================================================================
  // Tool: mesh_release
  // ===========================================================================

  pi.registerTool({
    name: "mesh_release",
    label: "Mesh Release",
    description: "Release file reservations. Omit paths to release all.",
    parameters: Type.Object({
      paths: Type.Optional(
        Type.Array(Type.String(), {
          description: "Specific paths to release (omit to release all)",
        })
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!state.registered) return notRegistered();

      const { paths } = params as { paths?: string[] };

      if (!paths || paths.length === 0) {
        const released = reservations.removeAllReservations(state, dirs, ctx);
        return result(
          released.length > 0
            ? `Released all: ${released.join(", ")}`
            : "No reservations to release."
        );
      }

      const released: string[] = [];
      for (const pattern of paths) {
        if (reservations.removeReservation(state, dirs, ctx, pattern)) {
          released.push(pattern);
        }
      }

      return result(
        released.length > 0
          ? `Released: ${released.join(", ")}`
          : "No matching reservations found."
      );
    },
  });

  // ===========================================================================
  // Tool: mesh_manage
  // ===========================================================================

  pi.registerTool({
    name: "mesh_manage",
    label: "Mesh Manage",
    description: [
      "Utility actions for mesh management.",
      "Actions: whois (agent details), rename (change your name),",
      "set_status (custom status message), feed (activity feed).",
    ].join(" "),
    parameters: Type.Object({
      action: Type.String({
        description:
          "Action: 'whois', 'rename', 'set_status', 'feed'",
      }),
      name: Type.Optional(
        Type.String({
          description: "Agent name (for whois/rename)",
        })
      ),
      message: Type.Optional(
        Type.String({
          description: "Status message (for set_status, omit to clear)",
        })
      ),
      limit: Type.Optional(
        Type.Number({
          description: "Number of events (for feed, default 20)",
        })
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!state.registered) return notRegistered();

      const { action, name, message, limit } = params as {
        action: string;
        name?: string;
        message?: string;
        limit?: number;
      };

      switch (action) {
        case "whois":
          return executeWhois(name);
        case "rename":
          return executeRename(name, ctx);
        case "set_status":
          return executeSetStatus(message, ctx);
        case "feed":
          return executeFeed(limit);
        default:
          return result(
            `Unknown action "${action}". Use: whois, rename, set_status, feed.`
          );
      }
    },
  });

  function executeWhois(name?: string) {
    if (!name) return result("Error: name required for whois.");

    const thresholdMs = config.stuckThreshold * 1000;
    const allAgents = registry.getAllAgents(state, dirs);
    const agent = allAgents.find((a) => a.name === name);

    if (!agent) return result(`Agent "${name}" not found.`);

    const hasRes = (agent.reservations?.length ?? 0) > 0;
    const computed = registry.computeStatus(
      agent.activity?.lastActivityAt ?? agent.startedAt,
      hasRes,
      thresholdMs
    );
    const indicator = STATUS_INDICATORS[computed.status];
    const isSelf = agent.name === state.agentName;
    const sessionAge = registry.formatDuration(
      Date.now() - new Date(agent.startedAt).getTime()
    );
    const tokens = agent.session?.tokens ?? 0;
    const tokenStr =
      tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : `${tokens}`;

    const lines: string[] = [];
    lines.push(`# ${agent.name}${isSelf ? " (you)" : ""}`, "");
    lines.push(`${indicator} ${computed.status}${computed.idleFor ? ` for ${computed.idleFor}` : ""}`);
    if (agent.model) lines.push(`Model: ${agent.model}`);
    if (agent.agentType) lines.push(`Type: ${agent.agentType}`);
    if (agent.gitBranch) lines.push(`Branch: ${agent.gitBranch}`);
    lines.push(
      `Session: ${sessionAge} - ${agent.session?.toolCalls ?? 0} tool calls - ${tokenStr} tokens`
    );
    if (agent.statusMessage) lines.push(`Status: ${agent.statusMessage}`);

    if (agent.reservations && agent.reservations.length > 0) {
      lines.push("", "## Reservations");
      for (const r of agent.reservations) {
        lines.push(`- ${r.pattern}${r.reason ? ` (${r.reason})` : ""}`);
      }
    }

    if (agent.session?.filesModified && agent.session.filesModified.length > 0) {
      lines.push("", "## Recent Files");
      for (const f of agent.session.filesModified.slice(-10)) {
        lines.push(`- ${f}`);
      }
    }

    return result(lines.join("\n"));
  }

  function executeRename(name: string | undefined, ctx: ExtensionContext) {
    if (!name) return result("Error: name required for rename.");

    messaging.stopWatcher(state);
    const renameResult = registry.renameAgent(state, dirs, ctx, name);
    messaging.startWatcher(state, dirs, deliverMessage);
    updateStatusBar(ctx);

    if (!renameResult.success) {
      return result(`Error: ${renameResult.error}`);
    }

    return result(
      `Renamed from "${renameResult.oldName}" to "${renameResult.newName}".`
    );
  }

  function executeSetStatus(
    message: string | undefined,
    ctx: ExtensionContext
  ) {
    if (!message || message.trim() === "") {
      state.statusMessage = undefined;
      state.customStatus = false;
      registry.updateRegistration(state, dirs, ctx);
      return result("Custom status cleared. Auto-status will resume.");
    }

    state.statusMessage = message.trim();
    state.customStatus = true;
    registry.updateRegistration(state, dirs, ctx);
    return result(`Status set to: ${state.statusMessage}`);
  }

  function executeFeed(limit?: number) {
    const events = feed.readEvents(dirs, limit ?? 20);
    if (events.length === 0) {
      return result("# Activity Feed\n\nNo activity yet.");
    }

    const lines: string[] = [`# Activity Feed (last ${events.length})`, ""];
    for (const event of events) {
      lines.push(feed.formatEvent(event));
    }
    return result(lines.join("\n"));
  }

  // ===========================================================================
  // Command: /mesh
  // ===========================================================================

  pi.registerCommand("mesh", {
    description: "Open mesh coordination overlay",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      // Auto-join if not registered
      if (!state.registered) {
        if (!registry.register(state, dirs, ctx)) {
          ctx.ui.notify("Failed to join mesh", "error");
          return;
        }
        messaging.startWatcher(state, dirs, deliverMessage);
        updateStatusBar(ctx);
      }

      // Import and show overlay
      const { MeshOverlay } = await import("./overlay.js");
      await ctx.ui.custom<void>(
        (tui, theme, _keybindings, done) => {
          return new MeshOverlay(tui, theme, state, dirs, config, done);
        },
        { overlay: true }
      );

      updateStatusBar(ctx);
    },
  });

  // ===========================================================================
  // Message Renderer
  // ===========================================================================

  pi.registerMessageRenderer<MeshMessage>("mesh_message", (message, _options, theme) => {
    const details = message.details;
    if (!details) return undefined;

    return {
      render(width: number): string[] {
        const header = theme.fg("accent", `From ${details.from}`);
        const urgentTag = details.urgent ? theme.fg("dim", " [urgent]") : "";
        const result: string[] = [];
        result.push(header + urgentTag);
        result.push("");
        for (const line of details.text.split("\n")) {
          result.push(line.length > width ? line.slice(0, width - 3) + "..." : line);
        }
        return result;
      },
      invalidate() {},
    };
  });

  // ===========================================================================
  // Event: session_start
  // ===========================================================================

  pi.on("session_start", async (_event, ctx) => {
    state.isHuman = ctx.hasUI;

    // Non-interactive sessions (--print mode, daemon tasks) should not join the mesh.
    // They have no UI for message delivery and would spam interactive agents.
    if (!ctx.hasUI) return;

    const shouldAutoRegister =
      config.autoRegister ||
      matchesAutoRegisterPath(process.cwd(), config.autoRegisterPaths);

    if (!shouldAutoRegister) return;

    dirs = registry.resolveDirs(ctx.cwd ?? process.cwd());

    if (registry.register(state, dirs, ctx)) {
      messaging.startWatcher(state, dirs, deliverMessage);
      updateStatusBar(ctx);
      feed.pruneFeed(dirs, config.feedRetention);
      feed.logEvent(dirs, state.agentName, "join");

      // Inject context message so the LLM knows its mesh identity
      if (config.contextMode !== "none") {
        const folder = registry.extractFolder(process.cwd());
        const branchPart = state.gitBranch ? ` on ${state.gitBranch}` : "";
        const peers = registry.getActiveAgents(state, dirs);
        const peerList =
          peers.length > 0
            ? ` Peers: ${peers.map((a) => a.name).join(", ")}.`
            : "";

        pi.sendMessage(
          {
            customType: "mesh_context",
            content: `You are "${state.agentName}" in ${folder}${branchPart}.${peerList} Use mesh_peers to check who's active, mesh_reserve to claim files, mesh_send to message agents.`,
            display: false,
          },
          { triggerTurn: false }
        );
      }
    }
  });

  // ===========================================================================
  // Event: tool_call (reservation enforcement + activity tracking)
  // ===========================================================================

  pi.on("tool_call", async (event, _ctx) => {
    const toolName = event.toolName;
    const input = event.input as Record<string, unknown>;

    // 1. Reservation enforcement (runs first, before tracking)
    if (state.registered && (toolName === "edit" || toolName === "write")) {
      const path = input.path as string;
      if (path) {
        const conflicts = registry.getConflicts(path, state, dirs);
        if (conflicts.length > 0) {
          const c = conflicts[0];
          const folder = registry.extractFolder(c.registration.cwd);
          const lines = [
            path,
            `Reserved by: ${c.agent} (in ${folder})`,
          ];
          if (c.reason) lines.push(`Reason: "${c.reason}"`);
          lines.push("");
          lines.push(
            `Coordinate via mesh_send({ to: "${c.agent}", message: "..." })`
          );

          return { block: true, reason: lines.join("\n") };
        }
      }
    }

    // 2. Activity tracking
    if (state.registered) {
      tracking.onToolCall(toolName, input, state, dirs);
    }
  });

  // ===========================================================================
  // Event: tool_result
  // ===========================================================================

  pi.on("tool_result", async (event, ctx) => {
    if (!state.registered) return;

    tracking.onToolResult(
      event.toolName,
      event.input as Record<string, unknown>,
      !!event.isError,
      state,
      dirs
    );
    scheduleRegistryFlush(ctx);
  });

  // ===========================================================================
  // Event: turn_end
  // ===========================================================================

  pi.on("turn_end", async (event, ctx) => {
    // Process inbox as fallback (watcher handles real-time)
    messaging.processInbox(state, dirs, deliverMessage);
    messaging.recoverWatcherIfNeeded(state, dirs, deliverMessage);
    updateStatusBar(ctx);

    // Track token usage
    if (state.registered) {
      const msg = event.message as unknown as Record<string, unknown> | undefined;
      if (msg?.role === "assistant" && msg.usage) {
        const usage = msg.usage as {
          totalTokens?: number;
          input?: number;
          output?: number;
        };
        const total =
          usage.totalTokens ?? ((usage.input ?? 0) + (usage.output ?? 0));
        if (total > 0) {
          state.session.tokens += total;
          scheduleRegistryFlush(ctx);
        }
      }
    }
  });

  // ===========================================================================
  // Event: session_switch, session_fork, session_tree
  // ===========================================================================

  pi.on("session_switch", async (_event, ctx) => {
    messaging.recoverWatcherIfNeeded(state, dirs, deliverMessage);
    updateStatusBar(ctx);
  });

  pi.on("session_fork", async (_event, ctx) => {
    messaging.recoverWatcherIfNeeded(state, dirs, deliverMessage);
    updateStatusBar(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    updateStatusBar(ctx);
  });

  // ===========================================================================
  // Event: session_shutdown
  // ===========================================================================

  pi.on("session_shutdown", async (_event, ctx) => {
    if (state.registered) {
      feed.logEvent(dirs, state.agentName, "leave");
      // Release all reservations
      if (state.reservations.length > 0) {
        reservations.removeAllReservations(state, dirs, ctx);
      }
    }

    // Cleanup timers
    if (state.registryFlushTimer) {
      clearTimeout(state.registryFlushTimer);
      state.registryFlushTimer = null;
    }
    tracking.cleanup();
    messaging.stopWatcher(state);
    registry.unregister(state, dirs);
  });
}

// =============================================================================
// Helpers
// =============================================================================

function result(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function notRegistered() {
  return result(
    "Not registered in mesh. Set autoRegister: true in pi-mesh.json or wait for session start."
  );
}
