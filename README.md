# pi-mesh

<a href="https://zerodha.tech"><img src="https://zerodha.tech/static/images/github-badge.svg" alt="Zerodha Tech"></a>
<a href="https://www.npmjs.com/package/pi-mesh"><img src="https://img.shields.io/npm/v/pi-mesh" alt="npm"></a>

Coordinate multiple [Pi](https://github.com/badlogic/pi-mono) agents working in the same project. See who's around, claim files so you don't step on each other, and send messages between sessions.

No daemon, no server. Just files on disk.

## Install

```bash
pi install npm:pi-mesh
```

## Setup

Add `.pi/pi-mesh.json` to your project:

```json
{
  "autoRegister": true
}
```

That's it. Start two Pi sessions in the same project and they'll find each other.

## What you get

**Five tools** for agents to coordinate:

| Tool | What it does |
|------|-------------|
| `mesh_peers` | List who's active, what they're working on, what model they're running |
| `mesh_reserve` | Claim files before editing. Other agents get blocked and told who to talk to |
| `mesh_release` | Let go of files when you're done |
| `mesh_send` | Message another agent. Normal messages wait politely; urgent ones interrupt |
| `mesh_manage` | Rename yourself, set status, check agent details, view the activity feed |

**An overlay** you open with `/mesh` - three tabs showing agents, activity feed, and a chat with `@mention` tab-completion.

**Automatic tracking** of edits, commits, and test runs. Status is derived from activity ("just shipped", "debugging...", "on fire").

## Quick example

```typescript
// Who's here?
mesh_peers({})

// I'm going to work on auth
mesh_reserve({ paths: ["src/auth/"], reason: "Refactoring auth" })

// Let the other agent know
mesh_send({ to: "zero-2", message: "Auth refactor done, interfaces changed" })

// Something urgent
mesh_send({ to: "zero-2", message: "Stop! Don't touch config.ts", urgent: true })

// Done, release files
mesh_release({})
```

## How it works

Everything lives in `.pi/mesh/`:

```
.pi/mesh/
├── registry/          # One JSON file per agent
├── inbox/{name}/      # Messages as JSON files, watched with fs.watch
└── feed.jsonl         # Append-only activity log
```

Agents register when they start, unregister when they stop. If an agent crashes, stale entries get cleaned up on the next `mesh_peers` call via PID checking.

Messages use Pi's delivery system - normal messages queue until the recipient finishes their current turn, urgent ones interrupt immediately. No polling needed.

Reservations are enforced by hooking Pi's `edit` and `write` tools. When an agent tries to edit a reserved file, the tool call gets blocked and the agent sees who reserved it and why.

Non-interactive sessions (`--print` mode, daemon tasks) skip registration entirely so they don't spam interactive agents.

## Overlay

Open with `/mesh`. Tab switches between panels, arrow keys scroll, Esc closes.

| Tab | Shows |
|-----|-------|
| Agents | Live status of all peers - model, branch, current activity, reservations |
| Feed | Scrollable timeline of joins, edits, commits, messages |
| Chat | Type `@name message` to DM, or just type to broadcast. Tab-complete names |

## Configuration

Full config with defaults:

```json
{
  "autoRegister": false,
  "autoRegisterPaths": [],
  "contextMode": "full",
  "feedRetention": 50,
  "stuckThreshold": 900,
  "autoStatus": true
}
```

| Setting | What it does | Default |
|---------|-------------|---------|
| autoRegister | Join mesh when Pi starts | false |
| autoRegisterPaths | Only auto-join in these folders (globs ok) | [] |
| contextMode | How much context to inject: "full", "minimal", "none" | "full" |
| feedRetention | Max events kept in the activity feed | 50 |
| stuckThreshold | Seconds idle before an agent is marked stuck | 900 |
| autoStatus | Generate status from activity automatically | true |

Config is loaded from: project `.pi/pi-mesh.json` > user `~/.pi/agent/pi-mesh.json` > `~/.pi/agent/settings.json` "mesh" key > defaults.

The library defaults to `autoRegister: false`. Set it to `true` in your project config if you want all agents to coordinate.

## Agent naming

Names follow the pattern `{type}-{N}` where type comes from `PI_AGENT` env var (defaults to "agent") and N increments. So you get `zero-1`, `zero-2`, `lite-1`, etc.

Override with `PI_AGENT_NAME` env var, or rename at runtime:

```typescript
mesh_manage({ action: "rename", name: "auth-worker" })
```

## Limitations

- **`bash` bypasses reservations.** Only `edit` and `write` are hooked. A `sed -i` through bash won't be caught.
- **Concurrent feed writes** can produce partial JSON lines. Malformed lines are skipped on read.
- **PID checking** doesn't work across container boundaries.
- **Crashed agents** leave stale registrations until the next `mesh_peers` cleans them up.

## Credits

Inspired by [pi-messenger](https://github.com/nicobailon/pi-messenger) by Nico Bailon. pi-mesh focuses on coordination only - presence, messaging, reservations - without the crew/task layer.

## License

MIT
