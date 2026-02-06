/**
 * Pi Mesh - TUI Overlay
 *
 * Three-tab dashboard: Agents, Feed, Chat
 * Implements Component interface for ctx.ui.custom()
 */

import { matchesKey, truncateToWidth, Key } from "@mariozechner/pi-tui";
import type { Component, TUI } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import type { MeshState, Dirs, MeshConfig } from "./types.js";
import { STATUS_INDICATORS } from "./types.js";
import * as registry from "./registry.js";
import * as feed from "./feed.js";
import * as messaging from "./messaging.js";

type Tab = "agents" | "feed" | "chat";

export class MeshOverlay implements Component {
  private tabs: Tab[] = ["agents", "feed", "chat"];
  private currentTab: Tab = "agents";
  private scrollOffset = 0;
  private chatInput = "";
  private chatTarget = "@all";
  private completionCandidates: string[] = [];
  private completionIndex = -1;

  constructor(
    private tui: TUI,
    private theme: Theme,
    private state: MeshState,
    private dirs: Dirs,
    private config: MeshConfig,
    private done: (result: void) => void
  ) {}

  render(width: number): string[] {
    const lines: string[] = [];

    // Header
    lines.push(
      this.theme.fg("accent", " Mesh") +
        this.theme.fg("dim", ` - ${this.state.agentName}`)
    );

    // Tab bar
    const tabLine = this.tabs
      .map((tab) => {
        const label = tab.charAt(0).toUpperCase() + tab.slice(1);
        if (tab === this.currentTab) {
          return this.theme.fg("accent", ` [${label}] `);
        }
        return this.theme.fg("dim", `  ${label}  `);
      })
      .join("");
    lines.push(tabLine);
    lines.push(this.theme.fg("dim", "─".repeat(width)));

    // Content
    const content = this.renderTab(width);
    const visible = content.slice(this.scrollOffset);
    for (const line of visible) {
      lines.push(line);
    }

    // Footer
    lines.push("");
    if (this.currentTab === "chat") {
      lines.push(
        this.theme.fg("dim", " Tab: switch | Up/Down: scroll | Enter: send | Esc: close")
      );
    } else {
      lines.push(
        this.theme.fg("dim", " Tab: switch | Up/Down: scroll | Esc: close")
      );
    }
    lines.push(this.theme.fg("dim", "─".repeat(width)));

    return lines;
  }

  handleInput(data: string): void {
    // Esc to close
    if (matchesKey(data, Key.escape)) {
      this.done();
      return;
    }

    // Tab: completion if chat input has @, otherwise switch tabs
    if (matchesKey(data, Key.tab)) {
      if (this.currentTab === "chat" && this.chatInput.includes("@")) {
        this.handleMentionComplete();
        return;
      }
      const idx = this.tabs.indexOf(this.currentTab);
      this.currentTab = this.tabs[(idx + 1) % this.tabs.length];
      this.scrollOffset = 0;
      this.tui.requestRender();
      return;
    }

    // Scroll
    if (matchesKey(data, Key.up)) {
      if (this.scrollOffset > 0) this.scrollOffset--;
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, Key.down)) {
      this.scrollOffset++;
      this.tui.requestRender();
      return;
    }

    // Chat input
    if (this.currentTab === "chat") {
      if (matchesKey(data, Key.enter)) {
        this.completionCandidates = [];
        this.completionIndex = -1;
        this.sendChatMessage();
        return;
      }
      if (matchesKey(data, Key.backspace)) {
        this.chatInput = this.chatInput.slice(0, -1);
        this.completionCandidates = [];
        this.completionIndex = -1;
        this.tui.requestRender();
        return;
      }
      // Regular character input
      if (data.length === 1 && !data.startsWith("\x1b")) {
        this.chatInput += data;
        this.completionCandidates = [];
        this.completionIndex = -1;
        this.tui.requestRender();
        return;
      }
    }
  }

  private renderTab(width: number): string[] {
    switch (this.currentTab) {
      case "agents":
        return this.renderAgents(width);
      case "feed":
        return this.renderFeed(width);
      case "chat":
        return this.renderChat(width);
    }
  }

  private renderAgents(width: number): string[] {
    const lines: string[] = [];
    const thresholdMs = this.config.stuckThreshold * 1000;
    const allAgents = registry.getAllAgents(this.state, this.dirs);

    if (allAgents.length === 0) {
      lines.push(this.theme.fg("dim", "  No agents registered."));
      return lines;
    }

    for (const agent of allAgents) {
      const isSelf = agent.name === this.state.agentName;
      const hasRes = (agent.reservations?.length ?? 0) > 0;
      const computed = registry.computeStatus(
        agent.activity?.lastActivityAt ?? agent.startedAt,
        hasRes,
        thresholdMs
      );
      const indicator = STATUS_INDICATORS[computed.status];
      const nameLabel = isSelf
        ? this.theme.fg("accent", agent.name) +
          this.theme.fg("dim", " (you)")
        : agent.name;
      const bgTag = agent.isHuman === false ? this.theme.fg("dim", " (bg)") : "";

      lines.push(`  ${indicator} ${nameLabel}${bgTag}`);

      // Details line
      const details: string[] = [];
      if (agent.model) details.push(agent.model);
      if (agent.gitBranch) details.push(agent.gitBranch);
      if (agent.activity?.currentActivity) {
        details.push(agent.activity.currentActivity);
      } else if (computed.idleFor) {
        details.push(`${computed.status} ${computed.idleFor}`);
      }
      if (details.length > 0) {
        lines.push(
          truncateToWidth(`    ${this.theme.fg("dim", details.join(" | "))}`, width)
        );
      }

      // Reservations
      if (agent.reservations && agent.reservations.length > 0) {
        for (const r of agent.reservations) {
          lines.push(
            truncateToWidth(
              `    ${this.theme.fg("dim", `reserved: ${r.pattern}${r.reason ? ` (${r.reason})` : ""}`)}`,
              width
            )
          );
        }
      }

      if (agent.statusMessage) {
        lines.push(`    ${this.theme.fg("dim", `"${agent.statusMessage}"`)}`);
      }

      lines.push(""); // spacing
    }

    return lines;
  }

  private renderFeed(width: number): string[] {
    const events = feed.readEvents(this.dirs, this.config.feedRetention);
    if (events.length === 0) {
      return [this.theme.fg("dim", "  No activity yet.")];
    }

    return events
      .reverse()
      .map((event) =>
        truncateToWidth(`  ${feed.formatEvent(event)}`, width)
      );
  }

  private renderChat(width: number): string[] {
    const lines: string[] = [];

    // Collect all messages
    const allMessages: Array<{
      text: string;
      time: string;
      from: string;
      timestamp: string;
    }> = [];

    for (const [_sender, msgs] of this.state.chatHistory) {
      for (const msg of msgs) {
        allMessages.push({
          text: msg.text,
          time: new Date(msg.timestamp).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }),
          from: msg.from,
          timestamp: msg.timestamp,
        });
      }
    }

    for (const msg of this.state.broadcastHistory) {
      allMessages.push({
        text: msg.text,
        time: new Date(msg.timestamp).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
        from: msg.from,
        timestamp: msg.timestamp,
      });
    }

    allMessages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    if (allMessages.length === 0) {
      lines.push(this.theme.fg("dim", "  No messages yet."));
      lines.push("");
    } else {
      const visible = allMessages.slice(-20);
      for (const m of visible) {
        const fromStr =
          m.from === this.state.agentName
            ? this.theme.fg("accent", m.from)
            : m.from;
        lines.push(
          truncateToWidth(
            `  ${this.theme.fg("dim", m.time)} ${fromStr}: ${m.text}`,
            width
          )
        );
      }
    }

    // Input area
    lines.push("");
    lines.push(this.theme.fg("dim", "  " + "─".repeat(width - 4)));

    // Show completion candidates if active
    if (this.completionCandidates.length > 1) {
      const hints = this.completionCandidates.map((c, i) =>
        i === this.completionIndex
          ? this.theme.fg("accent", `@${c}`)
          : this.theme.fg("dim", `@${c}`)
      );
      lines.push(`  ${hints.join("  ")}`);
    }

    lines.push(`  ${this.theme.fg("dim", `To: ${this.chatTarget}`)}`);
    lines.push(`  > ${this.chatInput}`);

    return lines;
  }

  private handleMentionComplete(): void {
    // Find the @partial being typed
    const atIdx = this.chatInput.lastIndexOf("@");
    if (atIdx === -1) return;

    const partial = this.chatInput.slice(atIdx + 1).toLowerCase();
    const agents = registry.getActiveAgents(this.state, this.dirs);
    const names = agents.map((a) => a.name);

    // On first Tab, build candidates matching the partial
    if (this.completionCandidates.length === 0) {
      this.completionCandidates = partial
        ? names.filter((n) => n.toLowerCase().startsWith(partial))
        : names;
      // Add @all as an option
      if ("all".startsWith(partial)) {
        this.completionCandidates.push("all");
      }
      this.completionIndex = 0;
    } else {
      // Cycle through candidates
      this.completionIndex =
        (this.completionIndex + 1) % this.completionCandidates.length;
    }

    if (this.completionCandidates.length === 0) return;

    const completed = this.completionCandidates[this.completionIndex];
    this.chatInput = this.chatInput.slice(0, atIdx) + "@" + completed + " ";
    this.chatTarget = "@" + completed;
    this.tui.requestRender();
  }

  private sendChatMessage(): void {
    const text = this.chatInput.trim();
    if (!text) return;

    let message = text;
    let target = this.chatTarget;

    if (text.startsWith("@")) {
      const spaceIdx = text.indexOf(" ");
      if (spaceIdx > 0) {
        target = text.slice(0, spaceIdx);
        message = text.slice(spaceIdx + 1).trim();
      }
    }

    if (!message) return;

    if (target === "@all") {
      const msgs = messaging.broadcastMessage(this.state, this.dirs, message);
      for (const msg of msgs) {
        this.state.broadcastHistory.push(msg);
        if (this.state.broadcastHistory.length > 50) {
          this.state.broadcastHistory.shift();
        }
      }
    } else {
      const name = target.startsWith("@") ? target.slice(1) : target;
      messaging.sendMessage(this.state, this.dirs, name, message);
    }

    this.chatInput = "";
    this.chatTarget = "@all";
    this.tui.requestRender();
  }
}
