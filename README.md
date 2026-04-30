# Pulse Bot

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/discord.js-v14-blue.svg)](https://discord.js.org/)
[![Version](https://img.shields.io/badge/version-3.0.1-blue.svg)]()
[![Database](https://img.shields.io/badge/database-SQLite-lightgrey.svg)]()
[![Coverage](https://img.shields.io/badge/coverage-85%25-green.svg)]()
[![Docker](https://img.shields.io/badge/docker-supported-blue.svg)]()
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/watchandnotlearn/ultra-discord-bot/pulls)
[![GitHub Repo](https://img.shields.io/badge/GitHub-Repository-black.svg)](https://github.com/watchandnotlearn/ultra-discord-bot)

A comprehensive, feature-rich Discord bot built with Node.js and Discord.js, offering RPG gaming, music playback, economic simulation, moderation tools, AI-powered interactions, with JSON-based data storage as the current primary method and ongoing SQLite migration for enhanced performance and reliability.

**⚠️ NEW IN v3.0.2: MASSIVE PERFORMANCE & FEATURE UPGRADE**
- ✅ **Enterprise Monitoring**: Real-time health checks, performance tracking, and system metrics
- ✅ **Automated Backups**: 6-hour automatic backups with restore capability
- ✅ **Memory Leak Prevention**: LRU caching with automatic eviction
- ✅ **Enhanced Logging**: Automatic log rotation with sensitive data filtering
- ✅ **Daily Quests**: Rotating challenges with rewards and leaderboards
- ✅ **Production Ready**: Comprehensive error handling and stability improvements

📖 **See [IMPROVEMENTS.md](IMPROVEMENTS.md) for complete details on all enhancements.**

**✨ Features:**
- **RPG System**: Character progression with classes, inventory, quests, and boss battles
- **Music Integration**: Multi-source playback with Spotify, YouTube, and Deezer support (optimized with LRU caching)
- **Economy System**: Banking, businesses, investments, and marketplace trading
- **Moderation Tools**: Advanced warning, mute, ban systems with logging
- **AI Assistant**: Multiple AI models with personality profiles and memory
- **Mini-Games**: Trivia, Wordle, Connect Four, Tic-Tac-Toe, and more
- **Guild Management**: Multiplayer guilds with economies and leaderboards
- **Daily Quests**: NEW - Rotating challenges with rewards and streaks
- **Health Monitoring**: NEW - Real-time system health and performance metrics
- **Automated Backups**: NEW - 6-hour automatic backups with admin management
- **JSON Storage**: Current primary data storage with SQLite migration in progress
- **Docker Support**: Containerized deployment with health checks

## 🌟 Overview

PulseBot is a versatile Discord bot that transforms your server into an interactive entertainment platform. Combining cutting-edge features with intuitive design, it provides everything from immersive RPG adventures and high-quality music streaming to sophisticated economic systems and powerful moderation tools.

Whether you're looking to engage your community with games, manage your server effectively, or create immersive role-playing experiences, Pulse Bot delivers professional-grade functionality with enterprise-level reliability.

## ✨ Features

### 🎮 Gaming & Entertainment
- **RPG System**: Complete character progression with 4 unique classes, inventory management, quests, and epic boss battles
- **Mini-Games**: Trivia, Hangman, Memory, Tic-Tac-Toe, Connect Four, Wordle, Number Guessing, Coin Flip, 8-Ball, Rock-Paper-Scissors
- **Interactive Polls**: Real-time voting with customizable options
- **Fun Commands**: 8-Ball, Rock-Paper-Scissors, Dice Rolling, Joke generation

### 🎵 Music & Audio
- **Advanced Music Player**: Queue management, playlist support, and volume controls
- **Multi-Source Support**: YouTube, Spotify, Deezer integration with fallback handling
- **DJ Mode**: Automated music playback with community requests
- **Lyrics Integration**: Fetch and display song lyrics
- **Radio Stations**: Pre-configured genre-based radio streams

### 💰 Economic Simulation
- **Banking System**: Secure balance management and transactions
- **Business Ownership**: 6 different business types with passive income
- **Investment System**: Long-term investments with realistic returns
- **Marketplace**: Dynamic pricing with supply/demand simulation
- **Lottery System**: Community jackpot games

### 🛡️ Moderation & Administration
- **Advanced Moderation**: Warnings, mutes, bans with detailed logging
- **Auto-Moderation**: Spam detection, caps filtering, bad word blocking
- **User Analytics**: Comprehensive moderation statistics and history
- **Administrative Tools**: Server statistics, user management, bulk operations

### 👥 Social & Community
- **Profile System**: Customizable user profiles with statistics and achievements
- **Guild System**: Multiplayer guilds with parties, economies, and leaderboards
- **Trading Platform**: Player-to-player trades, auction house, and marketplace
- **Achievement System**: 12+ unique achievements with progression tracking

### 🤖 AI Integration
- **Chat AI**: Multiple AI models (OpenAI, local models) with personality profiles
- **Content Generation**: Story generation, code snippets, recommendations
- **Smart Responses**: Context-aware conversations with memory
- **Multi-Model Support**: Creative, technical, helpful, and fun personas

### ⏰ Utilities & Scheduling
- **Smart Scheduling**: Natural language reminders and events
- **Weather Integration**: Real-time weather information with forecasts
- **Custom Commands**: Server-specific custom command creation and AI model switching
- **Integration APIs**: News, jokes, facts, quotes, and more

## 🚀 Installation

### Database Migration Note (v3.0.0)
⚠️ **Important**: SQLite migration is in progress. Currently using JSON files as primary storage. Backup your `data/` folder before upgrading.

### Prerequisites
- **Node.js** 18.0.0 or higher
- **Discord Bot Token** from the [Discord Developer Portal](https://discord.com/developers/applications)
- **Administrator access** to your Discord server
- **SQLite** (automatically included, no separate installation needed)

### Quick Setup

1. **Clone the repository:**
    ```bash
    git clone https://github.com/watchandnotlearn/ultra-discord-bot.git
    cd ultra-discord-bot
    ```

2. **Install dependencies:**
    ```bash
    npm install
    ```

3. **Configure environment variables:**
     ```bash
     cp .env.template .env
     # Edit .env with your actual tokens and configuration
     ```

4. **Deploy slash commands:**
    ```bash
    npm run deploy
    ```

5. **Start the bot:**
    ```bash
    npm start
    ```

### Docker Setup (Alternative)

```bash
# Build the image
npm run docker:build

# Run the container
npm run docker:run
```

### Development Setup

```bash
# Install development dependencies
npm install

# Run tests before development
npm run test

# Start in development mode with auto-reload
npm run dev

# Run linting and formatting
npm run lint
npm run format
```

## 📚 Usage

### Core Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/help` | Dynamic help system with categorized commands | `/help category:rpg` |
| `/ping` | Check bot latency and status | `/ping` |
| `/echo` | Repeat messages | `/echo message:Hello World!` |

### 🎮 Gaming Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/rpg start` | Create and customize your RPG character | `/rpg start name:Hero class:warrior` |
| `/rpg fight` | Battle monsters and gain experience | `/rpg fight` |
| `/rpg explore` | Explore new areas and discover items | `/rpg explore` |
| `/trivia` | Interactive trivia quiz with scoring | `/trivia questions:5 category:general` |
| `/tictactoe` | Play Tic-Tac-Toe against AI or players | `/tictactoe opponent:@user` |
| `/connect4` | Play Connect Four against AI or players | `/connect4 opponent:@user` |
| `/hangman` | Classic Hangman word guessing game | `/hangman` |
| `/memory` | Memory matching game | `/memory` |
| `/wordle` | Daily word guessing game | `/wordle` |
| `/guess` | Number guessing game | `/guess` |

### 🎵 Music Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/music play` | Play songs from various sources | `/music play query:never gonna give you up` |
| `/music queue` | View and manage the music queue | `/music queue` |
| `/music skip` | Skip to the next song | `/music skip` |
| `/music shuffle` | Shuffle the current playlist | `/music shuffle` |
| `/music lyrics` | Get lyrics for the current song | `/music lyrics` |

### 💰 Economy Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/economy balance` | Check your gold balance | `/economy balance` |
| `/economy transfer` | Send gold to other users | `/economy transfer user:@user amount:100` |
| `/economy business` | Manage your businesses | `/economy business action:create type:restaurant` |
| `/economy market` | Buy/sell items in the marketplace | `/economy market action:buy item:health_potion` |

### 🛡️ Moderation Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/admin warn` | Issue warnings to users | `/admin warn user:@user reason:spamming` |
| `/admin mute` | Temporarily mute users | `/admin mute user:@user reason:inappropriate duration:1h` |
| `/admin ban` | Ban users from the server | `/admin ban user:@user reason:harassment` |
| `/admin stats` | View server moderation statistics | `/admin stats` |

### 👥 Social Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/guild create` | Create a new guild | `/guild create name:MyGuild description:A great guild` |
| `/guild join` | Join an existing guild | `/guild join name:OtherGuild` |
| `/profile view` | View user profiles and statistics | `/profile view user:@user` |
| `/trade` | Trade items with other players | `/trade user:@user offer:item1 request:item2` |
| `/poll` | Create interactive polls | `/poll question:What's your favorite color? options:red,blue,green` |
| `/achievements view` | Browse your earned achievements | `/achievements view` |

### 🤖 AI & Novel Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/ai` | Chat with AI using various personalities | `/ai message:"Tell me a joke" personality:funny` |
| `/novel` | Generate stories with AI | `/novel prompt:"A fantasy adventure" length:short` |
| `/setmodel` | Switch between different AI models | `/setmodel model:gpt-4` |

### ⏰ Utility Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/remind me` | Set personal reminders | `/remind me when:"in 30 minutes" what:"Team meeting"` |
| `/weather` | Get current weather and forecasts | `/weather location:"New York"` |
| `/roll` | Roll dice with custom configurations | `/roll dice:2d6` |

### 🆕 NEW - Monitoring & Management Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/health status` | View overall bot health status | `/health status` |
| `/health performance` | View detailed performance metrics | `/health performance` |
| `/health cache` | View cache statistics | `/health cache` |
| `/health logs` | View log file statistics | `/health logs` |
| `/quests view` | View your daily quests | `/quests view` |
| `/quests claim` | Claim rewards from completed quests | `/quests claim quest_number:1` |
| `/quests leaderboard` | View quest completion leaderboard | `/quests leaderboard` |
| `/backup create` | Create a manual backup (Admin) | `/backup create` |
| `/backup list` | List all available backups (Admin) | `/backup list` |
| `/backup restore` | Restore from a backup (Admin) | `/backup restore backup_name:backup_2026-02-09` |
| `/backup stats` | View backup statistics (Admin) | `/backup stats` |

## 🔧 Configuration

### Environment Variables

#### Required
- `DISCORD_TOKEN`: Your Discord bot token from the Developer Portal
- `CLIENT_ID`: Your Discord application client ID
- `GUILD_ID`: Your test server ID for command deployment

#### Optional AI Integration
- `OPENAI_API_KEY`: OpenAI API key for advanced AI features
- `LOCAL_MODEL_URL`: URL for local AI model endpoints
- `LOCAL_MODEL_API`: API type for local models (openai-compatible, etc.)

#### Optional External APIs
- `OPENWEATHER_API_KEY`: OpenWeatherMap API key for weather commands
- `SPOTIFY_CLIENT_ID` & `SPOTIFY_CLIENT_SECRET`: Spotify API credentials
- `YOUTUBE_API_KEY`: YouTube Data API key for enhanced search

#### Database Configuration (Optional)
- `DATABASE_URL`: Path to SQLite database file (default: ./data/bot.db)
- `DB_MAX_CONNECTIONS`: Maximum database connections (default: 10)
- `DB_BACKUP_INTERVAL`: Automatic backup interval in hours (default: 24)

### Advanced Configuration

The bot supports extensive customization through configuration files and environment variables for:
- Rate limiting settings
- AI model parameters
- Moderation thresholds
- Economy balancing
- Feature toggles
- Database connection pooling
- Migration settings
- Backup configurations

## 🏗️ Architecture

### Technology Stack
- **Runtime**: Node.js 18+
- **Discord Library**: Discord.js v14
- **Language**: JavaScript ES2022+ (ESM)
- **Data Storage**: SQLite 3 with better-sqlite3 driver
- **AI Integration**: OpenAI API + Local Model Support
- **Audio Processing**: FFmpeg integration for music playback
- **Rate Limiting**: Built-in request throttling with rate-limiter-flexible
- **Database**: SQLite with ACID compliance and foreign key constraints
- **Containerization**: Docker support with multi-stage builds
- **Development**: ESLint, Prettier, comprehensive testing suite

### Project Structure
```
pulsebot/
├── src/
│   ├── commands/        # Slash command implementations
│   ├── minigames/       # Mini-game logic
│   ├── *.js             # Core modules and managers
├── data/                # JSON data files (primary storage) + SQLite database (migration in progress)
│   ├── players/         # Individual player data files
│   ├── bot.db           # SQLite database file (migration)
├── logs/                # Application logs
├── scripts/             # Utility scripts and data management
├── tests/               # Test suites and results
└── root-level-files/    # Main project files (package.json, README, etc.)
```

### Key Modules
- **Command System**: Dynamic command loading and execution
- **RPG Engine**: Character progression and game mechanics with SQLite persistence
- **Music Manager**: Multi-source audio streaming with enhanced error handling
- **Economy System**: Transaction processing and market simulation with database integrity
- **Moderation Tools**: User management and auto-moderation with audit logging
- **AI Assistant**: Multi-model conversational AI with memory persistence
- **Scheduler**: Event and reminder management with database-backed storage
- **Database Layer**: JSON-based storage with ongoing SQLite migration support

## 🤝 Contributing

We welcome contributions from the community! Whether you're fixing bugs, adding features, or improving documentation, your help is appreciated.

### Development Guidelines

1. **Code Quality**: Follow ES2022+ best practices and maintain consistent code style
2. **Documentation**: Document all new functions, classes, and features with JSDoc
3. **Testing**: Add comprehensive tests for new functionality with database integration
4. **Performance**: Optimize for scalability and efficiency with database query optimization
5. **Security**: Validate inputs and handle errors gracefully with SQL injection protection
6. **Compatibility**: Ensure cross-platform compatibility and database migration support
7. **Database**: Implement proper transaction handling and foreign key relationships
8. **Linting**: Run `npm run lint` and `npm run format` before committing
9. **Testing**: Ensure all tests pass with `npm run test` before PR submission

### Getting Started with Development

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes and test thoroughly
4. Submit a pull request with a detailed description

### Reporting Issues

- Use GitHub Issues to report bugs or request features
- Include detailed reproduction steps and environment information
- Specify Discord.js version, Node.js version, platform details, and database status
- For database-related issues, include migration status and SQLite version
- Provide log excerpts with error details for faster resolution

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔄 Recent Updates & Fixes

### 🎉 v3.0.2 - MASSIVE Performance & Feature Upgrade (February 2026)

#### New Features
- **Health Monitoring System**: Real-time bot health checks with `/health` command
  - System resource monitoring (CPU, memory, disk)
  - Performance metrics and slowest commands tracking
  - Cache statistics and hit rates
  - Log file management
  
- **Daily Quests System**: Rotating daily challenges with `/quests` command
  - 3 daily quests per user with various objectives
  - Gold and XP rewards
  - Streak tracking for consecutive completions
  - Global leaderboard

- **Automated Backup System**: 6-hour automatic backups with `/backup` command (Admin)
  - Automatic backup creation and retention (keeps last 10)
  - Manual backup/restore capabilities
  - Safety backups before restores
  - Backup statistics and management

#### Performance Improvements
- **LRU Cache System**: Prevents memory leaks with bounded caches
  - Music search result caching (5 min TTL)
  - URL validation caching (10 min TTL)
  - Automatic eviction of old entries
  - Cache statistics tracking

- **Performance Monitoring**: Command execution tracking and metrics
  - Real-time performance tracking
  - Memory usage snapshots
  - Error rate monitoring
  - Slowest command identification

- **Enhanced Logging**: Automatic log rotation and management
  - 10MB file size limits with automatic rotation
  - Sensitive data filtering (API keys, tokens, passwords)
  - 7-day log retention with automatic cleanup
  - Multiple log levels (error, warn, info, debug)

#### Stability Improvements
- **Safe File Operations**: Atomic writes with automatic backups
  - JSON parse error recovery with backup restoration
  - Concurrent write protection with locks
  - 50MB file size limits
  - Async I/O for non-blocking operations

- **Error Handling**: Comprehensive error recovery
  - Graceful error handling throughout the bot
  - Automatic fallback to backups on corruption
  - Enhanced error logging with stack traces

- **Resource Management**: Proper cleanup on shutdown
  - All timers and intervals properly cleared
  - Cache cleanup on exit
  - Performance report generation on shutdown

### Ongoing Database Migration
- **JSON Storage Active**: Currently using JSON files as primary data storage method
- **SQLite Migration**: Migration to SQLite database is underway for improved performance and reliability
- **Data Integrity**: Ensuring safe data transfer with backup and rollback capabilities
- **Migration Scripts**: Automated scripts for gradual migration from JSON to SQLite
- **Backup System**: Comprehensive backup procedures during migration process

### Music System Improvements
- **Enhanced Error Handling**: Improved resilience against API failures and network issues
- **Multi-Source Support**: Prioritized YouTube with Deezer fallback for better availability
- **Queue Management**: Robust queue operations with proper state management
- **Audio Processing**: FFmpeg integration with static binaries for cross-platform compatibility

### Bug Fixes
- **Command Validation**: Fixed dice format validation in `/roll` command (NdM format support)
- **RPG Character Creation**: Resolved level scaling and skill point allocation issues
- **Button Interactions**: Fixed unrecognized button actions in explore and trivia commands
- **API Error Handling**: Improved error responses for malformed API requests
- **Memory Management**: Added periodic cleanup of Maps and caches to prevent memory leaks

### Performance Enhancements
- **Connection Pooling**: Database connection management for concurrent operations
- **Query Optimization**: Indexed tables for faster data retrieval
- **Rate Limiting**: Improved rate limiting with adaptive cooldowns
- **Caching**: Enhanced caching strategies for frequently accessed data

### Development & Testing
- **Comprehensive Test Suite**: Added extensive testing for music, RPG, and command systems
- **Error Logging**: Detailed logging with structured error information
- **Migration Validation**: Automated checks for data integrity during migration
- **Documentation**: Updated project structure and configuration guides

## 🙏 Acknowledgments

Built with ❤️ using:
- **Discord.js** - Official Discord API wrapper
- **Node.js** - JavaScript runtime environment
- **SQLite** - Lightweight, serverless database
- **FFmpeg** - Audio/video processing with static binaries
- **OpenAI** - AI integration capabilities
- **Community** - Ideas, feedback, and contributions

---

<div align="center">
  <p><strong>Transform your Discord server into an interactive entertainment platform</strong></p>
  <p>Built with modern technologies • Powered by community innovation</p>
</div>
