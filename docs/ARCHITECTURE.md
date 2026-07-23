# Athena Architecture

This document describes the runtime model, request/response flow, and storage lifecycle of the Athena Discord bot. It is the authoritative reference for how the pieces fit together; if behaviour diverges from this document, update the document.

## High-Level Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Discord Gateway                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                │                                          │
                │ (slash command / chat input)             │ (button / modal / select)
                ▼                                          ▼
┌────────────────────────────────────┐    ┌────────────────────────────────────┐
│  src/commandLoader.js              │    │  src/interactionHandlers.js         │
│  loads src/commands/*.js at boot   │    │  central button/modal dispatcher    │
└────────────────────────────────────┘    └────────────────────────────────────┘
                │                                          │
                ▼                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Per-command execute(interaction)                     │
│   • CommandError + safe-reply (src/errorHandler.js)                         │
│   • Rate limiter (rate-limiter-flexible, per user/guild)                    │
│   • Input validation (src/validation.js)                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Feature Modules (src/)                              │
│   rpg.js · economy.js · moderation.js · music.js · trading.js                 │
│   scheduler.js · achievements.js · aiassistant.js · chat.js                  │
│   model-client.js · entertainment.js · integrations.js · weather.js · ...    │
└─────────────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             Storage Layer (src/storage.js)                   │
│   • JSON files in data/ (primary)                                           │
│   • Atomic write (tmp file + rename)                                        │
│   • Size cap (50MB), backup-before-write, JSON-strict restore from backup     │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Boot Sequence

1. **Module entry** — `src/index.js` requires `dotenv/config` (loads `.env`), constructs the Discord `Client` with the required `GatewayIntentBits` and `Partials`.
2. **Logger init** — `src/logger.js` initialises the rotating daily log file under `logs/`, attaches `process.on('unhandledRejection')` and `process.on('uncaughtException')` handlers.
3. **Storage init** — `src/storage.js` exports `initializeDatabase()` which ensures `data/` exists and pre-loads the JSON files used at startup.
4. **Command loading** — `src/commandLoader.js` walks `src/commands/*.js`, dynamically `import()`s each, and registers the `data` (SlashCommandBuilder) and `execute` (handler) into a `Collection` keyed by command name. Files that fail to load are logged but do not abort the boot.
5. **Handler wiring** — `src/index.js` calls `client.on('interactionCreate', handleInteraction)` (the dispatcher) and `client.on('messageCreate', …)` for legacy `!`-prefix chat commands.
6. **Login** — `client.login(DISCORD_TOKEN)`. If the token is missing, the process exits with a clear error.

## Request Flows

### Slash command

```
User types /rpg fight
  → Discord Gateway
  → client.on('interactionCreate')
  → handleInteraction (src/interactionHandlers.js or src/commandLoader.js dispatch)
  → command.execute(interaction)
      ├── validate input (validation.js)
      ├── check rate limiter (rate-limiter-flexible)
      ├── read/write JSON via storage.js
      └── safeReply / safeEditReply (errorHandler.js)
  → Discord API (reply or deferred update)
```

### Button / modal / select

```
User clicks a button (customId: 'rpg_explore:1234567890')
  → Discord Gateway
  → client.on('interactionCreate')
  → handleInteraction (src/interactionHandlers.js)
      ├── parse customId (split by ':')
      ├── route to the matching handler (e.g. exploreContinue)
      └── safeUpdate / safeReply
  → Discord API
```

The `interactionHandlers.js` file is the central dispatcher for every non-slash interaction. It must handle every registered `customId` prefix; if a prefix is missing, the button/modal becomes a silent no-op (logged at `warn`).

### Legacy `!`-prefix chat

`src/chat.js` exposes `!status`, `!commands`, `!help <topic>`, and the `!ask <question>` AI passthrough. The dispatcher is `src/index.js` → `client.on('messageCreate')`. These are convenience routes for users who can't use slash commands.

## Module Responsibilities

| Module | Responsibility |
|--------|----------------|
| `src/index.js` | Boot, lifecycle, graceful shutdown, signal handling |
| `src/commandLoader.js` | Dynamic command loading into a `Collection` |
| `src/interactionHandlers.js` | Central button / modal / select dispatcher |
| `src/rpg.js` | Character progression, inventory, fight, explore |
| `src/economy.js` | Balance, transfer, market, investment, business |
| `src/moderation.js` | Warn, mute, ban, kick, auto-mod, stats |
| `src/music.js` | Multi-source audio streaming |
| `src/trading.js` | Player-to-player trades, auctions |
| `src/scheduler.js` | Reminders, events, cron-style schedules |
| `src/aiassistant.js` | Slash-command AI (`/ai`) with model switching |
| `src/chat.js` | Legacy `!`-prefix chat + global OpenAI key |
| `src/model-client.js` | OpenAI-compatible / Open WebUI HTTP client |
| `src/validation.js` | Single source of truth for input validation |
| `src/errorHandler.js` | `CommandError`, circuit breaker, safe reply |
| `src/storage.js` | Atomic JSON file I/O with backups |
| `src/logger.js` | Structured logging with file rotation |
| `src/cooldowns.js` | Per-user cooldown tracking |
| `src/profiles.js` | User profile data |
| `src/achievements.js` | Achievement definitions + progress |
| `src/integrations.js` | News, jokes, facts APIs |
| `src/guilds.js` | Guild definitions, parties, leaderboards |
| `src/locations.js` | RPG locations and exploration |
| `src/entertainment.js` | Fun stats, joke ratings |
| `src/customcommands.js` | Per-guild custom commands |

## Storage

### Currently active

- **Type:** JSON files under `data/`.
- **Layout:** one file per domain (`economy.json`, `moderation.json`, `guilds.json`, `entertainment.json`, `integrations.json`, `locations.json`, `cooldowns.json`, `trades.json`, `schedules.json`, `profiles.json`, `achievements.json`), plus `data/players/<userId>.json` for individual RPG characters.
- **Atomicity:** `src/storage.js` writes to a temp file then renames atomically. `MAX_FILE_SIZE = 50 * 1024 * 1024` rejects oversize writes. Before each write, a `*.backup` copy is created.
- **Corruption recovery:** `JSON.parse` is wrapped in strict mode; if the parsed value is not an object/array, the read falls back to the `.backup` file.
- **Concurrency:** in-process mutation is mutex-style per file (no concurrent writes to the same file within the same process). Multi-process use is **not** supported.

### Planned but not yet active

- **SQLite** via `better-sqlite3` (declared in `package.json`, never imported). See `database-schema.md` for the target schema and `migration-plan.md` for the migration plan. No migration is scheduled.

### Scheduler persistence

The scheduler (`src/scheduler.js`) uses an in-memory `setTimeout` queue. **Restarting the bot drops any pending reminders that haven't fired yet.** Persisted backup of the queue is on the roadmap.

## Error Handling

- `errorHandler.js` exports `CommandError` (richer than `Error` with a `userMessage` field), `safeExecuteCommand` (wraps every command execution with logging + circuit breaker), and `safeReply` / `safeUpdate` / `safeFollowUp` helpers that handle Discord's "already replied" / "interaction expired" states.
- Every command file calls `safeExecuteCommand(interaction, () => execute(interaction))` (or the equivalent) so a thrown error becomes a user-facing message instead of a silent failure.
- `Object.hasOwn()` guards on every dynamic-key bracket access in `moderation.js`, `customcommands.js`, `rpg.js`, and `trading.js` prevent prototype-pollution style attacks.

## Rate Limiting

`rate-limiter-flexible`'s `RateLimiterMemory` is used in `src/music.js`, `src/commands/weather.js`, and `src/model-client.js`. Limits are configured per-module because the cost of each action is different (music search vs. AI inference vs. weather fetch).

## Logging

- Daily rotating files: `logs/bot-YYYY-MM-DD.log`.
- Buffered flush: every 5 s or when 100 entries are queued.
- Colored output to stdout (stderr in test scripts).
- `logger.cleanup()` is called explicitly by `src/index.js` `gracefulShutdown()` so the buffer is flushed before the process exits.

## What This Document Does Not Cover

- Discord bot best practices — see the discord.js guide.
- AI provider configuration — see `.env.template` and `README.md → Configuration`.
- Migration to SQLite — see `database-schema.md` and `migration-plan.md`.
