# Athena Development

Local development workflow, debug tips, and common pitfalls.

## First-Time Setup

```bash
# 1. Clone & install
git clone https://github.com/hotocoo/DCB.git
cd DCB
npm install

# 2. Configure
cp .env.template .env
$EDITOR .env   # set DISCORD_TOKEN, CLIENT_ID, GUILD_ID at minimum

# 3. Deploy slash commands (one-time)
npm run deploy

# 4. Boot in dev mode (auto-reload on src/*.js changes)
npm run dev
```

For module-level debugging, `npm run dev:debug` enables the Node inspector on `--inspect`.

## Project Conventions

- **Language:** JavaScript ES2022+ (ESM). No TypeScript.
- **Indent:** 2 spaces. Stroustrup brace style.
- **Quotes:** single quotes. Always-semicolons.
- **Trailing commas:** only on multi-line collections.
- **Imports:** alphabetised within groups, with a blank line between `node:*` and relative imports.
- **Naming:** `camelCase` for variables/functions, `PascalCase` for classes, `SCREAMING_SNAKE_CASE` for module-level constants.
- **Paths:** always `node:` prefixed (`import fs from 'node:fs'`).
- **Comments:** JSDoc on every exported function; in-line `//` for non-obvious blocks.
- **Lint:** `npm run lint` — 0 errors target. Warnings are accepted (stylistic only).
- **Format:** `npm run format` to apply prettier (rare, see TESTING.md).

## Common Tasks

### Adding a new slash command

1. Create `src/commands/<name>.js`:

   ```js
   import { SlashCommandBuilder } from 'discord.js';
   import { safeExecuteCommand } from '../errorHandler.js';

   export const data = new SlashCommandBuilder()
     .setName('mycommand')
     .setDescription('What it does')
     .addStringOption(option =>
       option.setName('input').setDescription('User input').setRequired(true));

   export async function execute(interaction) {
     await safeExecuteCommand(interaction, async () => {
       const input = interaction.options.getString('input');
       await interaction.reply(`Got: ${input}`);
     });
   }
   ```

2. Run `npm run deploy` to register the command with Discord.
3. Run `npm test` to confirm nothing regressed.
4. Update `docs/COMMANDS.md` — either regenerate from `scripts/dump-commands.mjs` + `scripts/generate-commands-doc.mjs` or hand-edit if the change is one command.

### Adding a new feature module

1. Create `src/<feature>.js` with named exports.
2. If the module needs persistence, add a `data/<feature>.json` and wire atomic writes via `src/storage.js`.
3. Add the module to `src/commandLoader.js` if a command depends on it (only required for commands that don't auto-import).
4. Add a test group in `tests/comprehensive-tests.js` if the module has side effects worth covering.

### Modifying an existing command

1. Read the implementation first (`src/commands/<name>.js`).
2. If the change touches persistence, grep for all callers of the relevant storage function with `search_files` (or the `rtk grep` shortcut).
3. Add a test case in `tests/comprehensive-tests.js` if the change adds a new code path.
4. Run `npm run lint && npm test`.

## Debugging

### "My command doesn't respond"

- **Was it deployed?** `npm run deploy` registers the command with Discord. The dev server doesn't auto-deploy.
- **Is the `data` export correct?** It must be a `SlashCommandBuilder` instance with a unique `name`.
- **Did the executor throw?** Check `logs/bot-YYYY-MM-DD.log`. `safeExecuteCommand` logs the error and the user_message field.
- **Did the interaction expire?** Discord interactions expire after 3 seconds. Use `interaction.deferReply()` if your command takes longer than that.

### "Storage writes seem to disappear"

- The atomic write is `tmp + rename`. If the rename fails (e.g. disk full), the original file is untouched.
- Check `data/<domain>.json.backup` — it's created before every write.
- If the file is malformed, the read path falls back to the backup. Inspect both files.

### "Music won't play"

- Verify `ffmpeg-static` is installed (`ls node_modules/ffmpeg-static/ffmpeg`).
- Check `src/music.js` for the `libsodium-wrappers` import — if it throws, the voice connection won't establish.
- For Spotify, you need `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`. Without them, the bot falls back to YouTube search and Deezer previews.

### "AI gives me nothing"

- Check `OPENAI_API_KEY` (or `LOCAL_MODEL_URL` for a local provider).
- Look at `process.env.AI_MAX_TOKENS` — if it's too low, the response is truncated.
- `process.env.AI_TEMPERATURE` defaults to `0.8`; raise to `1.0` for more creative responses.
- `CHAT_COOLDOWN_MS` defaults to 2000 ms per user; rapid-fire requests will be rate-limited.

### "Tests pass but production breaks"

- The test suite stubs out the Discord API. Anything that depends on the gate (slash command execution, voice connections) is not covered.
- Run `npm run dev` and exercise the path manually before pushing.

## Pitfalls

- **Don't log PII.** The logger writes to `logs/`. Discord snowflakes are fine; user messages and tokens are not.
- **Don't `console.log` in `src/`.** Use `logger.info` / `logger.debug` / `logger.warn` / `logger.error`. The `no-console` lint rule warns on `console.*` in source.
- **Don't `process.exit()` in tests.** Use `return process.exit()` so the unref'd timer doesn't block shutdown. The `unicorn/no-process-exit` rule warns on bare `process.exit`.
- **Don't use `null` literals.** Use `undefined` (or a sentinel). The `unicorn/no-null` rule warns on `null`.
- **Don't use `==` for comparison.** Always `===` / `!==`. The `eqeqeq` rule is enforced.
- **Don't `await` inside array `forEach`.** Use `for...of` (or `Promise.all(map(...))`). The `no-await-in-loop` rule warns on `await` inside a `for` loop iteration.
- **Don't catch errors silently.** Let `safeExecuteCommand` handle it, or re-throw with context.
- **Don't add a new `process.env.*` without updating `.env.template`.** The template is the source of truth for which env vars are read.

## Releasing

1. Bump `version` in `package.json`, `src/index.js` `@version`, and `src/chat.js` (`@version` + 4 `User-Agent` headers + 1 status message).
2. Update `README.md → Recent Updates & Fixes` and `CHANGELOG.md`.
3. Run `npm run build` and `npm run build:strict` separately.
4. `git commit -m "vX.Y.Z: short summary"` and `git push origin main`.
5. Tag: `git tag vX.Y.Z && git push --tags origin main`.
