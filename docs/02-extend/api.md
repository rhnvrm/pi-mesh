# API reference

All types, interfaces, and constants are exported from `types.ts`. This page covers the key exports for anyone integrating with pi-mesh.

## Interfaces

### `MeshConfig`

The configuration object. See [Configuration](../01-guide/configuration.md) for full details.

```typescript
interface MeshConfig {
  autoRegister: boolean;
  autoRegisterPaths: string[];
  contextMode: "full" | "minimal" | "none";
  feedRetention: number;
  stuckThreshold: number;
  autoStatus: boolean;
  hooksModule?: string;
}
```

### `AgentRegistration`

Represents a registered agent in the mesh. Written to `.pi/mesh/registry/{name}.json`.

```typescript
interface AgentRegistration {
  name: string;              // Display name (e.g. "zero-1")
  agentType: string;         // From PI_AGENT env var
  pid: number;               // OS process ID, used for stale cleanup
  sessionId: string;         // Unique session identifier
  cwd: string;               // Working directory
  model: string;             // LLM model name
  startedAt: string;         // ISO timestamp
  reservations?: FileReservation[];
  gitBranch?: string;
  isHuman: boolean;          // True for human-driven sessions
  session: AgentSession;     // Cumulative session stats
  activity: AgentActivity;   // Recent activity info
  statusMessage?: string;    // Custom or auto-generated status
}
```

### `MeshMessage`

A message between agents. Written as a JSON file in the recipient's inbox.

```typescript
interface MeshMessage {
  id: string;                // Unique message ID
  from: string;              // Sender agent name
  to: string;                // Recipient agent name
  text: string;              // Message body
  timestamp: string;         // ISO timestamp
  urgent: boolean;           // If true, interrupts the recipient
  replyTo: string | null;    // ID of the message being replied to
}
```

### `FileReservation`

A file or directory reservation held by an agent.

```typescript
interface FileReservation {
  pattern: string;           // Path or glob pattern (e.g. "src/auth/")
  reason?: string;           // Why the reservation was made
  since: string;             // ISO timestamp
}
```

### `FeedEvent`

A single entry in the activity feed (`feed.jsonl`).

```typescript
interface FeedEvent {
  ts: string;                // ISO timestamp
  agent: string;             // Agent that caused the event
  type: FeedEventType;       // "join" | "leave" | "reserve" | "release" |
                             // "message" | "commit" | "test" | "edit" | "stuck"
  target?: string;           // File path, agent name, or other context
  preview?: string;          // Short preview text
}
```

### `MeshLifecycleHooks`

Hooks for reacting to mesh events. See [Lifecycle Hooks](hooks.md) for usage.

```typescript
interface MeshLifecycleHooks {
  onRegistered?(state: MeshState, ctx: ExtensionContext, actions: HookActions): void | Promise<void>;
  onRenamed?(state: MeshState, ctx: ExtensionContext, result: RenameResult): void | Promise<void>;
  onPollTick?(state: MeshState, ctx: ExtensionContext, actions: HookActions): void | Promise<void>;
  onShutdown?(state: MeshState): void;
}
```

### `HookActions`

Actions available to hooks for triggering mesh operations.

```typescript
interface HookActions {
  rename(newName: string): Promise<RenameResult>;
}
```

### `RenameResult`

Result of a rename operation (from `registry.ts`).

```typescript
interface RenameResult {
  success: boolean;
  oldName?: string;
  newName?: string;
  error?: string;  // "not_registered" | "invalid_name" | "same_name" | "name_taken" | "write_failed" | "race_lost" | "verify_failed"
}
```

## Types

### `AgentStatus`

```typescript
type AgentStatus = "active" | "idle" | "away" | "stuck";
```

Derived from agent activity. `"active"` means recent tool calls, `"idle"` means quiet but alive, `"away"` means no activity for a while, and `"stuck"` means idle beyond `stuckThreshold`.

### `FeedEventType`

```typescript
type FeedEventType =
  | "join" | "leave" | "reserve" | "release"
  | "message" | "commit" | "test" | "edit" | "stuck";
```

## Constants

Tuning constants exported from `types.ts`:

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_WATCHER_RETRIES` | `5` | Max retries when the inbox `fs.watch` fails |
| `MAX_CHAT_HISTORY` | `50` | Messages retained per chat conversation in the overlay |
| `WATCHER_DEBOUNCE_MS` | `50` | Debounce interval for inbox file change events |
| `REGISTRY_FLUSH_MS` | `10000` | How often the agent flushes its registry file to disk (10s) |
| `AGENTS_CACHE_TTL_MS` | `1000` | Cache duration for `mesh_peers` results (1s) |
| `EDIT_DEBOUNCE_MS` | `5000` | Debounce for tracking consecutive edits to the same file (5s) |
| `RECENT_WINDOW_MS` | `60000` | Time window for "recent" activity detection (60s) |

### `STATUS_INDICATORS`

Unicode indicators used in the overlay and context output:

```typescript
const STATUS_INDICATORS: Record<AgentStatus, string> = {
  active: "●",
  idle:   "○",
  away:   "◌",
  stuck:  "✕",
};
```
