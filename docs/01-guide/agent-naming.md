# Agent naming

## Default pattern

Agent names follow the pattern **`{type}-{N}`** where:

- **`type`** comes from the `PI_AGENT` environment variable (defaults to `"agent"`)
- **`N`** is an auto-incrementing number to avoid collisions

So if `PI_AGENT=zero`, your agents will be named `zero-1`, `zero-2`, etc. If `PI_AGENT=lite`, you get `lite-1`, `lite-2`.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `PI_AGENT` | Sets the agent type prefix. Determines the base name before the numeric suffix. |
| `PI_AGENT_NAME` | Overrides the full name entirely. Skips the `{type}-{N}` pattern. |

Setting `PI_AGENT_NAME=auth-worker` means the agent registers as exactly `auth-worker` — no suffix appended.

## Renaming at runtime

Agents can rename themselves during a session using `mesh_manage`:

```typescript
mesh_manage({ action: "rename", name: "auth-worker" })
```

This updates the registry entry, renames the inbox directory, and posts a rename event to the feed. Other agents see the new name on their next `mesh_peers` call.
