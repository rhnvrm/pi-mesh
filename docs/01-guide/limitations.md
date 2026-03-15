# Limitations

Things pi-mesh doesn't handle, or handles imperfectly.

## `bash` bypasses reservations

Reservation enforcement hooks Pi's `edit` and `write` tools. If an agent uses `bash` to modify files (e.g., `sed -i`, `echo >`, or any shell command that writes directly), pi-mesh has no way to intercept it.

In practice, well-instructed agents use `edit` and `write` for file modifications. But if your agents frequently shell out for edits, reservations won't fully protect you.

## Concurrent feed writes

Multiple agents appending to `feed.jsonl` simultaneously can produce partial or malformed JSON lines. pi-mesh handles this gracefully — malformed lines are skipped when reading the feed. You might occasionally see a missing event, but it won't break anything.

## PID checking across containers

Stale agent cleanup relies on checking whether a process ID is still alive using OS-level signals. This doesn't work when agents run in different containers or on different machines, since PIDs are scoped to the container's PID namespace.

In containerized setups, stale registrations may persist until manually cleaned up or until the mesh directory is reset.

## Stale registrations after crashes

When an agent crashes or is killed without a clean shutdown, its registry entry remains on disk. These stale entries are cleaned up automatically — but only when another agent calls `mesh_peers`, which triggers PID validation.

Between the crash and the next `mesh_peers` call, other agents may still see the dead agent as active.
