# Athena Roadmap

This document tracks what is on the roadmap, what is explicitly deferred, and what is intentionally out of scope.

## v0.1.5 — Next

### Likely
- Fix the `docker:build` / `docker:run` npm scripts to use the `athena-bot` image name (currently still `pulsebot`).
- Inline `LICENSE` copyright entity — change from "Pulse Bot Development Team" to "Athena Development Team" for consistency with the rebrand.
- Add a `scripts/dump-commands.mjs` + `scripts/generate-commands-doc.mjs` snapshot step to CI so `docs/COMMANDS.md` drift is caught early.
- Migrate `src/logger.js::console.log` to `process.stderr.write` so `dump-commands.mjs` doesn't need to monkey-patch `console`.

### Under consideration
- Persistence layer for `scheduler.js` so reminders survive a restart.
- Streamed `ephemeral` replies for long AI generations.
- Hot-reload of `src/commands/*.js` without a full restart (`node --watch` covers the source but not the deployed command list).

## Deferred

### SQLite migration
- `better-sqlite3` is declared in `package.json` and the schema is documented in `database-schema.md`, but no code currently opens a SQLite connection.
- The migration would touch: `src/storage.js`, `src/rpg.js`, `src/economy.js`, `src/moderation.js`, `src/trading.js`, `src/guilds.js`, `src/achievements.js`, `src/profiles.js`, `src/scheduler.js`.
- Trigger: when JSON files in `data/` grow past ~10 MB or the write contention becomes noticeable.
- Owner: TBD.

### HTTP API / dashboard
- Earlier docs mentioned a 3000-port dashboard. That work was scoped out before v0.1.0 and is not on the active roadmap.
- If revived, the dashboard would expose read-only stats (balance, mod log, leaderboards) and a message-broadcast endpoint.

### Sharded deployment
- Single-process today. Discord recommends sharding at ~2,500 guilds.
- Trigger: when the bot joins > 1,000 guilds in a single deployment.

## Out of Scope

- **Web3 / NFT integration** — not aligned with the project's offline-first Discord-only model.
- **Voice recognition** — Discord's voice-data policies and the lack of a stable, license-clean ASR model make this a non-starter.
- **Self-hosted image generation** — the dependency footprint (Stable Diffusion + GPU SDK) is too heavy for a Discord bot use case.
- **Multi-tenant brand theming** — the bot is single-instance, single-brand.

## How to Propose a Change

1. Open a GitHub issue with the `[roadmap]` tag.
2. State the user-visible problem, the constraint, and the proposed solution.
3. Indicate which "in / next / deferred / out-of-scope" bucket it should land in.
4. A maintainer will move it into the appropriate section or explain why it stays out of scope.

## Versioning Cadence

- **Patch** (0.1.x) — bug fixes, doc refreshes, lint-only changes.
- **Minor** (0.x.0) — new commands, new modules, new providers, no breaking config changes.
- **Major** (x.0.0) — breaking schema changes, storage engine swap, or anything that requires a manual migration.

Bug-hunt only cycles (e.g. v0.1.2, v0.1.3, v0.1.4) bump the patch number.
