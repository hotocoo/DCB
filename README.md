# TODO

LLMs: GPT-5 mini, roo/code-supernova

remind me to clean up the whole mess since its the agent doing every thing possible

# README

This repository contains a minimal Discord bot scaffold using discord.js v14.

Quick start

1. Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN` and `CLIENT_ID`.
2. Install dependencies:

```bash
npm install
```

3. Run the bot:

```bash
npm start
```

Notes

- The bot registers a `/ping` command. During development set `GUILD_ID` in the `.env` to register commands instantly to a test server. Without `GUILD_ID` commands are registered globally and can take up to an hour to appear.
- Node.js 18+ is recommended.

Advanced features

- Chat responder: DM or mention the bot to chat. The bot will prefer a local model if `LOCAL_MODEL_URL` is set, then OpenAI if `OPENAI_API_KEY` is set, otherwise a simple echo.
- Conversation memory: the bot keeps a short per-user conversation history (configurable via `CHAT_MAX_HISTORY`) and a rate-limiting cooldown (`CHAT_COOLDOWN_MS`). Send `!clear` to reset your conversation.
- Docker: a `Dockerfile` is included for running the bot in a container. Build with `docker build -t my-bot .` and run with environment variables set.

OpenWebUI (Windows + Docker Desktop)

If you run an OpenWebUI model on Windows (via Docker Desktop), follow these steps:

1. Start OpenWebUI and expose its API port (e.g., 9000). If using the published OpenWebUI image, it often uses port 9000.

```bash
docker run -d --name openwebui -p 9000:9000 your-openwebui-image
```

2. In your bot `.env`, set:

```env
LOCAL_MODEL_URL=http://host.docker.internal:9000
LOCAL_MODEL_API=openwebui
OPENWEBUI_PATH=/api/chat   # adjust if your OpenWebUI uses a different path
```

3. From the bot (running on host or in a container), the URL `http://host.docker.internal:9000/api/chat` will reach the OpenWebUI endpoint.

4. Deploy commands and run the bot:

```bash
npm run deploy
npm start
```

If OpenWebUI requires authentication or a different request/response shape, paste a working curl example and I will adapt the bot to match it exactly.

Environment variables

- `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID` — standard Discord setup.
- `LOCAL_MODEL_URL` — URL of your local model server (e.g., `http://host.docker.internal:8000`).
- `LOCAL_MODEL_API` — `openai-compatible` or `generic` (defaults to `openai-compatible`).
- `OPENAI_API_KEY` — fallback cloud model.
- `CHAT_MAX_HISTORY` — number of recent messages to keep (default 6).
- `CHAT_COOLDOWN_MS` — cooldown between chat messages per user (default 1500 ms).

Running

```bash
# register slash commands (recommended with GUILD_ID set for quick testing)
npm run deploy

# run the bot
npm start
```

# Notes
just testing fr im auto running whole repo only with llms

RPG & Minigames

- Minigames:
	- `/minigame guess` — number guess game (start and guess).
	- `/minigame type` — typing challenge: the bot posts a short sentence; type it exactly in the same channel within the time limit to win.

- RPG features:
	- `/rpg start` — create your character.
	- `/rpg fight` — fight a monster directly.
	- `/rpg explore` — explore and trigger random events (monster, treasure, trap, NPC) with optional model-driven narration.
	- `/rpg boss` — face a boss for big rewards.
	- `/rpg quest action:create|list|complete` — manage side quests.

Enjoy! If you want more minigames (trivia, memory, hangman) I can add them next.
