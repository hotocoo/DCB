# Athena Command Reference

> **Auto-generated** from `src/commands/*.js` using the `SlashCommandBuilder` metadata.
> If a command is added or removed, regenerate this file — see the snippet at the bottom.

**Total commands: 35**

## Categories

The `/help` command groups commands into these buckets:

- **rpg** (15): `/rpg`, `/explore`, `/trivia`, `/tictactoe`, `/connect4`, `/hangman`, `/memory`, `/guess`, `/coinflip`, `/rps`, `/8ball`, `/roll`, `/minigame`, `/fun`, `/wordle`
- **utility** (12): `/ping`, `/echo`, `/help`, `/setmodel`, `/togglechat`, `/toggleplay`, `/remind`, `/poll`, `/weather`, `/music`, `/profile`, `/api`
- **chat** (1): `/ai`
- **admin** (7): `/admin`, `/guild`, `/achievements`, `/economy`, `/inventory`, `/trade`, `/novel`

---

## Full Reference

### `/8ball`
_Ask the magic 8-ball a question_

<sub>src/commands/`8ball.js`</sub>

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `question` | string | ✅ | Your question |

### `/achievements`
_View achievements, stats, and leaderboards_

<sub>src/commands/`achievements.js`</sub>

No options.

### `/admin`
_Advanced server administration and moderation tools_

<sub>src/commands/`admin.js`</sub>

#### Subcommand: `admin ban`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `user` | user | ✅ | User to ban |
| `reason` | string | ✅ | Ban reason |
| `duration` | integer | — | Duration in hours (leave empty for permanent) |

#### Subcommand: `admin check`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `user` | user | ✅ | User to check |

#### Subcommand: `admin history`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `limit` | integer | — | Number of actions to show |

#### Subcommand: `admin kick`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `user` | user | ✅ | User to kick |
| `reason` | string | ✅ | Kick reason |

#### Subcommand: `admin mute`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `user` | user | ✅ | User to mute |
| `reason` | string | ✅ | Mute reason |
| `duration` | integer | — | Duration in minutes |

#### Subcommand: `admin unban`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `user` | user | ✅ | User to unban |
| `reason` | string | — | Unban reason |

#### Subcommand: `admin unmute`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `user` | user | ✅ | User to unmute |
| `reason` | string | — | Unmute reason |

#### Subcommand: `admin warn`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `user` | user | ✅ | User to warn |
| `reason` | string | ✅ | Warning reason |
| `severity` | string | — | Warning severity |

### `/ai`
_Advanced AI assistant with multiple models and personalities_

<sub>src/commands/`ai.js`</sub>

#### Subcommand: `ai analyze`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `text` | string | ✅ | Text to analyze |

#### Subcommand: `ai chat`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `message` | string | ✅ | Your message |
| `model` | string | — | AI model to use |
| `personality` | string | — | AI personality |

#### Subcommand: `ai code`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `language` | string | ✅ | Programming language |
| `description` | string | ✅ | Code description |

#### Subcommand: `ai ideas`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `topic` | string | ✅ | Topic for ideas |
| `count` | integer | — | Number of ideas |

#### Subcommand: `ai summarize`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `text` | string | ✅ | Text to summarize |
| `length` | integer | — | Max summary length |

#### Subcommand: `ai translate`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `text` | string | ✅ | Text to translate |
| `language` | string | ✅ | Target language |

### `/api`
_External API integrations - news, jokes, facts, and more_

<sub>src/commands/`api.js`</sub>

#### Subcommand: `api github`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `username` | string | ✅ | GitHub username |

#### Subcommand: `api news`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `query` | string | — | Search topic |

#### Subcommand: `api numberfact`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `number` | integer | — | Number (1-1000, random if not specified) |

#### Subcommand: `api weather`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `location` | string | ✅ | Location |

### `/coinflip`
_Flip a coin and get heads or tails_

<sub>src/commands/`coinflip.js`</sub>

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `count` | integer | — | Number of coins to flip (1-10) |

### `/connect4`
_Play Connect Four - strategic dropping game_

<sub>src/commands/`connect4.js`</sub>

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `opponent` | user | ✅ | Player to challenge |
| `difficulty` | string | — | AI difficulty (if playing against AI) |

### `/echo`
_Echoes the provided text_

<sub>src/commands/`echo.js`</sub>

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `text` | string | ✅ | Text to echo |

### `/economy`
_Advanced economy system with banking, businesses, and marketplace_

<sub>src/commands/`economy.js`</sub>

#### Subcommand: `economy balance`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `user` | user | — | User to check |

#### Subcommand: `economy business`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `action` | string | ✅ | create|collect|list|upgrade |
| `type` | string | — | shop|farm|mine|factory|bank|casino|restaurant|tech|trading |
| `investment` | integer | — | Initial investment amount |
| `business_id` | string | — | Business ID to upgrade |

#### Subcommand: `economy history`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `limit` | integer | — | Number of transactions |

#### Subcommand: `economy lottery`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `ticket_price` | integer | ✅ | Ticket price |

#### Subcommand: `economy market`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `action` | string | ✅ | buy|sell|prices |
| `item` | string | — | Item to buy/sell |
| `quantity` | integer | — | Quantity |

#### Subcommand: `economy transfer`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `user` | user | ✅ | User to transfer to |
| `amount` | integer | ✅ | Amount to transfer |

### `/explore`
_Explore epic RPG locations and dungeons_

<sub>src/commands/`explore.js`</sub>

#### Subcommand: `explore discover`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `location` | string | ✅ | Location to discover |

#### Subcommand: `explore enter`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `location` | string | ✅ | Location to explore |

### `/fun`
_Entertainment and fun commands - jokes, stories, riddles, and more_

<sub>src/commands/`fun.js`</sub>

#### Subcommand: `fun 8ball`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `question` | string | ✅ | Your question |

#### Subcommand: `fun challenge`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `type` | string | — | Challenge type |

#### Subcommand: `fun fact`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `category` | string | — | Fact category |

#### Subcommand: `fun joke`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `category` | string | — | Joke category |

#### Subcommand: `fun leaderboard`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `category` | string | — | Leaderboard category |

#### Subcommand: `fun name`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `type` | string | — | Name type |

#### Subcommand: `fun quote`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `category` | string | — | Quote category |

#### Subcommand: `fun riddle`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `difficulty` | string | — | Riddle difficulty |

#### Subcommand: `fun story`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `prompt` | string | ✅ | Story prompt |
| `genre` | string | — | Story genre |

### `/guess`
_Play number guessing game with multiple difficulty levels_

<sub>src/commands/`guess.js`</sub>

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `difficulty` | string | — | Game difficulty |
| `custom_min` | integer | — | Custom minimum number |
| `custom_max` | integer | — | Custom maximum number |

### `/guild`
_Manage guilds and parties for multiplayer RPG_

<sub>src/commands/`guild.js`</sub>

#### Subcommand: `guild create`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `name` | string | ✅ | Guild name |

#### Subcommand: `guild join`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `name` | string | ✅ | Guild name |

#### Subcommand: `guild party`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `action` | string | ✅ | create|join|leave |
| `party_id` | string | — | Party ID (for join) |

### `/hangman`
_Play a game of Hangman!_

<sub>src/commands/`hangman.js`</sub>

#### Subcommand: `hangman guess`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `letter` | string | ✅ | The letter to guess |

### `/help`
_Shows comprehensive help about all bot features_

<sub>src/commands/`help.js`</sub>

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `category` | string | — | Specific category to show help for |

### `/inventory`
_Manage your RPG inventory and equipment_

<sub>src/commands/`inventory.js`</sub>

#### Subcommand: `inventory equip`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `item` | string | ✅ | Item to equip |

#### Subcommand: `inventory unequip`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `slot` | string | ✅ | weapon|armor |

#### Subcommand: `inventory use`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `item` | string | ✅ | Item to use |

### `/memory`
_Play a memory matching card game_

<sub>src/commands/`memory.js`</sub>

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `difficulty` | string | — | Game difficulty |

### `/minigame`
_Play a quick minigame_

<sub>src/commands/`minigame.js`</sub>

#### Subcommand: `minigame guess`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `number` | integer | — | Your guess |

#### Subcommand: `minigame type`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `novel` | string | — | Novel ID to source sentence from |

### `/music`
_🎵 Athena Music System - YouTube & Spotify Priority!_

<sub>src/commands/`music.js`</sub>

#### Subcommand: `music loop`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `mode` | string | ✅ | Loop mode |

#### Subcommand: `music lyrics`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `song` | string | ✅ | Song name |

#### Subcommand: `music play`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `query` | string | ✅ | Song name or URL |

#### Subcommand: `music radio`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `station` | string | ✅ | Radio station |

#### Subcommand: `music search`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `query` | string | ✅ | Search term |

#### Subcommand: `music volume`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `level` | integer | ✅ | Volume level |

### `/novel`
_Light novel features_

<sub>src/commands/`novel.js`</sub>

#### Subcommand: `novel create`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `title` | string | — | Title |
| `prompt` | string | — | Initial prompt/context |

#### Subcommand: `novel next`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `id` | string | ✅ | Novel ID |

#### Subcommand: `novel read`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `id` | string | ✅ | Novel ID |
| `chapter` | integer | — | Chapter number |

### `/ping`
_Replies with Pong! and latency_

<sub>src/commands/`ping.js`</sub>

No options.

### `/poll`
_Create an interactive poll with up to 4 options_

<sub>src/commands/`poll.js`</sub>

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `question` | string | ✅ | The poll question |
| `option1` | string | ✅ | First option |
| `option2` | string | ✅ | Second option |
| `option3` | string | — | Third option (optional) |
| `option4` | string | — | Fourth option (optional) |
| `duration` | integer | — | Duration in minutes (1-60, default: 10) |

### `/profile`
_Advanced user profile management and statistics_

<sub>src/commands/`profile.js`</sub>

#### Subcommand: `profile compare`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `user` | user | ✅ | User to compare with |

#### Subcommand: `profile leaderboard`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `category` | string | ✅ | Category |
| `stat` | string | ✅ | Statistic |

#### Subcommand: `profile search`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `query` | string | ✅ | Search term |

#### Subcommand: `profile view`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `user` | user | — | User to view (defaults to yourself) |

### `/remind`
_Advanced reminder and scheduling system_

<sub>src/commands/`remind.js`</sub>

#### Subcommand: `remind cancel`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `type` | string | ✅ | reminder or event |
| `id` | string | ✅ | ID to cancel |

#### Subcommand: `remind event`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `title` | string | ✅ | Event title |
| `description` | string | ✅ | Event description |
| `when` | string | ✅ | When the event starts |
| `duration` | integer | — | Duration in minutes (default: 60) |
| `max_participants` | integer | — | Maximum participants (0 for unlimited) |

#### Subcommand: `remind me`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `when` | string | ✅ | When to remind you (e.g., "in 30 minutes", "tomorrow 3pm") |
| `what` | string | ✅ | What to remind you about |
| `title` | string | — | Reminder title |

#### Subcommand: `remind upcoming`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `days` | integer | — | Days to look ahead (default: 7) |

### `/roll`
_Roll dice in NdM format, e.g., 2d6_

<sub>src/commands/`roll.js`</sub>

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `dice` | string | — | Dice expression (e.g., 2d6, 1d20) |

### `/rpg`
_Play an enhanced RPG with character classes_

<sub>src/commands/`rpg.js`</sub>

#### Subcommand: `rpg craft`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `item` | string | ✅ | Item to craft |

#### Subcommand: `rpg levelup`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `stat` | string | ✅ | hp|mp|maxhp|maxmp|atk|def|spd |
| `amount` | integer | ✅ | How many points to spend |

#### Subcommand: `rpg quest`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `action` | string | ✅ | create|list|complete |
| `title` | string | — | Quest title |
| `id` | string | — | Quest id to complete |
| `desc` | string | — | Quest description |

#### Subcommand: `rpg reset`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `class` | string | — | New character class |

#### Subcommand: `rpg start`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `name` | string | — | Character name |
| `class` | string | — | Character class |

### `/rps`
_Play rock-paper-scissors against the bot_

<sub>src/commands/`rps.js`</sub>

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `choice` | string | ✅ | Your choice |

### `/setmodel`
_Set the model URL for this guild_

<sub>src/commands/`setmodel.js`</sub>

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `url` | string | ✅ | Model base URL |
| `api` | string | — | API type (openai-compatible|openwebui|generic) |

### `/tictactoe`
_Play Tic-Tac-Toe against another player or AI_

<sub>src/commands/`tictactoe.js`</sub>

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `opponent` | user | — | Player to challenge (leave empty for AI) |
| `difficulty` | string | — | AI difficulty (if playing against AI) |

### `/togglechat`
_Enable or disable the chat responder for this guild_

<sub>src/commands/`togglechat.js`</sub>

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `enabled` | boolean | ✅ | Enable chat responder |

### `/toggleplay`
_Enable or disable playful interactions for this guild_

<sub>src/commands/`toggleplay.js`</sub>

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `enabled` | boolean | ✅ | Enable playful interactions |

### `/trade`
_Trade items, gold, and participate in auctions_

<sub>src/commands/`trade.js`</sub>

#### Subcommand: `trade auction`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `action` | string | ✅ | create|bid|buyout |
| `item` | string | — | Item to auction (for create) |
| `price` | integer | — | Starting price (for create/bid) |
| `auction_id` | string | — | Auction ID (for bid/buyout) |

#### Subcommand: `trade offer`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `user` | user | ✅ | User to trade with |
| `offer_items` | string | — | Items to offer (comma separated) |
| `offer_gold` | integer | — | Gold to offer |
| `request_items` | string | — | Items to request (comma separated) |
| `request_gold` | integer | — | Gold to request |

### `/trivia`
_Start an interactive trivia quiz game_

<sub>src/commands/`trivia.js`</sub>

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `questions` | integer | — | Number of questions (1-10, default: 5) |
| `category` | string | — | Trivia category |

### `/weather`
_Get current weather information for a location_

<sub>src/commands/`weather.js`</sub>

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `location` | string | ✅ | City name or location |

### `/wordle`
_Play Wordle - guess the 5-letter word_

<sub>src/commands/`wordle.js`</sub>

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `difficulty` | string | — | Word difficulty |

---

## Regenerating this file

The full command inventory is built by walking `SlashCommandBuilder` metadata at runtime.

```bash
node scripts/dump-commands.mjs > /tmp/cmds.json
node scripts/generate-commands-doc.mjs /tmp/cmds.json > docs/COMMANDS.md
```

The current snapshot was generated when this file was last updated. If the file is out of sync, run the snippet above.
