# How it works

pi-mesh coordinates agents through plain files on disk. No daemon, no server — just a shared directory that every agent in the project can read and write.

## Directory structure

All state lives under `.pi/mesh/` in your project root:

```
.pi/mesh/
├── registry/          # One JSON file per agent
│   ├── bosun-1.json
│   └── lite-2.json
├── inbox/             # Per-agent message queues
│   ├── bosun-1/
│   │   └── 1710500000000-lite-2.json
│   └── lite-2/
└── feed.jsonl         # Append-only activity log
```

### Registry

Each active agent writes a JSON file to `registry/` containing its name, PID, model, branch, current activity, reservations, and timestamps. This is the source of truth for `mesh_peers`.

### Inbox

Each agent gets a directory under `inbox/`. Messages are individual JSON files named with a timestamp and sender. The inbox is watched with `fs.watch`, so there's no polling.

### Feed

`feed.jsonl` is an append-only log of mesh events: joins, departures, edits, commits, messages, reservation changes. The overlay's Feed tab reads from this file. Old entries are trimmed based on `feedRetention` config.

## Registration lifecycle

1. **Start** — When Pi starts with `autoRegister: true`, the extension writes a registry file and begins watching its inbox directory.
2. **Active** — The agent updates its registry entry as it works. Activity is tracked automatically (edits, commits, test runs).
3. **Stop** — On clean shutdown, the registry file and inbox directory are removed.
4. **Crash cleanup** — If an agent crashes, its registry file persists. The next `mesh_peers` call checks PIDs and removes entries for dead processes.

Non-interactive sessions (`--print` mode, daemon tasks) skip registration entirely to avoid cluttering the mesh.

## Message delivery

Messages use Pi's built-in delivery system:

- **Normal messages** are queued and delivered after the recipient finishes their current turn. The agent sees the message before its next action.
- **Urgent messages** interrupt the recipient immediately, injecting the message into the current conversation.

Both types are written as files to the recipient's inbox directory. The `fs.watch` listener picks them up and routes them through Pi's message API.

## Reservation enforcement

Reservations are enforced by hooking Pi's `edit` and `write` tools at the extension level. When any agent calls `edit` or `write`:

1. pi-mesh checks whether the target file falls under any active reservation.
2. If reserved by another agent, the tool call is **blocked** — the edit never happens.
3. The blocked agent sees an error message identifying who holds the reservation and why.
4. The agent can then coordinate with the reservation holder via `mesh_send`.

This enforcement only covers Pi's native file-writing tools. See [Limitations](limitations.md) for cases that bypass it.
