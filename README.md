# pi-mesh

Multi-agent coordination for [Pi](https://github.com/badlogic/pi-mono). Presence, messaging, file reservations, and activity tracking for multiple Pi sessions working in the same project.

No daemon, no server - just files.

## Install

```bash
pi install npm:pi-mesh
```

## Quick Start

Enable auto-registration in `.pi/pi-mesh.json`:

```json
{
  "autoRegister": true
}
```

Start two Pi sessions in the same project. They discover each other automatically.

```typescript
// Check who's around
mesh_peers({})

// Reserve files before editing
mesh_reserve({ paths: ["src/auth/"], reason: "Refactoring auth" })

// Send a message
mesh_send({ to: "zero-1", message: "Auth refactor done, interfaces changed" })

// Send urgent (interrupts recipient)
mesh_send({ to: "zero-1", message: "Stop! Don't edit config.ts", urgent: true })

// Release when done
mesh_release({})
```

Open the overlay to see everything at a glance:

```
/mesh
```

## Features

**Presence** - Agents register on startup. See who's active, what model they're using, which git branch, and what they're currently doing.

**File Reservations** - Claim files or directories. Other agents get blocked with a message telling them who to coordinate with. Read operations are never blocked.

**Messaging** - Send messages between agents. Normal messages wait for the recipient to finish their current work (`followUp`). Urgent messages interrupt immediately (`steer`).

**Activity Tracking** - Automatic tracking of edits, commits, test runs. Auto-generated status messages ("just shipped", "debugging..."). All visible in the overlay.

**Activity Feed** - Timeline of joins, leaves, edits, commits, messages, reservations. Append-only JSONL, auto-pruned.

**Overlay** - `/mesh` opens an interactive dashboard with three tabs: Agents (live status), Feed (activity timeline), Chat (send messages).

## Tools

### mesh_peers

List active agents with status, activity, and reservations.

### mesh_send

Send a message to another agent.

| Parameter | Required | Description |
|-----------|----------|-------------|
| to | Yes* | Recipient name |
| broadcast | Yes* | Send to all agents |
| message | Yes | Message text |
| urgent | No | Interrupt recipient (default: false) |

*One of `to` or `broadcast` required.

### mesh_reserve

Reserve files or directories.

| Parameter | Required | Description |
|-----------|----------|-------------|
| paths | Yes | Paths to reserve (trailing `/` for directories) |
| reason | No | Why you're reserving |

### mesh_release

Release reservations. Omit `paths` to release all.

| Parameter | Required | Description |
|-----------|----------|-------------|
| paths | No | Specific paths to release |

### mesh_manage

Utility actions for less common operations.

| Action | Parameters | Description |
|--------|-----------|-------------|
| whois | name | Detailed info about an agent |
| rename | name | Change your mesh name |
| set_status | message | Set custom status (omit to clear) |
| feed | limit | Show activity feed |

## Configuration

Create `.pi/pi-mesh.json`:

```json
{
  "autoRegister": false,
  "autoRegisterPaths": ["~/projects/*"],
  "contextMode": "full",
  "feedRetention": 50,
  "stuckThreshold": 900,
  "stuckNotify": true,
  "autoStatus": true
}
```

| Setting | Description | Default |
|---------|-------------|---------|
| autoRegister | Join mesh on startup | false |
| autoRegisterPaths | Folders where auto-join is enabled (supports globs) | [] |
| contextMode | Context injection: "full", "minimal", "none" | "full" |
| feedRetention | Max events in activity feed | 50 |
| stuckThreshold | Seconds idle before stuck detection | 900 |
| stuckNotify | Notify when a peer appears stuck | true |
| autoStatus | Auto-generate status from activity | true |

Config priority: project `.pi/pi-mesh.json` > user `~/.pi/agent/pi-mesh.json` > `~/.pi/agent/settings.json` "mesh" key > defaults.

## How It Works

File-based coordination. No daemon, no server.

```
.pi/mesh/
├── registry/          # One JSON file per agent (PID, model, activity)
├── inbox/             # Per-agent message directories
│   └── {name}/        # Messages as JSON files
└── feed.jsonl         # Append-only activity log
```

- Agents register on session start, unregister on shutdown
- Dead agents detected via PID checking and auto-cleaned
- Messages delivered via fs.watch on inbox directories
- Normal messages use Pi's `followUp` delivery (non-disruptive)
- Urgent messages use Pi's `steer` delivery (interrupts)
- Reservations stored in agent's registry entry, enforced via tool_call hook
- Activity tracked by hooking tool_call/tool_result events

## Naming

Agents are named `{type}-{N}` where type comes from `PI_AGENT` env var (default: "agent") and N is sequential. Override with `PI_AGENT_NAME` env var.

Examples: `zero-1`, `zero-2`, `lite-1`, `agent-1`

## Known Limitations

- `bash` tool can modify reserved files (e.g., `sed -i`). Only `edit` and `write` are intercepted.
- Concurrent feed writes may produce partial JSON lines. Malformed lines are skipped on read.
- PID checking may not work across process namespace boundaries.

## License

MIT
