# Lifecycle hooks

pi-mesh supports lifecycle hooks so external code can react to mesh events without forking the package.

## Setup

Add `hooksModule` to your `.pi/pi-mesh.json`:

```json
{
  "autoRegister": true,
  "hooksModule": "./mesh-hooks.ts"
}
```

The path is resolved relative to `process.cwd()`. Absolute paths and bare package specifiers also work.

## Writing a hooks module

The module should export a `createHooks` function:

```typescript
import type { MeshConfig, MeshLifecycleHooks } from "pi-mesh/types";

export function createHooks(config: MeshConfig): MeshLifecycleHooks {
  return {
    onRegistered(state, ctx, actions) {
      // Called after successful mesh registration.
      // state.agentName is set. Use actions.rename() if needed.
    },

    onRenamed(state, ctx, result) {
      // Called after a successful rename (from mesh_manage or actions.rename).
      // result.oldName and result.newName are available.
    },

    onPollTick(state, ctx, actions) {
      // Called on an interval while registered.
      // Use for periodic sync tasks. Can call actions.rename().
    },

    onShutdown(state) {
      // Called during session shutdown, before unregister.
      // Synchronous only — no ctx available.
    },
  };
}
```

All hooks are optional. Only implement what you need.

## Hook actions

`onRegistered` and `onPollTick` receive an `actions` object:

| Action | Returns | Description |
|--------|---------|-------------|
| `actions.rename(newName)` | `Promise<RenameResult>` | Rename this agent in the mesh registry. Handles watcher stop/start internally. Fires `onRenamed` on success. |

This lets hooks trigger mesh operations without reaching into pi-mesh internals.

### Handling rename failures

`actions.rename()` returns a `RenameResult`. Check `result.success` and `result.error` to handle failures:

```typescript
const result = await actions.rename("new-name");
if (!result.success) {
  if (result.error === "name_taken") {
    // Another live agent has this name
  } else if (result.error === "invalid_name") {
    // Name doesn't match [a-zA-Z0-9_][a-zA-Z0-9_-]*
  }
}
```

## Hook state

Hooks can store custom state across calls using `state.hookState`:

```typescript
onRegistered(state, ctx, actions) {
  state.hookState.myCounter = 0;
},

onPollTick(state, ctx, actions) {
  const count = (state.hookState.myCounter as number) ?? 0;
  state.hookState.myCounter = count + 1;
},
```

`hookState` is a `Record<string, unknown>` initialized to `{}` — it persists in memory for the session but is not written to the registry file.

### Reserved keys

| Key | Used by |
|-----|---------|
| `pollIntervalMs` | pi-mesh reads this in `onRegistered` to set the poll timer interval (default: 2000ms, minimum: 250ms). Read once at timer start — not dynamic. |

## Poll interval

The `onPollTick` timer defaults to 2 seconds. To customize, set `state.hookState.pollIntervalMs` in `onRegistered`:

```typescript
onRegistered(state, ctx, actions) {
  state.hookState.pollIntervalMs = 5000; // 5 second poll
},
```

The value is read once when the timer starts. Changing it later has no effect.

## Error handling

- If `hooksModule` fails to load (missing file, syntax error, bad export), pi-mesh shows a notification via `ctx.ui.notify` and continues without hooks.
- If `onShutdown` throws, the exception is caught and ignored so cleanup (watcher stop, unregister) still runs.
- `onPollTick` errors are caught and surfaced via `ctx.ui.notify` as a warning. Concurrent invocations are guarded — if a tick is still running when the next interval fires, it's skipped.
- `onRegistered` and `onRenamed` are called with `await` — uncaught exceptions will propagate.

## Example: tmux window sync

This is a simplified version of what [bosun](https://github.com/oddship/bosun) uses to keep tmux window names in sync with mesh peer names:

```typescript
import type { MeshConfig, MeshLifecycleHooks } from "pi-mesh/types";
import { execFileSync } from "node:child_process";

export function createHooks(config: MeshConfig): MeshLifecycleHooks {
  let lastWindowName: string | undefined;

  function getTmuxWindowName(): string | null {
    try {
      const pane = process.env.TMUX_PANE;
      const socket = process.env.TMUX?.split(",")[0];
      if (!socket) return null;
      const args = pane
        ? ["-S", socket, "display-message", "-p", "-t", pane, "#W"]
        : ["-S", socket, "display-message", "-p", "#W"];
      return execFileSync("tmux", args, { encoding: "utf-8", timeout: 2000 }).trim();
    } catch {
      return null;
    }
  }

  return {
    onRegistered(state, ctx, actions) {
      lastWindowName = getTmuxWindowName() ?? state.agentName;
    },

    async onPollTick(state, ctx, actions) {
      const current = getTmuxWindowName();
      if (!current || current === lastWindowName) return;
      lastWindowName = current;
      if (current === state.agentName) return;

      const result = await actions.rename(current);
      if (!result.success) {
        // Revert tmux window on failure
        // (left as exercise — see bosun's mesh-identity-sync.ts)
      }
    },
  };
}
```
