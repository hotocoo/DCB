# Athena Testing

The bot ships with a custom Node-`assert` test runtime (no vitest, no jest, no mocha) so the test suite can run anywhere Node runs without a transpile step.

## Quick Reference

```bash
npm test                  # full 38-case suite
npm run test:unit         # token-extraction unit test
npm run test:rpg          # RPG standalone test
npm run test:integration  # button-interaction handler coverage
npm run test:imports      # ESM import smoke test (every src/*.js loadable)
npm run lint              # ESLint gate (0 errors target)
npm run build             # lint + tests (fast)
npm run build:strict      # lint + format:check + tests (full audit)
```

The `npm test` script is the source of truth: 38 cases across 5 module groups. The other `test:*` scripts are narrower smoke tests for specific subsystems.

## Suite Structure

The primary runner is `tests/comprehensive-tests.js`. It is structured as a class `ComprehensiveTestSuite` with five groups:

| Group | Module | Coverage |
|-------|--------|----------|
| 💰 Economy | `src/economy.js` | balance, transfer, market, buy, sell, investment |
| 🛡️ Moderation | `src/moderation.js` | warn, mute, isUserMuted, auto-mod, stats |
| ⚔️ RPG | `src/rpg.js` | create, xp, inventory, retrieval, deletion |
| 🎵 Music | `src/music.js` | search, queue, pause, stop |
| 🔗 Integrations | cross-module | RPG-economy integration, XSS, SQL-injection sanitization |
| 🚨 Error handling | `src/validation.js`, `src/errorHandler.js` | string/number/user-id validation, rate limiter, insufficient-funds rejection |

User IDs are timestamped (`testuser_<ms>_<n>`) so reruns do not collide with persisted state in `data/`.

## What is NOT covered

- **Slash command execution** — the test suite exercises the underlying modules, not the Discord API path. Discord interaction mocks are out of scope.
- **Music playback** — the suite tests search + queue + pause + stop, but not the actual audio stream (Discord voice connection is not mockable).
- **AI providers** — the AI client is exercised only for input-validation errors; live OpenAI / local-model calls are not in CI.
- **Long-running scheduler** — the scheduler's `setTimeout` queue is not exercised.
- **Storage corruption** — the backup-from-corruption path is documented but not asserted.

## Adding a New Test

1. Decide which group the test belongs to (`economy`, `moderation`, `rpg`, `music`, `integration`, `error`).
2. Add the test in the corresponding section of `tests/comprehensive-tests.js` using the existing `this.log('✅ …')` / `this.logError('❌ …', e)` pattern.
3. Import the new module functions at the top of the file.
4. Run `npm test` and confirm the count moves from 38 → 39.

For subsystem tests (`tests/rpg.test.js`, `tests/test-button-interactions.js`, `tests/test-music-*.js`, etc.), follow the same pattern but isolate the test file with its own runner. Do not depend on globals.

## Local Test Workflow

```bash
# Make changes
$EDITOR src/foo.js

# Quick check
npm run lint
npm test

# Slower gate (catches prettier drift)
npm run build:strict
```

## Continuous Integration

The `husky` pre-commit hook runs `npm run lint && npm test`. This is the same gate as `npm run build` and is the project's enforced quality bar.

## Pitfalls

- **Stale data files.** If `data/economy.json` already contains test users from a prior run, new tests will see positive balances. The suite handles this by using timestamped user IDs. If you add a test that doesn't, isolate it.
- **Discord snowflake shape.** `errorHandler.js` validates that user IDs are 17–19 digits. Fake IDs in tests must match this shape or the validation will reject them.
- **MusicManager side effects.** Importing `src/music.js` initialises the FFmpeg path probe and (if creds are set) starts Spotify token refresh. Tests run without these credentials, so this is safe — but if you add a test that imports music, expect the side effects.
