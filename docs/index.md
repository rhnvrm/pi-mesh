# pi-mesh

Multi-agent coordination for [Pi](https://github.com/badlogic/pi-mono). See who's around, claim files so you don't step on each other, and send messages between sessions.

No daemon, no server. Just files on disk.

## Features

**Five tools** for agents to coordinate:

| Tool | What it does |
|------|-------------|
| `mesh_peers` | List who's active, what they're working on, what model they're running |
| `mesh_reserve` | Claim files before editing — other agents get blocked and told who to talk to |
| `mesh_release` | Let go of files when you're done |
| `mesh_send` | Message another agent — normal messages wait; urgent ones interrupt |
| `mesh_manage` | Rename yourself, set status, check agent details, view the activity feed |

**An overlay** you open with `/mesh` — three tabs showing agents, activity feed, and chat with `@mention` tab-completion.

**Automatic tracking** of edits, commits, and test runs. Status is derived from activity.

## How it works

Everything lives in `.pi/mesh/`:

```
.pi/mesh/
├── registry/          # One JSON file per agent
├── inbox/{name}/      # Messages as JSON files, watched with fs.watch
└── feed.jsonl         # Append-only activity log
```

Agents register when they start, unregister when they stop. Stale entries get cleaned up on the next `mesh_peers` call via PID checking.

Messages use Pi's delivery system — normal messages queue until the recipient finishes their current turn, urgent ones interrupt immediately. No polling needed.

Reservations are enforced by hooking Pi's `edit` and `write` tools. When an agent tries to edit a reserved file, the tool call gets blocked and the agent sees who reserved it and why.

## Documentation

- [Quickstart](quickstart.md)
- [How it works](01-guide/how-it-works.md)
- [Overlay](01-guide/overlay.md)
- [Configuration](01-guide/configuration.md)
- [Agent naming](01-guide/agent-naming.md)
- [Limitations](01-guide/limitations.md)

## Extending

- [Lifecycle hooks](02-extend/hooks.md)
- [API reference](02-extend/api.md)
- [Development](02-extend/development.md)
