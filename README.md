# Ultra Discord Bot

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/discord.js-v14-blue.svg)](https://discord.js.org/)
[![GitHub Repo](https://img.shields.io/badge/GitHub-Repository-black.svg)](https://github.com/your-username/ultra-discord-bot)

A comprehensive, feature-rich Discord bot built with Node.js and Discord.js, offering RPG gaming, music playback, economic simulation, moderation tools, and AI-powered interactions.

## 🌟 Overview

Ultra Discord Bot is a versatile Discord bot that transforms your server into an interactive entertainment platform. Combining cutting-edge features with intuitive design, it provides everything from immersive RPG adventures and high-quality music streaming to sophisticated economic systems and powerful moderation tools.

Whether you're looking to engage your community with games, manage your server effectively, or create immersive role-playing experiences, Ultra Discord Bot delivers professional-grade functionality with enterprise-level reliability.

## ✨ Features

### 🎮 Gaming & Entertainment
- **RPG System**: Complete character progression with 4 unique classes, inventory management, quests, and epic boss battles
- **Mini-Games**: Trivia, Hangman, Memory, Tic-Tac-Toe, Connect Four, Wordle, Number Guessing, Coin Flip
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
- **Trading Platform**: Player-to-player trades and auction house
- **Achievement System**: 12+ unique achievements with progression tracking

### 🤖 AI Integration
- **Chat AI**: Multiple AI models (OpenAI, local models) with personality profiles
- **Content Generation**: Story generation, code snippets, recommendations
- **Smart Responses**: Context-aware conversations with memory
- **Multi-Model Support**: Creative, technical, helpful, and fun personas

### ⏰ Utilities & Scheduling
- **Smart Scheduling**: Natural language reminders and events
- **Weather Integration**: Real-time weather information with forecasts
- **Custom Commands**: Server-specific custom command creation
- **Integration APIs**: News, jokes, facts, quotes, and more

## 🚀 Installation

### Prerequisites
- **Node.js** 18.0.0 or higher
- **Discord Bot Token** from the [Discord Developer Portal](https://discord.com/developers/applications)
- **Administrator access** to your Discord server

### Quick Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/ultra-discord-bot.git
   cd ultra-discord-bot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   cp .env.template .env
   ```

   Edit `.env` with your configuration:
   ```env
   # Required Discord Setup
   DISCORD_TOKEN=your_bot_token_here
   CLIENT_ID=your_application_client_id
   GUILD_ID=your_test_server_id

   # Optional AI Integration
   OPENAI_API_KEY=your_openai_key_here
   LOCAL_MODEL_URL=http://localhost:8000
   LOCAL_MODEL_API=openai-compatible

   # Optional External APIs
   OPENWEATHER_API_KEY=your_weather_api_key_here
   SPOTIFY_CLIENT_ID=your_spotify_client_id
   SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
   ```

4. **Deploy slash commands:**
   ```bash
   npm run deploy
   ```

5. **Start the bot:**
   ```bash
   npm start
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
| `/trivia` | Interactive trivia quiz with scoring | `/trivia questions:5 category:general` |
| `/tictactoe` | Play Tic-Tac-Toe against AI or players | `/tictactoe opponent:@user` |
| `/wordle` | Daily word guessing game | `/wordle` |

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
| `/achievements view` | Browse your earned achievements | `/achievements view` |

### ⏰ Utility Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/remind me` | Set personal reminders | `/remind me when:"in 30 minutes" what:"Team meeting"` |
| `/weather` | Get current weather and forecasts | `/weather location:"New York"` |
| `/roll` | Roll dice with custom configurations | `/roll dice:2d6` |
| `/ai` | Chat with AI using various personalities | `/ai message:"Tell me a joke" personality:funny` |

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

### Advanced Configuration

The bot supports extensive customization through configuration files and environment variables for:
- Rate limiting settings
- AI model parameters
- Moderation thresholds
- Economy balancing
- Feature toggles

## 🏗️ Architecture

### Technology Stack
- **Runtime**: Node.js 18+
- **Discord Library**: Discord.js v14
- **Language**: JavaScript ES6+ (ESM)
- **Data Storage**: JSON-based persistence with file system
- **AI Integration**: OpenAI API + Local Model Support
- **Audio Processing**: FFmpeg integration for music playback
- **Rate Limiting**: Built-in request throttling

### Project Structure
```
ultra-discord-bot/
├── src/
│   ├── commands/        # Slash command implementations
│   ├── minigames/       # Mini-game logic
│   ├── *.js             # Core modules and managers
├── data/                # JSON data storage
├── logs/                # Application logs
├── scripts/             # Utility scripts
└── tests/               # Test suites
```

### Key Modules
- **Command System**: Dynamic command loading and execution
- **RPG Engine**: Character progression and game mechanics
- **Music Manager**: Multi-source audio streaming
- **Economy System**: Transaction processing and market simulation
- **Moderation Tools**: User management and auto-moderation
- **AI Assistant**: Multi-model conversational AI
- **Scheduler**: Event and reminder management

## 🤝 Contributing

We welcome contributions from the community! Whether you're fixing bugs, adding features, or improving documentation, your help is appreciated.

### Development Guidelines

1. **Code Quality**: Follow ES6+ best practices and maintain consistent code style
2. **Documentation**: Document all new functions, classes, and features
3. **Testing**: Add comprehensive tests for new functionality
4. **Performance**: Optimize for scalability and efficiency
5. **Security**: Validate inputs and handle errors gracefully
6. **Compatibility**: Ensure cross-platform compatibility

### Getting Started with Development

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes and test thoroughly
4. Submit a pull request with a detailed description

### Reporting Issues

- Use GitHub Issues to report bugs or request features
- Include detailed reproduction steps and environment information
- Specify Discord.js version, Node.js version, and platform details

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Built with ❤️ using:
- **Discord.js** - Official Discord API wrapper
- **Node.js** - JavaScript runtime environment
- **FFmpeg** - Audio/video processing
- **OpenAI** - AI integration capabilities
- **Community** - Ideas, feedback, and contributions

---

<div align="center">
  <p><strong>Transform your Discord server into an interactive entertainment platform</strong></p>
  <p>Built with modern technologies • Powered by community innovation</p>
</div>
