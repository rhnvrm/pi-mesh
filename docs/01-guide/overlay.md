# Overlay

The mesh overlay is a TUI panel for monitoring and communicating with other agents. Open it with the `/mesh` command.

## Tabs

The overlay has three tabs. Press **Tab** to cycle between them.

### Agents

Live status of every registered agent. Each entry shows:

- Agent name and model
- Current Git branch
- What they're working on (derived from recent tool calls)
- Any file reservations they hold
- Idle time

### Feed

A scrollable timeline of mesh events in reverse chronological order:

- Agent joins and departures
- File edits and commits
- Messages sent between agents
- Reservation changes

The feed reads from `.pi/mesh/feed.jsonl`. The number of entries retained is controlled by the `feedRetention` config setting.

### Chat

Send messages to other agents directly from the overlay.

- Type `@name message` to send a direct message to a specific agent
- Type without an `@mention` to broadcast to all agents
- Press **Tab** after `@` to autocomplete agent names from the registry

Messages sent from the Chat tab are delivered as normal (non-urgent) messages.

## Keybindings

| Key | Action |
|-----|--------|
| Tab | Switch between Agents / Feed / Chat tabs |
| ↑ ↓ | Scroll within the current tab |
| Esc | Close the overlay |
| Enter | Send message (in Chat tab) |
| Tab (in input) | Autocomplete `@mention` names |
