# Configuration

pi-mesh is configured through a JSON file. The minimal setup is:

```json
{
  "autoRegister": true
}
```

## Full reference

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

### `autoRegister`

**Type:** `boolean` · **Default:** `false`

Whether to join the mesh automatically when Pi starts. Set this to `true` in your project config so all agents coordinate by default.

### `autoRegisterPaths`

**Type:** `string[]` · **Default:** `[]`

Restrict auto-registration to specific directories. Accepts trailing wildcard patterns (`*`). When empty (the default), auto-registration applies everywhere.

Supported patterns:
- Exact match: `~/projects/my-monorepo`
- Trailing `*` (prefix match): `~/projects/shared-*` matches anything starting with `~/projects/shared-`
- Trailing `/*` (direct children): `~/projects/*` matches directories directly under `~/projects/`

Note: full glob syntax (`**`, `?`, brace expansion) is **not** supported.

```json
{
  "autoRegister": true,
  "autoRegisterPaths": ["~/projects/my-monorepo", "~/projects/shared-*"]
}
```

### `contextMode`

**Type:** `"full" | "minimal" | "none"` · **Default:** `"full"`

Controls how much mesh context is injected into the agent's system prompt.

- **`full`** — Includes peer list, active reservations, and recent feed events.
- **`minimal`** — Includes only the peer list. Reduces token usage.
- **`none`** — No mesh context injected. Tools still work, but the agent won't proactively know about peers.

### `feedRetention`

**Type:** `number` · **Default:** `50`

Maximum number of events to keep in `feed.jsonl`. Older events are trimmed when new ones are appended.

### `stuckThreshold`

**Type:** `number` · **Default:** `900`

Seconds of inactivity before an agent is considered "stuck." Stuck agents are flagged in `mesh_peers` output to help identify abandoned sessions.

### `autoStatus`

**Type:** `boolean` · **Default:** `true`

Automatically generate agent status from recent activity. When enabled, status messages like "editing src/auth.ts" or "running tests" are set without the agent explicitly calling `mesh_manage`.

### `hooksModule`

**Type:** `string` · **Default:** `undefined`

Path to a module that exports lifecycle hooks. Relative paths are resolved against `process.cwd()`. The module should export a `createHooks(config)` function returning a `MeshLifecycleHooks` object.

```json
{
  "autoRegister": true,
  "hooksModule": "./mesh-hooks.ts"
}
```

See [Lifecycle Hooks](../02-extend/hooks.md) for the full API.

## Config loading order

pi-mesh checks for configuration in this order (highest to lowest priority):

1. **Project config** — `.pi/pi-mesh.json` in the project root
2. **User config** — `~/.pi/agent/pi-mesh.json`
3. **User settings** — `~/.pi/agent/settings.json` under the `"mesh"` key
4. **Defaults** — Built-in defaults shown above

Project-level settings override user-level ones. This lets you set global preferences (like `contextMode`) in your user config while individual projects opt into `autoRegister`.
