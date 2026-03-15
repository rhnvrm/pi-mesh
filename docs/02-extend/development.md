# Development

## Getting started

```bash
git clone https://github.com/rhnvrm/pi-mesh.git
cd pi-mesh
bun install
bun test
```

pi-mesh has peer dependencies on `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, and `@sinclair/typebox`. For development, install them as dev dependencies:

```bash
bun add --dev @mariozechner/pi-coding-agent @mariozechner/pi-tui @sinclair/typebox
```

## Testing changes locally

To test your changes against a real Pi session, link the local package:

```bash
# From a project that uses pi-mesh
pi install /path/to/pi-mesh
```

This points Pi at your local copy instead of the npm version. Open two Pi sessions in the same project to verify coordination works.

## Project structure

| File | Purpose |
|------|---------|
| `index.ts` | Extension entry point — registers tools, hooks, and the overlay command |
| `registry.ts` | Agent registration — writes/reads/cleans registry files in `.pi/mesh/registry/` |
| `messaging.ts` | Message delivery — writes inbox files, watches for incoming messages via `fs.watch` |
| `reservations.ts` | File locking — manages reservations, checks conflicts on `edit`/`write` hooks |
| `tracking.ts` | Activity tracking — monitors tool calls, commits, and test runs to derive status |
| `overlay.ts` | TUI overlay — renders the `/mesh` panel with Agents, Feed, and Chat tabs |
| `feed.ts` | Activity feed — appends events to `feed.jsonl`, reads and trims old entries |
| `config.ts` | Config loading — merges project, user, and default settings |
| `types.ts` | All TypeScript types, interfaces, and constants (see [API reference](api.md)) |

The extension hooks into Pi at startup via `index.ts`. It registers the five mesh tools (`mesh_peers`, `mesh_reserve`, `mesh_release`, `mesh_send`, `mesh_manage`), wraps `edit` and `write` to enforce reservations, and adds the `/mesh` overlay command.

## Tests

```bash
bun test                              # all tests
bun test tests/config.test.ts         # specific file
```

| Test file | Covers |
|-----------|--------|
| `config.test.ts` | Config loading and merging logic |
| `registry.test.ts` | Agent registration, name collision fallback, rename behavior |
| `renderer.test.ts` | Overlay rendering and display formatting |
| `reservations.test.ts` | Reservation conflict detection and path matching |
| `tracking.test.ts` | Activity tracking and status derivation |

No integration tests yet — the test suite covers config, registry, rendering, reservations, and tracking in isolation. Manual testing with two Pi sessions is the way to verify end-to-end behavior for now.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to `main` and on pull requests. It installs peer dependencies and runs `bun test`.

On version tags (`v*`), CI also verifies the tag matches `package.json`, publishes to npm, and creates a GitHub release.

## Releasing

```bash
npm version patch   # bumps package.json and creates a v* tag
git push --follow-tags
```

CI picks up the tag and handles the npm publish.
