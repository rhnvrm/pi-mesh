# Quickstart

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

Start two Pi sessions in the same project and they'll find each other.

## Usage

### See who's around

```typescript
mesh_peers({})
```

### Claim files before editing

```typescript
mesh_reserve({ paths: ["src/auth/"], reason: "Refactoring auth" })
```

Other agents that try to edit files under `src/auth/` will be blocked and told who reserved them.

### Send messages

```typescript
// Normal message — delivered after the recipient finishes current work
mesh_send({ to: "agent-2", message: "Auth refactor done, interfaces changed" })

// Urgent message — interrupts immediately
mesh_send({ to: "agent-2", message: "Stop! Don't touch config.ts", urgent: true })
```

### Release files when done

```typescript
// Release all reservations
mesh_release({})

// Or release specific paths
mesh_release({ paths: ["src/auth/"] })
```

## Overlay

Open the mesh overlay with `/mesh` to see live status of all agents, an activity feed, and a chat panel with `@mention` tab-completion.

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
| `autoRegister` | Join mesh when Pi starts | `false` |
| `autoRegisterPaths` | Only auto-join in these folders (trailing `*` wildcards) | `[]` |
| `contextMode` | How much context to inject: `"full"`, `"minimal"`, `"none"` | `"full"` |
| `feedRetention` | Max events kept in the activity feed | `50` |
| `stuckThreshold` | Seconds idle before an agent is marked stuck | `900` |
| `autoStatus` | Generate status from activity automatically | `true` |

Config is loaded from: project `.pi/pi-mesh.json` → user `~/.pi/agent/pi-mesh.json` → `~/.pi/agent/settings.json` "mesh" key → defaults.
