import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, MessageFlags, ChatInputCommandInteraction } from "discord.js";
import { logCommandExecution, logError, logger } from "./logger.js";
import { CommandError, handleCommandError, safeExecuteCommand, validateRange, validateNotEmpty, createRateLimiter } from "./errorHandler.js";
import { inputValidator, sanitizeInput, validateUserId } from "./validation.js";
import { entertainmentManager } from "./entertainment.js";
import { getPerformanceRating, sendMemoryBoard } from "./commands/memory.js";
import { makeConnect4Move, sendConnect4Board } from "./commands/connect4.js";
import { checkWinner, formatBoard, sendTicTacToeBoard } from "./commands/tictactoe.js";
import { isOnCooldown, setCooldown, getFormattedCooldown, getButtonCooldownType } from "./cooldowns.js";
import { guessGames, connect4Games, triviaGames, tttGames, pollGames, memoryGames } from "./game-states.js";
import { getCharacter, resetCharacter, encounterMonster, fightTurn, applyXp, saveCharacter, addItemToInventory, removeItemFromInventory, getItemInfo, generateRandomItem, getLeaderboard, getLeaderboardCount, randomEventType, getInventory, getInventoryValue } from "./rpg.js";
import { addBalance, getBalance, getMarketPrice } from "./economy.js";
import { getUserGuild } from "./guilds.js";
import { muteUser, unmuteUser, unbanUser } from "./moderation.js";
import { pause, resume, skip, stop, shuffleQueue, clearQueue, getQueue, getMusicStats, searchSongs, play, back, getRadioStations } from "./music.js";
import { getRandomJoke, generateStory, getRiddle, getFunFact, getRandomQuote, magic8Ball, generateFunName, createFunChallenge } from "./entertainment.js";
import { getLocations } from "./locations.js";
import { getActiveAuctions } from "./trading.js";
import { updateProfile } from "./profiles.js";
import { updateUserStats } from "./achievements.js";
const INTERACTION_RATE_LIMIT = 5;
const INTERACTION_RATE_WINDOW = 1e4;
const PROCESSED_INTERACTION_CLEANUP_TIME = 5 * 60 * 1e3;
const CIRCUIT_BREAKER_MAX_ATTEMPTS = 3;
const CIRCUIT_BREAKER_CLEANUP_TIME = 5 * 60 * 1e3;
const interactionRateLimiter = createRateLimiter(INTERACTION_RATE_LIMIT, INTERACTION_RATE_WINDOW, (key) => key);
const circuitBreaker = /* @__PURE__ */ new Map();
const processedInteractions = /* @__PURE__ */ new Map();
async function sendWordleGuessModal(interaction, gameId) {
  const modal = new ModalBuilder().setCustomId(`wordle_submit:${gameId}`).setTitle("Wordle Guess");
  const guessInput = new TextInputBuilder().setCustomId("word_guess").setLabel("Enter a 5-letter word").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("HOUSE").setMinLength(5).setMaxLength(5);
  modal.addComponents(guessInput);
  await interaction.showModal(modal);
  return;
}
async function updateInventoryEmbed(interaction, itemsByType, inventoryValue) {
  const message = interaction.message;
  if (!message) return;
  const { getItemInfo: getItemInfo2, getItemRarityInfo: getItemRarityInfo2 } = await import("./rpg.js");
  const embed = message.embeds[0];
  if (!embed) return;
  const newEmbed = new EmbedBuilder().setTitle(embed.title || "Inventory").setColor(embed.color || 9127187).setDescription(`\u{1F4B0} Total Value: ${inventoryValue} gold`);
  for (const [type, items] of Object.entries(itemsByType)) {
    const typeEmoji = {
      weapon: "\u2694\uFE0F",
      armor: "\u{1F6E1}\uFE0F",
      consumable: "\u{1F9EA}",
      material: "\u{1F529}"
    }[type] || "\u{1F4E6}";
    const itemList = items.map((item) => {
      return `${typeEmoji} **${item.name}** (${item.quantity}x)`;
    }).join("\n");
    newEmbed.addFields({
      name: `${typeEmoji} ${type.charAt(0).toUpperCase() + type.slice(1)}s`,
      value: itemList || "None",
      inline: true
    });
  }
  await interaction.update({ embeds: [newEmbed] });
  return;
}
function checkCircuitBreaker(interactionId) {
  const circuitData = circuitBreaker.get(interactionId);
  if (!circuitData) return true;
  const { attempts, lastAttempt } = circuitData;
  const now = Date.now();
  if (now - lastAttempt > CIRCUIT_BREAKER_CLEANUP_TIME) {
    circuitBreaker.delete(interactionId);
    return true;
  }
  return attempts < CIRCUIT_BREAKER_MAX_ATTEMPTS;
}
function recordErrorAttempt(interactionId) {
  const now = Date.now();
  const circuitData = circuitBreaker.get(interactionId) || { attempts: 0, lastAttempt: now };
  circuitData.attempts += 1;
  circuitData.lastAttempt = now;
  circuitBreaker.set(interactionId, circuitData);
  if (circuitBreaker.size > 1e3) {
    for (const [id, data] of circuitBreaker.entries()) {
      if (now - data.lastAttempt > CIRCUIT_BREAKER_CLEANUP_TIME) {
        circuitBreaker.delete(id);
      }
    }
  }
}
async function safeInteractionReply(interaction, options) {
  const interactionId = interaction.id;
  console.log(`DEBUG: safeInteractionReply called with interaction: ${interaction.constructor.name}, interactionId: ${interactionId}`);
  console.log(`DEBUG: interaction.user: ${interaction.user ? interaction.user.constructor.name : "null"}, userId: ${interaction.user?.id}`);
  console.log(`DEBUG: options type: ${typeof options}, options keys: ${Object.keys(options || {})}`);
  if (!checkCircuitBreaker(interactionId)) {
    console.error(`[SAFE_INTERACTION_REPLY] Circuit breaker tripped for interaction ${interactionId}, skipping reply`);
    logger.error(`Circuit breaker tripped - too many error attempts for interaction ${interactionId}`, new Error("Circuit breaker activated"), {
      interactionId,
      userId: interaction.user?.id
    });
    return false;
  }
  try {
    await interactionRateLimiter.consume(interaction.user.id);
  } catch (error) {
    if (error instanceof CommandError && error.code === "RATE_LIMITED") {
      logError("Interaction rate limited", error, {
        userId: interaction.user.id,
        interactionId
      });
      return false;
    }
  }
  if (processedInteractions.has(interactionId)) {
    logger.warn(`Interaction ${interactionId} already processed, ignoring`, {
      userId: interaction.user.id,
      interactionId
    });
    return false;
  }
  try {
    validateNotEmpty(interaction, "interaction");
    validateNotEmpty(interaction.user, "interaction.user");
    validateUserId(interaction.user.id);
    if (interaction.replied || interaction.deferred) {
      console.error(`[SAFE_INTERACTION_REPLY] Interaction ${interactionId} already replied/deferred`, {
        userId: interaction.user.id,
        interactionId,
        replied: interaction.replied,
        deferred: interaction.deferred
      });
      logger.warn(`Interaction ${interactionId} already replied/deferred`, {
        userId: interaction.user.id,
        interactionId,
        replied: interaction.replied,
        deferred: interaction.deferred
      });
      return false;
    }
    processedInteractions.set(interactionId, Date.now());
    const cutoffTime = Date.now() - PROCESSED_INTERACTION_CLEANUP_TIME;
    for (const [id, timestamp] of processedInteractions.entries()) {
      if (timestamp < cutoffTime) {
        processedInteractions.delete(id);
      }
    }
    if (options && "content" in options && options.content) {
      options.content = sanitizeInput(options.content);
    }
    console.error(`[SAFE_INTERACTION_REPLY] Attempting to reply to interaction ${interactionId}`);
    await interaction.reply(options);
    console.error(`[SAFE_INTERACTION_REPLY] Successfully replied to interaction ${interactionId}`);
    return true;
  } catch (error) {
    recordErrorAttempt(interactionId);
    logger.error(`Failed to reply to interaction ${interactionId}`, error instanceof Error ? error : new Error(String(error)), {
      userId: interaction.user?.id,
      interactionType: interaction?.type,
      interactionId,
      interactionState: {
        replied: interaction?.replied,
        deferred: interaction?.deferred
      }
    });
    return false;
  }
}
async function safeInteractionUpdate(interaction, options) {
  const interactionId = interaction.id;
  if (!checkCircuitBreaker(interactionId)) {
    console.error(`[SAFE_INTERACTION_UPDATE] Circuit breaker tripped for interaction ${interactionId}, skipping update`);
    logger.error(`Circuit breaker tripped - too many error attempts for interaction ${interactionId}`, new Error("Circuit breaker activated"), {
      interactionId,
      userId: interaction.user?.id
    });
    return false;
  }
  try {
    await interactionRateLimiter.consume(interaction.user.id);
  } catch (error) {
    if (error instanceof CommandError && error.code === "RATE_LIMITED") {
      logError("Interaction update rate limited", error, {
        userId: interaction.user.id,
        interactionId
      });
      return false;
    }
  }
  if (processedInteractions.has(interactionId)) {
    logger.warn(`Interaction ${interactionId} already processed, ignoring`, {
      userId: interaction.user.id,
      interactionId
    });
    return false;
  }
  logger.debug("Processing interaction update", {
    userId: interaction.user.id,
    interactionId,
    hasEmbeds: !!(options && "embeds" in options && options.embeds),
    hasComponents: !!(options && "components" in options && options.components),
    hasContent: !!(options && "content" in options && options.content),
    isEphemeral: options && "flags" in options && options.flags && (options.flags & MessageFlags.Ephemeral) === MessageFlags.Ephemeral || false
  });
  try {
    validateNotEmpty(interaction, "interaction");
    validateNotEmpty(interaction.user, "interaction.user");
    validateUserId(interaction.user.id);
    if (interaction.replied || interaction.deferred) {
      logger.warn(`Interaction ${interactionId} already replied/deferred`, {
        userId: interaction.user.id,
        interactionId,
        replied: interaction.replied,
        deferred: interaction.deferred
      });
      return false;
    }
    processedInteractions.set(interactionId, Date.now());
    if (options && "content" in options && options.content) {
      options.content = sanitizeInput(options.content);
    }
    if (interaction.isButton()) {
      const updateOptions = {};
      if (options.content !== void 0) updateOptions.content = options.content;
      if (options.embeds !== void 0) updateOptions.embeds = options.embeds;
      if (options.components !== void 0) {
        updateOptions.components = options.components.map((row) => row.toJSON ? row.toJSON() : row);
      }
      await interaction.update(updateOptions);
      return true;
    } else {
      logger.warn(`Cannot update interaction of type ${interaction.type}`, {
        userId: interaction.user.id,
        interactionId,
        interactionType: interaction.type
      });
      return false;
    }
  } catch (error) {
    recordErrorAttempt(interactionId);
    logger.error(`Failed to reply to interaction ${interactionId}`, error instanceof Error ? error : new Error(String(error)), {
      userId: interaction.user?.id,
      interactionType: interaction?.type,
      interactionId,
      interactionState: {
        replied: interaction?.replied,
        deferred: interaction?.deferred
      }
    });
    logger.error(`Failed to update interaction ${interactionId}`, error instanceof Error ? error : new Error(String(error)), {
      userId: interaction.user.id,
      interactionType: interaction.type,
      interactionId
    });
    return false;
  }
}
const spendCooldowns = /* @__PURE__ */ new Map();
const circuitBreakerMap = circuitBreaker;
const wordleWords = ["HOUSE", "PLANE", "TIGER", "BREAD", "CHAIR", "SNAKE", "CLOUD", "LIGHT", "MUSIC", "WATER", "EARTH", "STORM", "FLAME", "SHARP", "QUIET", "BRIGHT", "DANCE", "FIELD", "GRASS", "HEART", "KNIFE", "LARGE", "MOUSE", "NIGHT", "OCEAN", "PIANO", "QUICK", "RIVER", "SHINE", "TRUCK", "WHEAT", "YOUNG", "ALARM", "BEACH", "CLOCK", "DRIVE", "ELBOW", "FLOUR", "GHOST", "HAPPY", "INDEX", "JOINT", "KNOCK", "LUNCH", "MIGHT", "NOISE", "OCCUR", "PAINT", "QUILT", "ROBOT", "SHORE", "THICK", "UNION", "VOICE", "WASTE", "YIELD", "ABUSE", "ADULT", "AGENT", "AGREE", "AHEAD", "ALARM", "ALBUM", "ALERT", "ALIEN", "ALIGN", "ALIKE", "ALIVE", "ALLOW", "ALONE", "ALONG", "ALTER", "AMONG", "ANGER", "ANGLE", "ANGRY", "APART", "APPLE", "APPLY", "ARENA", "ARGUE", "ARISE", "ARMED", "ARMOR", "ARRAY", "ASIDE", "ASSET", "AVOID", "AWAKE", "AWARD", "AWARE", "BADLY", "BAKER", "BASES", "BASIC", "BEACH", "BEGAN", "BEGIN", "BEING", "BELOW", "BENCH", "BILLY", "BIRTH", "BLACK", "BLAME", "BLANK", "BLIND", "BLOCK", "BLOOD", "BOARD", "BOOST", "BOOTH", "BOUND", "BRAIN", "BRAND", "BRASS", "BRAVE", "BREAD", "BREAK", "BREED", "BRIEF", "BRING", "BROAD", "BROKE", "BROWN", "BUILD", "BUILT", "BUYER", "CABLE", "CALIF", "CARRY", "CATCH", "CAUSE", "CHAIN", "CHAIR", "CHAOS", "CHARM", "CHART", "CHASE", "CHEAP", "CHECK", "CHEST", "CHIEF", "CHILD", "CHINA", "CHOSE", "CIVIL", "CLAIM", "CLASS", "CLEAN", "CLEAR", "CLICK", "CLIMB", "CLOCK", "CLOSE", "CLOUD", "COACH", "COAST", "COULD", "COUNT", "COURT", "COVER", "CRAFT", "CRASH", "CRAZY", "CREAM", "CRIME", "CROSS", "CROWD", "CROWN", "CRUDE", "CURVE", "CYCLE", "DAILY", "DANCE", "DATED", "DEALT", "DEATH", "DEBUT", "DELAY", "DEPTH", "DOING", "DOUBT", "DOZEN", "DRAFT", "DRAMA", "DRANK", "DREAM", "DRESS", "DRILL", "DRINK", "DRIVE", "DROVE", "DYING", "EAGER", "EARLY", "EARTH", "EIGHT", "ELITE", "EMPTY", "ENEMY", "ENJOY", "ENTER", "ENTRY", "EQUAL", "ERROR", "EVENT", "EVERY", "EXACT", "EXIST", "EXTRA", "FAITH", "FALSE", "FAULT", "FIBER", "FIELD", "FIFTH", "FIFTY", "FIGHT", "FINAL", "FIRST", "FIXED", "FLASH", "FLEET", "FLOOR", "FLUID", "FOCUS", "FORCE", "FORTH", "FORTY", "FORUM", "FOUND", "FRAME", "FRANK", "FRAUD", "FRESH", "FRONT", "FRUIT", "FULLY", "FUNNY", "GIANT", "GIVEN", "GLASS", "GLOBE", "GOING", "GRACE", "GRADE", "GRAND", "GRANT", "GRASS", "GRAVE", "GREAT", "GREEN", "GROSS", "GROUP", "GROWN", "GUARD", "GUESS", "GUEST", "GUIDE", "HAPPY", "HARRY", "HEART", "HEAVY", "HENCE", "HENRY", "HORSE", "HOTEL", "HOUSE", "HUMAN", "HURRY", "IMAGE", "INDEX", "INNER", "INPUT", "ISSUE", "JAPAN", "JIMMY", "JOINT", "JONES", "JUDGE", "KNOWN", "LABEL", "LARGE", "LASER", "LATER", "LAUGH", "LAYER", "LEARN", "LEASE", "LEAST", "LEAVE", "LEGAL", "LEVEL", "LEWIS", "LIGHT", "LIMIT", "LINKS", "LIVES", "LOCAL", "LOOSE", "LOWER", "LUCKY", "LUNCH", "LYING", "MAGIC", "MAJOR", "MAKER", "MARCH", "MARIA", "MATCH", "MAYBE", "MAYOR", "MEANT", "MEDAL", "MEDIA", "METAL", "MIGHT", "MINOR", "MINUS", "MIXED", "MODEL", "MONEY", "MONTH", "MORAL", "MOTOR", "MOUNT", "MOUSE", "MOUTH", "MOVED", "MOVIE", "MUSIC", "NEEDS", "NEVER", "NEWLY", "NIGHT", "NOISE", "NORTH", "NOTED", "NOVEL", "NURSE", "OCCUR", "OCEAN", "OFFER", "OFTEN", "ORDER", "OTHER", "OUGHT", "PAINT", "PANEL", "PAPER", "PARTY", "PEACE", "PETER", "PHASE", "PHONE", "PHOTO", "PIANO", "PIECE", "PILOT", "PITCH", "PLACE", "PLAIN", "PLANE", "PLANT", "PLATE", "PLAYS", "PLENT", "PLOTS", "POEMS", "POINT", "POUND", "POWER", "PRESS", "PRICE", "PRIDE", "PRIME", "PRINT", "PRIOR", "PRIZE", "PROOF", "PROUD", "PROVE", "QUEEN", "QUICK", "QUIET", "QUITE", "RADIO", "RAISE", "RANGE", "RAPID", "RATIO", "REACH", "READY", "REALM", "REBEL", "REFER", "RELAX", "REMARK", "REMIND", "REMOVE", "RENDER", "RENEW", "RENTAL", "REPAIR", "REPEAT", "REPLACE", "REPORT", "RESIST", "RESOURCE", "RESPONSE", "RESULT", "RETAIN", "RETIRE", "RETURN", "REVEAL", "REVIEW", "REWARD", "RIDER", "RIDGE", "RIGHT", "RIGID", "RING", "RISE", "RISK", "RIVER", "ROAD", "ROBOT", "ROGER", "ROMAN", "ROUGH", "ROUND", "ROUTE", "ROYAL", "RURAL", "SCALE", "SCENE", "SCOPE", "SCORE", "SENSE", "SERVE", "SEVEN", "SHALL", "SHAPE", "SHARE", "SHARP", "SHEET", "SHELF", "SHELL", "SHIFT", "SHINE", "SHIRT", "SHOCK", "SHOOT", "SHORT", "SHOWN", "SIDES", "SIGHT", "SILVER", "SIMILAR", "SIMPLE", "SIXTH", "SIXTY", "SIZED", "SKILL", "SLEEP", "SLIDE", "SMALL", "SMART", "SMILE", "SMITH", "SMOKE", "SNAKE", "SOLID", "SOLVE", "SORRY", "SOUND", "SOUTH", "SPACE", "SPARE", "SPEAK", "SPEED", "SPEND", "SPENT", "SPLIT", "SPOKE", "STAGE", "STAKE", "STAND", "START", "STATE", "STEAM", "STEEL", "STEEP", "STICK", "STILL", "STOCK", "STONE", "STOOD", "STORE", "STORM", "STORY", "STRIP", "STUCK", "STUDY", "STUFF", "STYLE", "SUGAR", "SUITE", "SUPER", "SWEET", "TABLE", "TAKEN", "TASTE", "TAXES", "TEACH", "TEETH", "TERRY", "TEXAS", "THANK", "THEFT", "THEIR", "THEME", "THERE", "THESE", "THICK", "THING", "THINK", "THIRD", "THOSE", "THREE", "THREW", "THROW", "THUMB", "TIGER", "TIGHT", "TIRED", "TITLE", "TODAY", "TOKEN", "TOPIC", "TOTAL", "TOUCH", "TOUGH", "TOWER", "TRACK", "TRADE", "TRAIN", "TREAT", "TREND", "TRIAL", "TRIBE", "TRICK", "TRIED", "TRIES", "TRUCK", "TRULY", "TRUNK", "TRUST", "TRUTH", "TWICE", "TWIST", "TYLER", "UNION", "UNITY", "UNTIL", "UPPER", "UPSET", "URBAN", "USAGE", "USUAL", "VALUE", "VIDEO", "VIRUS", "VISIT", "VITAL", "VOCAL", "VOICE", "WASTE", "WATCH", "WATER", "WAVE", "WHEEL", "WHERE", "WHICH", "WHILE", "WHITE", "WHOLE", "WINNER", "WINTER", "WOMAN", "WOMEN", "WORLD", "WORRY", "WORSE", "WORST", "WORTH", "WOULD", "WRITE", "WRONG", "WROTE", "YOUNG", "YOURS", "YOUTH"];
async function handleInteraction(interaction, client) {
  const startTime = Date.now();
  try {
    validateNotEmpty(interaction, "interaction");
    validateNotEmpty(interaction.user, "interaction.user");
    validateUserId(interaction.user.id);
    try {
      await interactionRateLimiter.consume(interaction.user.id);
    } catch (error) {
      if (error instanceof CommandError && error.code === "RATE_LIMITED") {
        logError("Global interaction rate limited", error, {
          userId: interaction.user.id,
          interactionType: interaction.type
        });
        return await safeInteractionReply(interaction, {
          content: "\u23F0 **Rate Limited!** Please slow down and try again in a moment.",
          flags: MessageFlags.Ephemeral
        });
      }
    }
    const globalCooldown = isOnCooldown(interaction.user.id, "command_global");
    if (globalCooldown.onCooldown) {
      return await safeInteractionReply(interaction, {
        content: `\u23F0 **Cooldown Active!** Please wait ${getFormattedCooldown(globalCooldown.remaining)} before using another command.`,
        flags: MessageFlags.Ephemeral
      });
    }
    setCooldown(interaction.user.id, "command_global");
    if (interaction.isChatInputCommand()) {
      const commandCooldown = isOnCooldown(interaction.user.id, interaction.commandName);
      if (commandCooldown.onCooldown) {
        const commandName = interaction.commandName;
        return await safeInteractionReply(interaction, {
          content: `\u23F0 **${commandName} is on cooldown!** Please wait ${getFormattedCooldown(commandCooldown.remaining)}.`,
          flags: MessageFlags.Ephemeral
        });
      }
    }
    logCommandExecution(interaction, true);
    if (interaction.isModalSubmit()) {
      await safeExecuteCommand(interaction, () => handleModalSubmit(interaction, client), {
        interactionType: "modal_submit",
        customId: interaction.customId
      });
      return;
    }
    if (interaction.isButton()) {
      await safeExecuteCommand(interaction, () => handleButtonInteraction(interaction, client), {
        interactionType: "button",
        customId: interaction.customId
      });
      return;
    }
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) {
        throw new CommandError(`Unknown command: ${interaction.commandName}`, "INVALID_ARGUMENT");
      }
      const commandCooldown = isOnCooldown(interaction.user.id, interaction.commandName);
      if (commandCooldown.onCooldown) {
        return await safeInteractionReply(interaction, {
          content: `\u23F0 **${interaction.commandName} is on cooldown!** Please wait ${getFormattedCooldown(commandCooldown.remaining)}.`,
          flags: MessageFlags.Ephemeral
        });
      }
      if (interaction.commandName === "explore") {
        const char = getCharacter(interaction.user.id);
        const level = char && typeof char.lvl === "number" && char.lvl != null ? validateRange(char.lvl, 1, 100, "character level") : 1;
        const adaptiveCooldown = Math.max(5e3, 3e4 - (level - 1) * 1e3);
        setCooldown(interaction.user.id, "rpg_explore", adaptiveCooldown);
      }
      const validationResult = inputValidator.validateCommandInput(interaction);
      if (!validationResult.valid) {
        throw new CommandError(validationResult.reason, "INVALID_ARGUMENT");
      }
      await safeExecuteCommand(interaction, () => command.execute(interaction), {
        interactionType: "chat_input_command",
        commandName: interaction.commandName
      });
      setCooldown(interaction.user.id, interaction.commandName);
    }
  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error("[HANDLE_INTERACTION] Error in handleInteraction:", error instanceof Error ? error.message : String(error));
    console.error("[HANDLE_INTERACTION] Error stack:", error instanceof Error ? error.stack : void 0);
    console.error("[HANDLE_INTERACTION] Interaction state at error:", {
      id: interaction?.id,
      replied: interaction?.replied,
      deferred: interaction?.deferred,
      type: interaction?.type,
      command: interaction instanceof ChatInputCommandInteraction ? interaction.commandName : "unknown",
      userId: interaction?.user?.id
    });
    await handleCommandError(interaction, error instanceof CommandError ? error : new CommandError(error instanceof Error ? error.message : "Unknown error occurred", "UNKNOWN_ERROR", {
      originalError: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : void 0,
      executionTime
    }), {
      command: interaction instanceof ChatInputCommandInteraction ? interaction.commandName : "unknown",
      userId: interaction.user.id,
      guild: interaction.guild?.name || "DM",
      channel: interaction.channel && "name" in interaction.channel ? interaction.channel.name : "Unknown",
      executionTime
    });
    logCommandExecution(interaction, false, error instanceof Error ? error : new Error(String(error)));
  }
}
async function handleModalSubmit(interaction, client) {
  const custom = interaction.customId || "";
  try {
    validateNotEmpty(custom, "modal customId");
    if (custom.startsWith("rpg_reset_confirm:")) {
      const parts = custom.split(":");
      const mode = parts[1] || "btn";
      const targetUser = parts[2] || interaction.user.id;
      validateUserId(targetUser);
      if (targetUser !== interaction.user.id) {
        throw new CommandError("You cannot confirm reset for another user.", "PERMISSION_DENIED");
      }
      const text = interaction.fields.getTextInputValue("confirm_text");
      if (!text || text.trim() !== "RESET") {
        throw new CommandError("Confirmation text did not match. Type RESET to confirm.", "INVALID_ARGUMENT");
      }
      console.log(`DEBUG: Modal submit - reset confirmation for user ${interaction.user.id}, mode: ${mode}`);
      const className = parts[3] || "warrior";
      const validation = inputValidator.validateCharacterClass(className);
      if (!validation.valid) {
        throw new CommandError(validation.reason, "INVALID_ARGUMENT");
      }
      const def = resetCharacter(interaction.user.id, className);
      return await safeInteractionReply(interaction, {
        content: `Character reset to defaults: HP ${def.hp}/${def.maxHp} MP ${def.mp}/${def.maxMp} ATK ${def.atk} DEF ${def.def} SPD ${def.spd} Level ${def.lvl}`,
        flags: MessageFlags.Ephemeral
      });
    }
    if (custom.startsWith("guess_submit:")) {
      const [, gameId] = custom.split(":");
      console.log(`DEBUG: Processing guess_submit for gameId: ${gameId}`);
      const gameState = guessGames.get(gameId);
      console.log(`DEBUG: Game state found: ${!!gameState}, gameState type: ${typeof gameState}`);
      if (!gameState) {
        await safeInteractionReply(interaction, { content: "\u274C **Game not found!** The game may have expired.", flags: MessageFlags.Ephemeral });
        return;
      }
      if (!gameState.gameActive) {
        await safeInteractionReply(interaction, { content: "\u274C **Game is no longer active!**", flags: MessageFlags.Ephemeral });
        return;
      }
      const guess = interaction.fields.getTextInputValue("guess_number");
      console.log(`DEBUG: Retrieved guess input: ${guess}, type: ${typeof guess}`);
      if (!guess || typeof guess !== "string") {
        throw new CommandError("Invalid guess input.", "INVALID_ARGUMENT");
      }
      const guessNum = Number.parseInt(guess.trim());
      if (isNaN(guessNum)) {
        throw new CommandError("Please enter a valid number!", "INVALID_ARGUMENT");
      }
      if (guessNum < gameState.min || guessNum > gameState.max) {
        throw new CommandError(`Number must be between ${gameState.min} and ${gameState.max}!`, "INVALID_ARGUMENT");
      }
      gameState.attemptsUsed++;
      let feedback;
      let isCorrect = false;
      if (guessNum === gameState.secretNumber) {
        feedback = "\u{1F389} Correct! You win!";
        isCorrect = true;
        gameState.gameActive = false;
      } else if (guessNum < gameState.secretNumber) {
        feedback = "\u{1F4C8} Too low! Try a higher number.";
      } else {
        feedback = "\u{1F4C9} Too high! Try a lower number.";
      }
      gameState.guesses.push({
        number: guessNum,
        feedback,
        attempt: gameState.attemptsUsed
      });
      if (isCorrect) {
        guessGames.delete(gameId);
        const timeElapsed = Math.round((Date.now() - gameState.startTime) / 1e3);
        const attemptsUsed = gameState.attemptsUsed;
        let performanceRating;
        if (attemptsUsed === 1) performanceRating = "\u{1F31F} PERFECT! First try!";
        else if (attemptsUsed <= 3) performanceRating = "\u{1F947} Excellent!";
        else if (attemptsUsed <= 5) performanceRating = "\u{1F948} Good job!";
        else if (attemptsUsed <= 7) performanceRating = "\u{1F949} Not bad!";
        else performanceRating = "\u{1F3AF} You got it!";
        const embed = new EmbedBuilder().setTitle("\u{1F389} Congratulations!").setColor(65280).setDescription(`You guessed **${gameState.secretNumber}** correctly!

${performanceRating}`).addFields(
          {
            name: "\u{1F4CA} Game Stats",
            value: `**Attempts:** ${attemptsUsed}/${gameState.attempts}
**Time:** ${timeElapsed}s
**Difficulty:** ${gameState.difficulty.toUpperCase()}`,
            inline: true
          },
          {
            name: "\u{1F3C6} Performance",
            value: `**Range:** ${gameState.min}-${gameState.max}
**Efficiency:** ${Math.round((1 - (attemptsUsed - 1) / gameState.attempts) * 100)}%`,
            inline: true
          }
        );
        if (gameState.guesses.length > 0) {
          embed.addFields({
            name: "\u{1F4DD} Guess History",
            value: gameState.guesses.map((g, i) => `${i + 1}. **${g.number}** - ${g.feedback}`).join("\n"),
            inline: false
          });
        }
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      } else {
        const { attempts, attemptsUsed: currentAttemptsUsed, min, max, guesses } = gameState;
        if (currentAttemptsUsed >= attempts) {
          gameState.gameActive = false;
          guessGames.delete(gameId);
          const timeElapsed = Math.round((Date.now() - gameState.startTime) / 1e3);
          const loseEmbed = new EmbedBuilder().setTitle("\u274C Game Over!").setColor(16711680).setDescription(`The secret number was **${gameState.secretNumber}**!

You used all ${attempts} attempts in ${timeElapsed} seconds.`).addFields({
            name: "Your Guesses",
            value: guesses.length > 0 ? guesses.map((g, i) => `${i + 1}. **${g.number}** - ${g.feedback}`).join("\n") : "No guesses made",
            inline: false
          });
          await safeInteractionUpdate(interaction, { embeds: [loseEmbed], components: [] });
          return;
        }
        const embed = new EmbedBuilder().setTitle("\u{1F522} Number Guessing Game").setColor(39423).setDescription(`I'm thinking of a number between **${min}** and **${max}**.

You have **${attempts - currentAttemptsUsed}** attempts remaining.

**${guessNum}** - ${feedback}`).addFields({
          name: "Previous Guesses",
          value: guesses.length > 0 ? guesses.slice(-5).map((g, i) => `**${g.number}** - ${g.feedback}`).join("\n") : "No guesses yet",
          inline: false
        });
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`guess_modal:${gameId}:${min}:${max}`).setLabel("\u{1F522} Make Guess").setStyle(ButtonStyle.Primary)
        );
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
      }
      return;
    }
    if (custom.startsWith("guess_modal:")) {
      const parts = custom.split(":");
      const [, gameId, minStr, maxStr] = parts;
      const min = minStr ? Number.parseInt(minStr) : 1;
      const max = maxStr ? Number.parseInt(maxStr) : 100;
      if (isNaN(min) || isNaN(max) || min >= max) {
        return safeInteractionReply(interaction, {
          content: "\u274C **Invalid game parameters!** Please start a new game.",
          flags: MessageFlags.Ephemeral
        });
      }
      const gameState = guessGames.get(gameId);
      if (!gameState) {
        return safeInteractionReply(interaction, {
          content: "\u274C **Game not found!** The game may have expired.",
          flags: MessageFlags.Ephemeral
        });
      }
      if (!gameState.gameActive) {
        return safeInteractionReply(interaction, {
          content: "\u274C **Game is no longer active!**",
          flags: MessageFlags.Ephemeral
        });
      }
      const modal = new ModalBuilder().setCustomId(`guess_submit:${gameId}`).setTitle("Make Your Guess");
      const guessInput = new TextInputBuilder().setCustomId("guess_number").setLabel(`Guess a number between ${min} and ${max}`).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(`${min}-${max}`);
      modal.addComponents(guessInput);
      await interaction.showModal(modal);
      return;
    }
    throw new CommandError(`Unknown modal type: ${custom}`, "INVALID_ARGUMENT");
  } catch (error) {
    logger.error("Modal submit error", error instanceof Error ? error : new Error(String(error)), {
      customId: custom,
      userId: interaction.user.id
    });
    await handleCommandError(interaction, error instanceof CommandError ? error : new CommandError(
      "An error occurred while processing the modal.",
      "UNKNOWN_ERROR",
      { originalError: error instanceof Error ? error.message : String(error) }
    ));
  }
}
async function handleButtonInteraction(interaction, client) {
  const userId = interaction.user.id;
  const buttonCooldownType = getButtonCooldownType(interaction.customId);
  const cooldownCheck = isOnCooldown(userId, buttonCooldownType);
  console.log(`DEBUG: handleButtonInteraction called with interaction: ${interaction.constructor.name}, customId: ${interaction.customId}`);
  console.log(`DEBUG: userId: ${userId}, buttonCooldownType: ${buttonCooldownType}`);
  console.log(`DEBUG: interaction.user: ${interaction.user ? interaction.user.constructor.name : "null"}`);
  console.log(`DEBUG: interaction.message: ${interaction.message ? interaction.message.constructor.name : "null"}`);
  if (cooldownCheck.onCooldown) {
    logCommandExecution(interaction, false, new Error("Button on cooldown"));
    logger.warn("Button on cooldown", {
      userId: interaction.user.id,
      customId: interaction.customId,
      buttonCooldownType,
      remainingTime: cooldownCheck.remaining
    });
    return await safeInteractionReply(interaction, {
      content: `\u23F0 **Button on cooldown!** Please wait ${getFormattedCooldown(cooldownCheck.remaining)} before pressing this button again.`,
      flags: MessageFlags.Ephemeral
    });
  }
  const char = getCharacter(userId);
  const level = char ? char.lvl || 1 : 1;
  const adaptiveCooldown = Math.max(1e3, (cooldownCheck.cooldown || 0) - (level - 1) * 500);
  setCooldown(userId, buttonCooldownType, adaptiveCooldown);
  const [action, arg2, arg3] = interaction.customId ? interaction.customId.split(":") : ["", void 0, void 0];
  logger.info(`Handling button action: ${action}`, {
    userId: interaction.user.id,
    customId: interaction.customId,
    guild: interaction.guild?.name || "DM"
  });
  logCommandExecution(interaction, true);
  try {
    if (action === "explore_continue") {
      const [, locationName, targetUserId] = interaction.customId.split(":");
      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error("Wrong user"));
        return safeInteractionReply(interaction, { content: "You cannot continue adventure for another user.", flags: MessageFlags.Ephemeral });
      }
      const char2 = getCharacter(interaction.user.id);
      if (!char2) {
        return safeInteractionReply(interaction, { content: "\u274C You need to create a character first!", flags: MessageFlags.Ephemeral });
      }
      const event = randomEventType();
      let result, xpGain = 0;
      switch (event) {
        case "monster": {
          const monster = encounterMonster(char2.lvl);
          const damage = fightTurn(char2, monster);
          if (damage > 0) {
            char2.hp -= damage;
            if (char2.hp <= 0) {
              char2.hp = 1;
            }
          }
          result = `\u{1F3C3} You continue your adventure and encounter a **${monster.name}**!
\u2694\uFE0F You take **${damage}** damage. HP: ${char2.hp}/${char2.maxHp}`;
          xpGain = 6;
          break;
        }
        case "treasure": {
          const gold = Math.floor(Math.random() * 30) + 10;
          char2.gold += gold;
          result = `\u{1F3C3} You discover treasure along the way!
\u{1F4B0} You find **${gold}** gold!`;
          xpGain = 4;
          break;
        }
        case "trap": {
          const damage = Math.floor(Math.random() * 10) + 3;
          char2.hp -= damage;
          if (char2.hp <= 0) {
            char2.hp = 1;
          }
          result = `\u{1F3C3} You trigger a trap while exploring!
\u{1F4A5} You take **${damage}** damage. HP: ${char2.hp}/${char2.maxHp}`;
          xpGain = 2;
          break;
        }
        default: {
          result = "\u{1F3C3} You meet helpful travelers who guide you safely!\n\u{1F4D6} You learn from their stories.";
          xpGain = 3;
        }
      }
      applyXp(interaction.user.id, char2, xpGain);
      saveCharacter(interaction.user.id, char2);
      const embed = new EmbedBuilder().setTitle("\u{1F3C3} Continue Adventure").setColor(2201331).setDescription(result).addFields(
        { name: "\u{1F4CA} Stats", value: `Level ${char2.lvl} \u2022 XP ${char2.xp} \u2022 Gold ${char2.gold}`, inline: true }
      );
      await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      return;
    }
    if (action === "explore_leave") {
      const [, locationName, targetUserId] = interaction.customId.split(":");
      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error("Wrong user"));
        return safeInteractionReply(interaction, { content: "You cannot leave for another user.", flags: MessageFlags.Ephemeral });
      }
      const embed = new EmbedBuilder().setTitle("\u{1F3C3} Leave Location").setColor(16750592).setDescription(`You safely leave ${locationName} and return to town.

*Your adventure continues another day!*`);
      await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      return;
    }
    if (action === "music_pause") {
      if (!interaction.guild) {
        return await safeInteractionReply(interaction, { content: "\u274C **Music commands are only available in servers.**", flags: MessageFlags.Ephemeral });
      }
      const [, targetGuild] = interaction.customId.split(":");
      if (targetGuild && targetGuild !== interaction.guild.id) {
        logCommandExecution(interaction, false, new Error("Wrong guild"));
        return await safeInteractionReply(interaction, { content: "You cannot pause music in another server.", flags: MessageFlags.Ephemeral });
      }
      const result = await pause(interaction.guild.id);
      logger.debug(`Music pause result: ${result}`, {
        userId,
        guildId: interaction.guild.id
      });
      if (result) {
        const currentRow = interaction.message?.components?.[0];
        if (currentRow && currentRow.components) {
          const newRow = currentRow.components.map((button) => {
            if (button.customId === `music_pause:${interaction.guild?.id}`) {
              return new ButtonBuilder().setCustomId(`music_resume:${interaction.guild?.id}`).setLabel("\u25B6\uFE0F Resume").setStyle(ButtonStyle.Success);
            }
            return ButtonBuilder.from(button);
          });
          await safeInteractionUpdate(interaction, {
            content: interaction.message?.content || "",
            embeds: interaction.message?.embeds?.map((embed) => EmbedBuilder.from(embed)) || [],
            components: [new ActionRowBuilder().addComponents(newRow)]
          });
        } else {
          await safeInteractionReply(interaction, { content: "\u23F8\uFE0F **Music paused!**", flags: MessageFlags.Ephemeral });
        }
      } else {
        await safeInteractionReply(interaction, { content: "\u274C No music currently playing.", flags: MessageFlags.Ephemeral });
      }
      return;
    }
    if (action === "music_resume") {
      if (!interaction.guild) {
        return await safeInteractionReply(interaction, { content: "\u274C **Music commands are only available in servers.**", flags: MessageFlags.Ephemeral });
      }
      const [, targetGuild] = interaction.customId.split(":");
      if (targetGuild && targetGuild !== interaction.guild.id) {
        logCommandExecution(interaction, false, new Error("Wrong guild"));
        return await safeInteractionReply(interaction, { content: "You cannot resume music in another server.", flags: MessageFlags.Ephemeral });
      }
      const result = await resume(interaction.guild.id);
      if (result) {
        const currentRow = interaction.message?.components?.[0];
        if (currentRow && currentRow.components) {
          const newRow = currentRow.components.map((button) => {
            if (button.customId === `music_resume:${interaction.guild?.id}`) {
              return new ButtonBuilder().setCustomId(`music_pause:${interaction.guild?.id}`).setLabel("\u23F8\uFE0F Pause").setStyle(ButtonStyle.Primary);
            }
            return ButtonBuilder.from(button);
          });
          await safeInteractionUpdate(interaction, {
            content: interaction.message?.content || "",
            embeds: interaction.message?.embeds?.map((embed) => EmbedBuilder.from(embed)) || [],
            components: [new ActionRowBuilder().addComponents(newRow)]
          });
        } else {
          await safeInteractionReply(interaction, { content: "\u25B6\uFE0F **Music resumed!**", flags: MessageFlags.Ephemeral });
        }
      } else {
        await safeInteractionReply(interaction, { content: "\u274C No paused music to resume.", flags: MessageFlags.Ephemeral });
      }
      return;
    }
    if (action === "music_skip") {
      if (!interaction.guild) {
        return await safeInteractionReply(interaction, { content: "\u274C **Music commands are only available in servers.**", flags: MessageFlags.Ephemeral });
      }
      const [, targetGuild] = interaction.customId.split(":");
      if (targetGuild && targetGuild !== interaction.guild.id) {
        logCommandExecution(interaction, false, new Error("Wrong guild"));
        return await safeInteractionReply(interaction, { content: "You cannot skip music in another server.", flags: MessageFlags.Ephemeral });
      }
      const nextSong = await skip(interaction.guild.id);
      if (nextSong) {
        if (!interaction.message?.embeds?.[0]) {
          return await safeInteractionReply(interaction, { content: "\u274C **Unable to update embed.**", flags: MessageFlags.Ephemeral });
        }
        const embed = EmbedBuilder.from(interaction.message.embeds[0]).setTitle("\u23ED\uFE0F Song Skipped").setDescription(`**Now Playing:** ${nextSong.title} by ${nextSong.artist}`).setColor(16753920);
        await safeInteractionUpdate(interaction, {
          embeds: [embed],
          components: interaction.message.components.map((row) => row.toJSON ? row.toJSON() : row)
        });
      } else {
        await safeInteractionReply(interaction, { content: "\u274C No songs in queue to skip.", flags: MessageFlags.Ephemeral });
      }
      return;
    }
    if (action === "music_stop") {
      if (!interaction.guild) {
        return await safeInteractionReply(interaction, { content: "\u274C **Music commands are only available in servers.**", flags: MessageFlags.Ephemeral });
      }
      const [, targetGuild] = interaction.customId.split(":");
      if (targetGuild && targetGuild !== interaction.guild.id) {
        logCommandExecution(interaction, false, new Error("Wrong guild"));
        return await safeInteractionReply(interaction, { content: "You cannot stop music in another server.", flags: MessageFlags.Ephemeral });
      }
      const success = stop(interaction.guild.id);
      if (success) {
        if (!interaction.message?.embeds?.[0]) {
          return await safeInteractionReply(interaction, { content: "\u274C **Unable to update embed.**", flags: MessageFlags.Ephemeral });
        }
        const embed = EmbedBuilder.from(interaction.message.embeds[0]).setTitle("\u23F9\uFE0F Music Stopped").setDescription("Music stopped and left voice channel.").setColor(16711680);
        await safeInteractionUpdate(interaction, {
          embeds: [embed],
          components: []
        });
      } else {
        await safeInteractionReply(interaction, { content: "\u274C No music is currently playing.", flags: MessageFlags.Ephemeral });
      }
      return;
    }
    if (action === "music_queue") {
      if (!interaction.guild) {
        return await safeInteractionReply(interaction, { content: "\u274C **Music commands are only available in servers.**", flags: MessageFlags.Ephemeral });
      }
      const [, targetGuild] = interaction.customId.split(":");
      if (targetGuild && targetGuild !== interaction.guild.id) {
        logCommandExecution(interaction, false, new Error("Wrong guild"));
        return await safeInteractionReply(interaction, { content: "You cannot view queue in another server.", flags: MessageFlags.Ephemeral });
      }
      const queue = getQueue(interaction.guild.id);
      const stats = getMusicStats(interaction.guild.id);
      const current = stats.currentlyPlaying;
      let description = "";
      if (current) {
        description += `**Currently Playing:** ${current.title} by ${current.artist}

`;
      }
      if (queue.length > 0) {
        description += "**Queue:**\n";
        for (const [index, song] of queue.slice(0, 10).entries()) {
          description += `${index + 1}. ${song.title} by ${song.artist}
`;
        }
        if (queue.length > 10) {
          description += `... and ${queue.length - 10} more songs`;
        }
      } else {
        description += "Queue is empty.";
      }
      const embed = new EmbedBuilder().setTitle("\u{1F4CB} Music Queue").setColor(39423).setDescription(description).addFields({
        name: "\u{1F4CA} Queue Info",
        value: `**Total Songs:** ${stats.queueLength}
**Volume:** ${stats.volume}%`,
        inline: true
      });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`music_shuffle:${interaction.guild.id}`).setLabel("\u{1F500} Shuffle").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`music_clear:${interaction.guild.id}`).setLabel("\u{1F5D1}\uFE0F Clear Queue").setStyle(ButtonStyle.Danger)
      );
      await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
      return;
    }
    if (action === "music_shuffle") {
      if (!interaction.guild) {
        return await safeInteractionReply(interaction, { content: "\u274C **Music commands are only available in servers.**", flags: MessageFlags.Ephemeral });
      }
      const [, targetGuild] = interaction.customId.split(":");
      if (targetGuild && targetGuild !== interaction.guild.id) {
        logCommandExecution(interaction, false, new Error("Wrong guild"));
        return await safeInteractionReply(interaction, { content: "You cannot shuffle queue in another server.", flags: MessageFlags.Ephemeral });
      }
      const success = shuffleQueue(interaction.guild.id);
      if (success) {
        const embed = new EmbedBuilder().setTitle("\u{1F500} Queue Shuffled").setColor(10040012).setDescription("Music queue has been shuffled!");
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      } else {
        await safeInteractionReply(interaction, { content: "\u274C Queue is empty or too small to shuffle.", flags: MessageFlags.Ephemeral });
      }
      return;
    }
    if (action === "music_clear") {
      if (!interaction.guild) {
        return await safeInteractionReply(interaction, { content: "\u274C **Music commands are only available in servers.**", flags: MessageFlags.Ephemeral });
      }
      const [, targetGuild] = interaction.customId.split(":");
      if (targetGuild && targetGuild !== interaction.guild.id) {
        logCommandExecution(interaction, false, new Error("Wrong guild"));
        return await safeInteractionReply(interaction, { content: "You cannot clear queue in another server.", flags: MessageFlags.Ephemeral });
      }
      const success = clearQueue(interaction.guild.id);
      if (success) {
        const embed = new EmbedBuilder().setTitle("\u{1F5D1}\uFE0F Queue Cleared").setColor(16729344).setDescription("Music queue has been cleared!");
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      } else {
        await safeInteractionReply(interaction, { content: "\u274C Queue is already empty.", flags: MessageFlags.Ephemeral });
      }
      return;
    }
    if (action === "music_back") {
      if (!interaction.guild) {
        return await safeInteractionReply(interaction, { content: "\u274C **Music commands are only available in servers.**", flags: MessageFlags.Ephemeral });
      }
      const [, targetGuild] = interaction.customId.split(":");
      if (targetGuild && targetGuild !== interaction.guild.id) {
        logCommandExecution(interaction, false, new Error("Wrong guild"));
        return await safeInteractionReply(interaction, { content: "You cannot go back in another server.", flags: MessageFlags.Ephemeral });
      }
      const previousSong = back(interaction.guild.id);
      if (previousSong) {
        const embed = new EmbedBuilder().setTitle("\u2B05\uFE0F Back to Previous Song").setColor(16753920).setDescription(`**Now Playing:** ${previousSong.title} by ${previousSong.artist}`).setThumbnail(previousSong.thumbnail || "https://i.imgur.com/SjIgjlE.png");
        await safeInteractionUpdate(interaction, {
          embeds: [embed],
          components: interaction.message.components
        });
      } else {
        await safeInteractionReply(interaction, { content: "\u274C No previous song in history.", flags: MessageFlags.Ephemeral });
      }
      return;
    }
    if (action === "music_play") {
      if (!interaction.guild) {
        return await safeInteractionReply(interaction, { content: "\u274C **Music commands are only available in servers.**", flags: MessageFlags.Ephemeral });
      }
      const [, index, query] = interaction.customId.split(":");
      if (!index) {
        return await safeInteractionReply(interaction, { content: "\u274C **Invalid song index.**", flags: MessageFlags.Ephemeral });
      }
      const songIndex = Number.parseInt(index);
      if (!interaction.member) {
        return await safeInteractionReply(interaction, { content: "\u274C **Unable to determine member information.**", flags: MessageFlags.Ephemeral });
      }
      const voiceChannel = interaction.member && "voice" in interaction.member ? interaction.member.voice?.channel : null;
      if (!voiceChannel) {
        logCommandExecution(interaction, false, new Error("No voice channel"));
        return await safeInteractionReply(interaction, {
          content: "\u{1F3B5} **You must be in a voice channel to play music!**",
          flags: MessageFlags.Ephemeral
        });
      }
      const botMember = interaction.guild.members.me;
      if (!botMember) {
        return await safeInteractionReply(interaction, { content: "\u274C **Bot member not found in guild.**", flags: MessageFlags.Ephemeral });
      }
      const botPermissions = voiceChannel.permissionsFor(botMember);
      if (!botPermissions.has("Connect") || !botPermissions.has("Speak")) {
        logCommandExecution(interaction, false, new Error("Missing permissions"));
        return await safeInteractionReply(interaction, {
          content: '\u274C **I need "Connect" and "Speak" permissions in your voice channel.**',
          flags: MessageFlags.Ephemeral
        });
      }
      try {
        const songs = await searchSongs(query, 5);
        if (songs.length > songIndex) {
          const song = songs[songIndex];
          const result = await play(interaction.guild.id, voiceChannel, song);
          if (!result.success) {
            let errorMessage = "\u274C **Failed to play music**";
            switch (result.errorType) {
              case "validation_failed": {
                errorMessage += "\n\n\u{1F4F9} **Video unavailable**\nThe requested video is no longer available.";
                break;
              }
              case "stream_creation": {
                errorMessage += "\n\n\u{1F50A} **Audio stream error**\nThere was an issue creating the audio stream.";
                break;
              }
              case "connection_failed": {
                errorMessage += "\n\n\u{1F517} **Voice connection error**\nFailed to establish connection.";
                break;
              }
              default: {
                errorMessage += `: ${result.error}`;
              }
            }
            await safeInteractionReply(interaction, { content: errorMessage, flags: MessageFlags.Ephemeral });
          } else {
            const embed = new EmbedBuilder().setTitle("\u{1F3B5} Now Playing").setColor(65280).setDescription(`**${song.title}** by **${song.artist}**`).addFields(
              { name: "\u23F1\uFE0F Duration", value: song.duration, inline: true },
              { name: "\u{1F50A} Volume", value: `${getMusicStats(interaction.guild.id).volume}%`, inline: true },
              { name: "\u{1F464} Requested by", value: interaction.user.username, inline: true }
            ).setThumbnail(song.thumbnail || "https://i.imgur.com/SjIgjlE.png");
            if (song.source === "spotify") {
              embed.addFields({ name: "\u2139\uFE0F Note", value: "Playing 30-second preview from Spotify", inline: false });
            } else if (song.source === "youtube") {
              embed.addFields({ name: "\u2139\uFE0F Note", value: "Playing full track from YouTube", inline: false });
            }
            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`music_pause:${interaction.guild.id}`).setLabel("\u23F8\uFE0F Pause").setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId(`music_skip:${interaction.guild.id}`).setLabel("\u23ED\uFE0F Skip").setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`music_stop:${interaction.guild.id}`).setLabel("\u23F9\uFE0F Stop").setStyle(ButtonStyle.Danger),
              new ButtonBuilder().setCustomId(`music_queue:${interaction.guild.id}`).setLabel("\u{1F4CB} Queue").setStyle(ButtonStyle.Secondary)
            );
            await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
          }
        } else {
          if (interaction.replied || interaction.deferred) {
            console.error("[MUSIC_PLAY_BUTTON] Interaction already handled, cannot reply", {
              interactionId: interaction.id,
              replied: interaction.replied,
              deferred: interaction.deferred
            });
            return;
          }
          await safeInteractionReply(interaction, { content: "\u274C **Song no longer available**", flags: MessageFlags.Ephemeral });
        }
      } catch (error) {
        logger.error("[MUSIC] Play button error", error instanceof Error ? error : new Error(String(error)), {
          userId: interaction.user.id,
          query,
          songIndex
        });
        if (interaction.replied || interaction.deferred) {
          console.error("[MUSIC_PLAY_BUTTON_ERROR] Interaction already handled, cannot reply", {
            interactionId: interaction.id,
            replied: interaction.replied,
            deferred: interaction.deferred
          });
          return;
        }
        await safeInteractionReply(interaction, { content: "\u274C **Failed to play song**", flags: MessageFlags.Ephemeral });
      }
      return;
    }
    if (action === "music_radio_change") {
      if (!interaction.guild) {
        return await safeInteractionReply(interaction, { content: "\u274C **Music commands are only available in servers.**", flags: MessageFlags.Ephemeral });
      }
      if (!interaction.member) {
        return await safeInteractionReply(interaction, { content: "\u274C **Unable to determine member information.**", flags: MessageFlags.Ephemeral });
      }
      const [, stationKey] = interaction.customId.split(":");
      if (!stationKey) {
        return await safeInteractionReply(interaction, { content: "\u274C **Invalid station key.**", flags: MessageFlags.Ephemeral });
      }
      try {
        const stations = getRadioStations();
        const station = stations[
          /** @type {keyof typeof stations} */
          stationKey
        ];
        if (!station) {
          await safeInteractionReply(interaction, { content: "\u274C Invalid radio station.", flags: MessageFlags.Ephemeral });
          return;
        }
        const voiceChannel = interaction.member && "voice" in interaction.member ? interaction.member.voice?.channel : null;
        if (!voiceChannel) {
          logCommandExecution(interaction, false, new Error("No voice channel"));
          return await safeInteractionReply(interaction, { content: "\u{1F3B5} You must be in a voice channel to change radio!", flags: MessageFlags.Ephemeral });
        }
        const song = {
          title: station.name,
          artist: station.genre,
          duration: "Live Stream",
          url: station.url,
          thumbnail: "https://i.imgur.com/SjIgjlE.png",
          requestedBy: interaction.user.username
        };
        const result = await play(interaction.guild.id, voiceChannel, song);
        if (!result.success) {
          let errorMessage = "\u274C **Failed to change radio station**";
          switch (result.errorType) {
            case "validation_failed": {
              errorMessage += "\n\n\u{1F4FB} **Radio station unavailable**";
              break;
            }
            case "stream_creation": {
              errorMessage += "\n\n\u{1F50A} **Stream error**";
              break;
            }
            case "connection_failed": {
              errorMessage += "\n\n\u{1F517} **Voice connection error**";
              break;
            }
            default: {
              errorMessage += `: ${result.error}`;
            }
          }
          await safeInteractionReply(interaction, { content: errorMessage, flags: MessageFlags.Ephemeral });
        } else {
          const embed = new EmbedBuilder().setTitle(`\u{1F4FB} Changed Station: ${station.name}`).setColor(16750592).setDescription(`**${station.name}** radio is now playing!

\u{1F3B5} *Live streaming activated*`).addFields(
            { name: "\u{1F4FB} Station", value: station.name, inline: true },
            { name: "\u{1F3B5} Genre", value: station.genre, inline: true },
            { name: "\u{1F50A} Quality", value: "Live Stream", inline: true }
          );
          await safeInteractionUpdate(interaction, { embeds: [embed], components: interaction.message.components });
        }
      } catch (error) {
        logger.error("Error changing radio station", error instanceof Error ? error : new Error(String(error)), {
          userId: interaction.user.id,
          stationKey
        });
        await safeInteractionReply(interaction, {
          content: "\u274C **Failed to change radio station.**\n\nPlease try again later.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }
    }
    if (action === "explore_unlock") {
      const [, targetUserId] = interaction.customId.split(":");
      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error("Wrong user"));
        return safeInteractionReply(interaction, { content: "You cannot unlock locations for another user.", flags: MessageFlags.Ephemeral });
      }
      const char2 = getCharacter(interaction.user.id);
      if (!char2) {
        return safeInteractionReply(interaction, { content: "\u274C You need to create a character first!", flags: MessageFlags.Ephemeral });
      }
      const { discoverLocation, unlockLocation, getLocations: getLocations2 } = await import("./locations.js");
      const locations = getLocations2();
      const locationOrder = ["whispering_woods", "crystal_caverns", "volcano_summit", "forgotten_temple", "shadow_realm", "celestial_spire"];
      let nextLocationId = null;
      for (const locId of locationOrder) {
        const location = locations[locId];
        if (!location || location.unlocked) continue;
        const discoverResult = await discoverLocation(interaction.user.id, locId);
        if (discoverResult.success && discoverResult.canUnlock) {
          nextLocationId = locId;
          break;
        }
      }
      if (!nextLocationId) {
        const currentEmbed = interaction.message?.embeds?.[0];
        if (!currentEmbed) {
          return await safeInteractionReply(interaction, { content: "\u274C **Unable to update embed.**", flags: MessageFlags.Ephemeral });
        }
        const updatedEmbed = EmbedBuilder.from(currentEmbed).setDescription("\u{1F3D5}\uFE0F **No new locations available!**\n\nYou've discovered all currently available locations. Check back later for new content!");
        const updatedComponents = interaction.message.components.map((row) => ({
          ...row,
          components: row.components.filter((btn) => btn.customId !== `explore_unlock:${interaction.user.id}`)
        }));
        await safeInteractionUpdate(interaction, {
          embeds: [updatedEmbed],
          components: updatedComponents.length > 0 ? updatedComponents : []
        });
      } else {
        const unlockResult = unlockLocation(interaction.user.id, nextLocationId);
        if (unlockResult.success) {
          const unlockedLocation = unlockResult.location;
          const successEmbed = new EmbedBuilder().setTitle("\u{1F389} New Location Discovered!").setColor(unlockedLocation.color).setDescription(unlockResult.message || "New location unlocked!").addFields(
            { name: "\u{1F4CD} Location", value: unlockedLocation.name, inline: true },
            { name: "\u{1F3C6} Level", value: unlockedLocation.level, inline: true },
            { name: "\u{1F3AF} Type", value: unlockedLocation.type, inline: true },
            { name: "\u{1F48E} Rewards", value: `${unlockedLocation.rewards.xp} XP, ${unlockedLocation.rewards.gold} gold`, inline: false }
          );
          const currentEmbed = interaction.message?.embeds?.[0];
          if (!currentEmbed) {
            return await safeInteractionReply(interaction, { content: "\u274C **Unable to update embed.**", flags: MessageFlags.Ephemeral });
          }
          const currentDescription = currentEmbed.description || "";
          const newFields = [...currentEmbed.fields || []];
          newFields.push({
            name: `${unlockedLocation.emoji} ${unlockedLocation.name} (Level ${unlockedLocation.level})`,
            value: `**Type:** ${unlockedLocation.type}
**Description:** ${unlockedLocation.description}
**Rewards:** ${unlockedLocation.rewards.xp} XP, ${unlockedLocation.rewards.gold} gold`,
            inline: false
          });
          const updatedEmbed = EmbedBuilder.from(currentEmbed).setFields(newFields);
          await safeInteractionUpdate(interaction, { embeds: [updatedEmbed] });
          await safeInteractionReply(interaction, { embeds: [successEmbed], flags: MessageFlags.Ephemeral });
        } else {
          const errorEmbed2 = new EmbedBuilder().setTitle("\u274C Location Unlock Failed").setColor(16711680).setDescription(`Failed to unlock location: ${unlockResult.reason || "Unknown error"}`);
          await safeInteractionReply(interaction, { embeds: [errorEmbed2], flags: MessageFlags.Ephemeral });
        }
      }
    } else if (action === "explore_map") {
      const [, targetUserId] = interaction.customId.split(":");
      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error("Wrong user"));
        return safeInteractionReply(interaction, { content: "You cannot view map for another user.", flags: MessageFlags.Ephemeral });
      }
      const char2 = getCharacter(interaction.user.id);
      if (!char2) {
        return safeInteractionReply(interaction, { content: "\u274C You need to create a character first!", flags: MessageFlags.Ephemeral });
      }
      const locations = getLocations();
      const availableLocations = Object.values(locations).filter((loc) => loc.unlocked);
      if (availableLocations.length === 0) {
        return safeInteractionReply(interaction, { content: "\u{1F3D5}\uFE0F No locations available yet. Start your adventure by exploring the Whispering Woods!\nUse `/explore discover location:whispering_woods`", flags: MessageFlags.Ephemeral });
      }
      const locationOrder = ["whispering_woods", "crystal_caverns", "volcano_summit", "forgotten_temple", "shadow_realm", "celestial_spire"];
      let mapText = "**\u{1F30D} World Map**\n\n";
      const pathSegments = [];
      for (let i = 0; i < locationOrder.length; i++) {
        const locId = locationOrder[i];
        const location = locations[locId];
        if (location && location.unlocked) {
          pathSegments.push(`${location.emoji} **[${location.name}]**`);
        } else if (location) {
          pathSegments.push("\u{1F512} *[???]*");
        }
        if (i < locationOrder.length - 1) {
          pathSegments.push(" \u2192 ");
        }
      }
      mapText += pathSegments.join("") + "\n\n";
      mapText += "**\u{1F4CD} Discovered Locations:**\n";
      for (const location of availableLocations) {
        mapText += `${location.emoji} **${location.name}** (Level ${location.level}) - ${location.type}
`;
      }
      const mapEmbed = new EmbedBuilder().setTitle("\u{1F5FA}\uFE0F World Map").setColor(39423).setDescription(mapText).setFooter({ text: "Use /explore locations to view details and rewards for each location" });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`explore_unlock:${interaction.user.id}`).setLabel("\u{1F513} Discover More").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`explore_map:${interaction.user.id}`).setLabel("\u{1F5FA}\uFE0F View Map").setStyle(ButtonStyle.Secondary)
      );
      await safeInteractionUpdate(interaction, { embeds: [mapEmbed], components: [row] });
      return;
    }
    if (action === "rpg_leaderboard") {
      const [, offset, targetUserId] = interaction.customId.split(":");
      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error("Wrong user"));
        return safeInteractionReply(interaction, { content: "You cannot view another user's leaderboard.", flags: MessageFlags.Ephemeral });
      }
      const limit = 10;
      const offsetNum = Number.parseInt(offset || "0") || 0;
      let board = [], total = 0;
      try {
        board = getLeaderboard(limit, offsetNum);
        total = getLeaderboardCount();
      } catch {
        board = [];
        total = 0;
      }
      const totalPages = Math.ceil(total / limit);
      const page = Math.floor(offsetNum / limit) + 1;
      const list = board.map((p, i) => `${offsetNum + i + 1}. ${p.name} \u2014 Level ${p.lvl} XP ${p.xp} ATK ${p.atk}`).join("\n");
      const embed = new EmbedBuilder().setTitle("\u{1F3C6} RPG Leaderboard").setColor(16766720).setDescription(`Leaderboard \u2014 Page ${page}/${totalPages}

${list}`);
      const row = new ActionRowBuilder();
      if (offsetNum > 0) row.addComponents(new ButtonBuilder().setCustomId(`rpg_leaderboard:${Math.max(0, offsetNum - limit)}:${interaction.user.id}`).setLabel("Prev").setStyle(ButtonStyle.Secondary));
      if (offsetNum + limit < total) row.addComponents(new ButtonBuilder().setCustomId(`rpg_leaderboard:${offsetNum + limit}:${interaction.user.id}`).setLabel("Next").setStyle(ButtonStyle.Primary));
      await safeInteractionUpdate(interaction, { embeds: [embed], components: row.components.length > 0 ? [row] : [] });
      return;
    }
    if (action === "rpg_reset_modal") {
      const targetUserId = interaction.customId.split(":")[2];
      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error("Wrong user"));
        return safeInteractionReply(interaction, { content: "You cannot reset another user's character.", flags: MessageFlags.Ephemeral });
      }
      const modal = new ModalBuilder().setCustomId(`rpg_reset_confirm:btn:${interaction.user.id}:${arg3 || "warrior"}`).setTitle("Confirm Reset");
      const input = new TextInputBuilder().setCustomId("confirm_text").setLabel("Type RESET to confirm").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("RESET");
      modal.addComponents(input);
      await interaction.showModal(modal);
      return;
    }
    if (action === "explore_investigate") {
      const [, locationId, targetUserId] = interaction.customId.split(":");
      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error("Wrong user"));
        return safeInteractionReply(interaction, { content: "You cannot explore for another user.", flags: MessageFlags.Ephemeral });
      }
      const char2 = getCharacter(interaction.user.id);
      if (!char2) {
        return safeInteractionReply(interaction, { content: "\u274C You need to create a character first!", flags: MessageFlags.Ephemeral });
      }
      const locations = getLocations();
      const location = Object.values(locations).find((l) => l.id === locationId);
      if (!location) {
        return safeInteractionReply(interaction, { content: "\u274C Location not found.", flags: MessageFlags.Ephemeral });
      }
      const events = ["monster", "treasure", "npc"];
      const event = events[Math.floor(Math.random() * events.length)];
      let result, xpGain = 0, goldGain = 0;
      if (event === "monster") {
        const monster = encounterMonster(char2.lvl);
        const damage = fightTurn(char2, monster);
        if (damage > 0) {
          char2.hp -= damage;
          if (char2.hp <= 0) {
            char2.hp = 1;
          }
        }
        result = `\u{1F50D} You investigate the area and encounter a **${monster.name}**!
\u2694\uFE0F You take **${damage}** damage. HP: ${char2.hp}/${char2.maxHp}`;
        xpGain = 5;
      } else if (event === "treasure") {
        const gold = Math.floor(Math.random() * 20) + 5;
        char2.gold += gold;
        goldGain = gold;
        result = `\u{1F50D} You discover a hidden treasure chest!
\u{1F4B0} You find **${gold}** gold!`;
        xpGain = 3;
      } else {
        result = "\u{1F50D} You meet a friendly traveler who shares some wisdom!\n\u{1F4D6} You gain some experience from the conversation.";
        xpGain = 2;
      }
      applyXp(interaction.user.id, char2, xpGain);
      saveCharacter(interaction.user.id, char2);
      const embed = new EmbedBuilder().setTitle("\u{1F50D} Investigation Results").setColor(5025616).setDescription(result).addFields(
        { name: "\u{1F4CA} Stats", value: `Level ${char2.lvl} \u2022 XP ${char2.xp} \u2022 Gold ${char2.gold}`, inline: true }
      );
      await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      return;
    }
    if (action === "explore_search") {
      const [, locationId, targetUserId] = interaction.customId.split(":");
      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error("Wrong user"));
        return safeInteractionReply(interaction, { content: "You cannot explore for another user.", flags: MessageFlags.Ephemeral });
      }
      const char2 = getCharacter(interaction.user.id);
      if (!char2) {
        return safeInteractionReply(interaction, { content: "\u274C You need to create a character first!", flags: MessageFlags.Ephemeral });
      }
      const locations = getLocations();
      const location = Object.values(locations).find((l) => l.id === locationId);
      if (!location) {
        return safeInteractionReply(interaction, { content: "\u274C Location not found.", flags: MessageFlags.Ephemeral });
      }
      const events = ["monster", "monster", "treasure", "treasure", "trap"];
      const event = events[Math.floor(Math.random() * events.length)];
      let result, xpGain = 0, goldGain = 0, itemGain = null;
      switch (event) {
        case "monster": {
          const monster = encounterMonster(char2.lvl + 1);
          const damage = fightTurn(char2, monster);
          if (damage > 0) {
            char2.hp -= damage;
            if (char2.hp <= 0) {
              char2.hp = 1;
            }
          }
          result = `\u2694\uFE0F You search aggressively and fight a **${monster.name}**!
\u{1F4A5} You take **${damage}** damage. HP: ${char2.hp}/${char2.maxHp}`;
          xpGain = 8;
          xpGain = 8;
          break;
        }
        case "treasure": {
          const gold = Math.floor(Math.random() * 50) + 10;
          char2.gold += gold;
          goldGain = gold;
          result = `\u{1F4B0} You find a valuable treasure hoard!
\u{1FA99} You gain **${gold}** gold!`;
          xpGain = 5;
          break;
        }
        case "trap": {
          const damage = Math.floor(Math.random() * 15) + 5;
          char2.hp -= damage;
          if (char2.hp <= 0) {
            char2.hp = 1;
          }
          result = `\u26A0\uFE0F You trigger a trap!
\u{1F4A5} You take **${damage}** damage. HP: ${char2.hp}/${char2.maxHp}`;
          xpGain = 1;
          break;
        }
      }
      applyXp(interaction.user.id, char2, xpGain);
      saveCharacter(interaction.user.id, char2);
      const embed = new EmbedBuilder().setTitle("\u2694\uFE0F Search Results").setColor(event === "trap" ? 16711680 : 2201331).setDescription(result).addFields(
        { name: "\u{1F4CA} Stats", value: `Level ${char2.lvl} \u2022 XP ${char2.xp} \u2022 Gold ${char2.gold}`, inline: true }
      );
      await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      return;
    }
    if (action === "explore_rest") {
      const [, locationId, targetUserId] = interaction.customId.split(":");
      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error("Wrong user"));
        return safeInteractionReply(interaction, { content: "You cannot rest for another user.", flags: MessageFlags.Ephemeral });
      }
      const char2 = getCharacter(interaction.user.id);
      if (!char2) {
        return safeInteractionReply(interaction, { content: "\u274C You need to create a character first!", flags: MessageFlags.Ephemeral });
      }
      try {
        const hpGain = Math.floor(char2.maxHp * 0.3);
        const mpGain = Math.floor(char2.maxMp * 0.2);
        char2.hp = Math.min(char2.maxHp, char2.hp + hpGain);
        char2.mp = Math.min(char2.maxMp, char2.mp + mpGain);
        saveCharacter(interaction.user.id, char2);
        const embed = new EmbedBuilder().setTitle("\u{1F6CC} Rest Results").setColor(5025616).setDescription(`You take a peaceful rest in the safety of ${locationId}.
\u2764\uFE0F HP +${hpGain} \u2192 ${char2.hp}/${char2.maxHp}
\u{1F535} MP +${mpGain} \u2192 ${char2.mp}/${char2.maxMp}`).addFields(
          { name: "\u{1F4CA} Stats", value: `Level ${char2.lvl} \u2022 XP ${char2.xp} \u2022 Gold ${char2.gold}`, inline: true }
        );
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
        return;
      } catch (error) {
        logger.error("Error during rest", error instanceof Error ? error : new Error(String(error)), {
          userId: interaction.user.id,
          locationId
        });
        return safeInteractionReply(interaction, { content: "\u274C **Failed to rest!** Please try again later.", flags: MessageFlags.Ephemeral });
      }
      if (action === "explore_continue") {
        const [, locationName, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          return safeInteractionReply(interaction, { content: "You cannot continue adventure for another user.", flags: MessageFlags.Ephemeral });
        }
        const char3 = getCharacter(interaction.user.id);
        if (!char3) {
          return safeInteractionReply(interaction, { content: "\u274C You need to create a character first!", flags: MessageFlags.Ephemeral });
        }
        const event = randomEventType();
        let result, xpGain = 0;
        switch (event) {
          case "monster": {
            const monster = encounterMonster(char3.lvl);
            const damage = fightTurn(char3, monster);
            if (damage > 0) {
              char3.hp -= damage;
              if (char3.hp <= 0) {
                char3.hp = 1;
              }
            }
            result = `\u{1F3C3} You continue your adventure and encounter a **${monster.name}**!
\u2694\uFE0F You take **${damage}** damage. HP: ${char3.hp}/${char3.maxHp}`;
            xpGain = 6;
            break;
          }
          case "treasure": {
            const gold = Math.floor(Math.random() * 30) + 10;
            char3.gold += gold;
            result = `\u{1F3C3} You discover treasure along the way!
\u{1F4B0} You find **${gold}** gold!`;
            xpGain = 4;
            break;
          }
          case "trap": {
            const damage = Math.floor(Math.random() * 10) + 3;
            char3.hp -= damage;
            if (char3.hp <= 0) {
              char3.hp = 1;
            }
            result = `\u{1F3C3} You trigger a trap while exploring!
\u{1F4A5} You take **${damage}** damage. HP: ${char3.hp}/${char3.maxHp}`;
            xpGain = 2;
            break;
          }
          default: {
            result = "\u{1F3C3} You meet helpful travelers who guide you safely!\n\u{1F4D6} You learn from their stories.";
            xpGain = 3;
          }
        }
        applyXp(interaction.user.id, char3, xpGain);
        saveCharacter(interaction.user.id, char3);
        const embed = new EmbedBuilder().setTitle("\u{1F3C3} Continue Adventure").setColor(2201331).setDescription(result).addFields(
          { name: "\u{1F4CA} Stats", value: `Level ${char3.lvl} \u2022 XP ${char3.xp} \u2022 Gold ${char3.gold}`, inline: true }
        );
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
        return;
      }
      if (action === "explore_leave") {
        const [, locationName, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          return safeInteractionReply(interaction, { content: "You cannot leave for another user.", flags: MessageFlags.Ephemeral });
        }
        const embed = new EmbedBuilder().setTitle("\u{1F3C3} Leave Location").setColor(16750592).setDescription(`You safely leave ${locationName} and return to town.

*Your adventure continues another day!*`);
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
        return;
      }
      if (action === "economy_transfer") {
        const [, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          await safeInteractionReply(interaction, { content: "You cannot transfer for another user.", flags: MessageFlags.Ephemeral });
          return;
        }
        const modal = new ModalBuilder().setCustomId(`economy_transfer_modal:${interaction.user.id}`).setTitle("Transfer Gold");
        const recipientInput = new TextInputBuilder().setCustomId("recipient").setLabel("Recipient (username)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("username");
        const amountInput = new TextInputBuilder().setCustomId("amount").setLabel("Amount").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("100");
        modal.addComponents(recipientInput, amountInput);
        await interaction.showModal(modal);
        return;
      }
      if (action === "economy_market") {
        const [, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          await safeInteractionReply(interaction, { content: "You cannot access market for another user.", flags: MessageFlags.Ephemeral });
          return;
        }
        const marketPrices = getMarketPrice();
        const embed = new EmbedBuilder().setTitle("\u{1F6D2} Market Prices").setColor(5025616).setDescription("Current market prices:");
        for (const [item, price] of Object.entries(marketPrices)) {
          embed.addFields({
            name: item.charAt(0).toUpperCase() + item.slice(1),
            value: `${price} gold`,
            inline: true
          });
        }
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`economy_buy:${interaction.user.id}`).setLabel("\u{1F6D2} Buy").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`economy_sell:${interaction.user.id}`).setLabel("\u{1F4B8} Sell").setStyle(ButtonStyle.Success)
        );
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [row.map((r) => r.toJSON ? r.toJSON() : r)] });
        return;
      }
      if (action === "economy_business") {
        const [, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          await safeInteractionReply(interaction, { content: "You cannot manage business for another user.", flags: MessageFlags.Ephemeral });
          return;
        }
        const income = Math.floor(Math.random() * 50) + 10;
        const balanceUpdate = addBalance(interaction.user.id, income);
        const embed = new EmbedBuilder().setTitle("\u{1F3EA} Business Income").setColor(5025616).setDescription(`Your business generated **${income}** gold today!
\u{1F4B0} New balance: **${balanceUpdate}** gold`);
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
        return;
      }
      if (action === "economy_invest") {
        const [, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          await safeInteractionReply(interaction, { content: "You cannot invest for another user.", flags: MessageFlags.Ephemeral });
          return;
        }
        const currentBalance = getBalance(interaction.user.id);
        if (currentBalance < 100) {
          await safeInteractionReply(interaction, { content: "\u274C You need at least 100 gold to invest.", flags: MessageFlags.Ephemeral });
          return;
        }
        const investment = 100;
        const returns = Math.random() > 0.5 ? investment * 1.5 : investment * 0.8;
        const profit = returns - investment;
        if (profit > 0) {
          addBalance(interaction.user.id, profit);
        } else {
          addBalance(interaction.user.id, profit);
        }
        const embed = new EmbedBuilder().setTitle("\u{1F4C8} Investment Results").setColor(profit > 0 ? 5025616 : 16711680).setDescription(`You invested **${investment}** gold.
${profit > 0 ? "\u{1F4C8} Profit" : "\u{1F4C9} Loss"}: **${Math.abs(profit)}** gold
\u{1F4B0} New balance: **${getBalance(interaction.user.id)}** gold`);
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
        return;
      }
      if (action === "economy_buy") {
        const [, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          await safeInteractionReply(interaction, { content: "You cannot buy for another user.", flags: MessageFlags.Ephemeral });
          return;
        }
        const marketPrices = getMarketPrice();
        const embed = new EmbedBuilder().setTitle("\u{1F6D2} Buy from Market").setColor(2201331).setDescription("Select an item to buy:");
        let description = "";
        for (const [item, price] of Object.entries(marketPrices)) {
          description += `\u2022 ${item.charAt(0).toUpperCase() + item.slice(1)}: ${price} gold
`;
        }
        description += "\n*Use the modal to specify what you want to buy.*";
        embed.setDescription(description);
        const modal = new ModalBuilder().setCustomId(`economy_buy_modal:${interaction.user.id}`).setTitle("Buy Item");
        const itemInput = new TextInputBuilder().setCustomId("item_name").setLabel("Item Name").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("health_potion");
        const quantityInput = new TextInputBuilder().setCustomId("quantity").setLabel("Quantity").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("1");
        modal.addComponents(itemInput, quantityInput);
        await interaction.showModal(modal);
        return;
      }
      if (action === "economy_sell") {
        const [, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          await safeInteractionReply(interaction, { content: "You cannot sell for another user.", flags: MessageFlags.Ephemeral });
          return;
        }
        const char3 = getCharacter(interaction.user.id);
        if (!char3) {
          await safeInteractionReply(interaction, { content: "\u274C You need to create a character first!", flags: MessageFlags.Ephemeral });
          return;
        }
        const inventory = getInventory(interaction.user.id);
        if (Object.keys(inventory).length === 0) {
          await safeInteractionReply(interaction, { content: "\u274C Your inventory is empty!", flags: MessageFlags.Ephemeral });
          return;
        }
        const embed = new EmbedBuilder().setTitle("\u{1F4B8} Sell Items").setColor(16750592).setDescription("Select items to sell from your inventory:");
        let description = "";
        for (const [
          /** @type {string} */
          itemId,
          /** @type {number} */
          quantity
        ] of Object.entries(inventory)) {
          const item = getItemInfo(itemId);
          if (item) {
            const sellPrice = Math.floor(item.value * 0.7);
            description += `\u2022 ${item.name}: ${quantity}x (${sellPrice} gold each)
`;
          }
        }
        description += "\n*Use the modal to specify what you want to sell.*";
        embed.setDescription(description);
        const modal = new ModalBuilder().setCustomId(`economy_sell_modal:${interaction.user.id}`).setTitle("Sell Item");
        const itemInput = new TextInputBuilder().setCustomId("item_name").setLabel("Item Name").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("health_potion");
        const quantityInput = new TextInputBuilder().setCustomId("quantity").setLabel("Quantity").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("1");
        modal.addComponents(itemInput, quantityInput);
        await interaction.showModal(modal);
        return;
      }
      if (action === "trade_create_auction") {
        const [, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          return safeInteractionReply(interaction, { content: "You cannot create auctions for another user.", flags: MessageFlags.Ephemeral });
        }
        const modal = new ModalBuilder().setCustomId(`trade_create_auction_modal:${interaction.user.id}`).setTitle("Create Auction");
        const itemInput = new TextInputBuilder().setCustomId("item_name").setLabel("Item Name").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("health_potion");
        const quantityInput = new TextInputBuilder().setCustomId("quantity").setLabel("Quantity").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("1");
        const priceInput = new TextInputBuilder().setCustomId("starting_price").setLabel("Starting Price (gold)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("50");
        modal.addComponents(
          { type: 1, components: [itemInput] },
          { type: 1, components: [quantityInput] },
          { type: 1, components: [priceInput] }
        );
        await interaction.showModal(modal);
        return;
      }
      if (action === "trade_view_auctions") {
        const [, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          return safeInteractionReply(interaction, { content: "You cannot view auctions for another user.", flags: MessageFlags.Ephemeral });
        }
        const auctions = getActiveAuctions();
        const embed = new EmbedBuilder().setTitle("\u{1F50D} Active Auctions").setColor(2201331).setDescription(
          auctions.length > 0 ? auctions.slice(0, 10).map((a) => `\u2022 ${a.itemName} x${a.quantity} - Starting: ${a.startingPrice} gold - Seller: ${a.seller}`).join("\n") : "No active auctions at the moment."
        );
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
        return;
      }
      if (action === "profile_edit") {
        const [, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          return safeInteractionReply(interaction, { content: "You cannot edit another user's profile.", flags: MessageFlags.Ephemeral });
        }
        const modal = new ModalBuilder().setCustomId(`profile_edit_modal:${interaction.user.id}`).setTitle("Edit Profile");
        const displayNameInput = new TextInputBuilder().setCustomId("display_name").setLabel("Display Name").setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder("Your display name");
        modal.addComponents({ type: 1, components: [displayNameInput] });
        await interaction.showModal(modal);
        return;
      }
      if (action === "profile_refresh") {
        const [, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          return safeInteractionReply(interaction, { content: "You cannot refresh another user's profile.", flags: MessageFlags.Ephemeral });
        }
        const profile = updateProfile(interaction.user.id, {});
        const embed = new EmbedBuilder().setTitle("\u{1F504} Profile Refreshed").setColor(5025616).setDescription("Profile data has been refreshed!");
        await safeInteractionUpdate(interaction, { embeds: [embed], components: interaction.message.components });
        return;
      }
      if (action === "profile_compare") {
        const [, targetUserId2, compareUserId] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          return safeInteractionReply(interaction, { content: "You cannot compare profiles for another user.", flags: MessageFlags.Ephemeral });
        }
        validateUserId(compareUserId);
        const targetProfile = updateProfile(interaction.user.id, {});
        const compareProfile = updateProfile(compareUserId, {});
        if (!interaction.guild) {
          return await safeInteractionReply(interaction, { content: "\u274C **Profile comparison is only available in servers.**", flags: MessageFlags.Ephemeral });
        }
        if (!compareUserId) {
          return await safeInteractionReply(interaction, { content: "\u274C **Invalid user ID for comparison.**", flags: MessageFlags.Ephemeral });
        }
        const compareUser = interaction.guild.members.cache.get(compareUserId)?.user;
        if (!compareUser) {
          return safeInteractionReply(interaction, { content: "\u274C Could not find the user to compare with.", flags: MessageFlags.Ephemeral });
        }
        const embed = new EmbedBuilder().setTitle("\u2696\uFE0F Profile Comparison").setColor(2201331).setDescription(`Comparing **${interaction.user.username}** vs **${compareUser.username}**`);
        if (targetProfile.level !== void 0 && compareProfile.level !== void 0) {
          const levelDiff = targetProfile.level - compareProfile.level;
          embed.addFields({
            name: "\u{1F3C6} Level",
            value: `**${interaction.user.username}:** ${targetProfile.level}
**${compareUser.username}:** ${compareProfile.level}
${levelDiff > 0 ? `\u{1F4C8} You are ${levelDiff} levels ahead` : levelDiff < 0 ? `\u{1F4C9} You are ${Math.abs(levelDiff)} levels behind` : "\u2696\uFE0F Same level"}`,
            inline: true
          });
        }
        if (targetProfile.xp !== void 0 && compareProfile.xp !== void 0) {
          const xpDiff = targetProfile.xp - compareProfile.xp;
          embed.addFields({
            name: "\u2B50 Experience",
            value: `**${interaction.user.username}:** ${targetProfile.xp}
**${compareUser.username}:** ${compareProfile.xp}
${xpDiff > 0 ? `\u{1F4C8} You have ${xpDiff} more XP` : xpDiff < 0 ? `\u{1F4C9} You have ${Math.abs(xpDiff)} less XP` : "\u2696\uFE0F Same XP"}`,
            inline: true
          });
        }
        if (targetProfile.gold !== void 0 && compareProfile.gold !== void 0) {
          const goldDiff = targetProfile.gold - compareProfile.gold;
          embed.addFields({
            name: "\u{1F4B0} Gold",
            value: `**${interaction.user.username}:** ${targetProfile.gold}
**${compareUser.username}:** ${compareProfile.gold}
${goldDiff > 0 ? `\u{1F4C8} You have ${goldDiff} more gold` : goldDiff < 0 ? `\u{1F4C9} You have ${Math.abs(goldDiff)} less gold` : "\u2696\uFE0F Same gold amount"}`,
            inline: true
          });
        }
        if (targetProfile.achievements !== void 0 && compareProfile.achievements !== void 0) {
          const achievementsDiff = targetProfile.achievements - compareProfile.achievements;
          embed.addFields({
            name: "\u{1F3C5} Achievements",
            value: `**${interaction.user.username}:** ${targetProfile.achievements}
**${compareUser.username}:** ${compareProfile.achievements}
${achievementsDiff > 0 ? `\u{1F4C8} You have ${achievementsDiff} more achievements` : achievementsDiff < 0 ? `\u{1F4C9} You have ${Math.abs(achievementsDiff)} fewer achievements` : "\u2696\uFE0F Same number of achievements"}`,
            inline: true
          });
        }
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
        return;
      }
      if (action === "remind_upcoming") {
        const [, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          return safeInteractionReply(interaction, { content: "You cannot view reminders for another user.", flags: MessageFlags.Ephemeral });
        }
        const embed = new EmbedBuilder().setTitle("\u{1F4C5} Upcoming Reminders").setColor(16750592).setDescription("No upcoming reminders set.");
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
        return;
      }
      if (action.startsWith("memory_")) {
        const parts = interaction.customId.split("_");
        const cardIndexStr = parts[1];
        const messageId = interaction.message.id;
        if (cardIndexStr === "reset") {
          const targetUserId2 = interaction.customId.split(":")[2];
          if (targetUserId2 && targetUserId2 !== interaction.user.id) {
            logCommandExecution(interaction, false, new Error("Wrong user"));
            return safeInteractionReply(interaction, { content: "You cannot reset memory for another user.", flags: MessageFlags.Ephemeral });
          }
          const gameState2 = memoryGames.get(messageId);
          if (!gameState2) {
            return safeInteractionReply(interaction, { content: "\u274C **Memory game not found!**", flags: MessageFlags.Ephemeral });
          }
          gameState2.flippedCards = [];
          gameState2.moves++;
          await sendMemoryBoard(interaction, gameState2);
          return;
        }
        const cardIndex = Number.parseInt(cardIndexStr || "0");
        if (isNaN(cardIndex) || cardIndex < 0 || cardIndex >= 12) {
          return safeInteractionReply(interaction, { content: "\u274C **Invalid card!**", flags: MessageFlags.Ephemeral });
        }
        const gameState = memoryGames.get(messageId);
        if (!gameState) {
          return safeInteractionReply(interaction, { content: "\u274C **Memory game not found!**", flags: MessageFlags.Ephemeral });
        }
        if (!gameState.gameActive) {
          return safeInteractionReply(interaction, { content: "\u274C **Game is already completed!**", flags: MessageFlags.Ephemeral });
        }
        const card = gameState.cards[cardIndex];
        if (card.isMatched) {
          return safeInteractionReply(interaction, { content: "\u274C **Card is already matched!**", flags: MessageFlags.Ephemeral });
        }
        if (gameState.flippedCards.includes(cardIndex)) {
          return safeInteractionReply(interaction, { content: "\u274C **Card is already flipped!**", flags: MessageFlags.Ephemeral });
        }
        gameState.flippedCards.push(cardIndex);
        gameState.moves++;
        if (gameState.flippedCards.length === 2) {
          const [firstIndex, secondIndex] = gameState.flippedCards;
          const firstCard = gameState.cards[firstIndex];
          const secondCard = gameState.cards[secondIndex];
          if (firstCard.emoji === secondCard.emoji) {
            firstCard.isMatched = true;
            secondCard.isMatched = true;
            gameState.matchedPairs++;
            gameState.flippedCards = [];
            if (gameState.matchedPairs === gameState.totalPairs) {
              gameState.gameActive = false;
              const timeElapsed = Math.round((Date.now() - gameState.startTime) / 1e3);
              const winEmbed = new EmbedBuilder().setTitle("\u{1F389} Memory Master!").setDescription(`Congratulations! You matched all ${gameState.totalPairs} pairs in ${gameState.moves} moves and ${timeElapsed} seconds! \u{1F3C6}`).setColor(65280).addFields(
                {
                  name: "\u{1F4CA} Stats",
                  value: `**Moves:** ${gameState.moves}
**Time:** ${timeElapsed}s
**Efficiency:** ${(gameState.totalPairs / gameState.moves * 100).toFixed(1)}%`,
                  inline: true
                },
                {
                  name: "\u{1F3C6} Rating",
                  value: getPerformanceRating(gameState.moves, gameState.totalPairs, timeElapsed),
                  inline: true
                }
              );
              memoryGames.delete(messageId);
              await safeInteractionUpdate(interaction, { embeds: [winEmbed], components: [] });
              return;
            }
          } else {
          }
        }
        await sendMemoryBoard(interaction, gameState);
        return;
      }
      if (action === "inventory_refresh") {
        const [, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          await safeInteractionReply(interaction, { content: "You cannot refresh inventory for another user.", flags: MessageFlags.Ephemeral });
          return;
        }
        const char3 = getCharacter(interaction.user.id);
        if (!char3) {
          await safeInteractionReply(interaction, { content: "\u274C You need to create a character first!", flags: MessageFlags.Ephemeral });
          return;
        }
        const inventory = getInventory(interaction.user.id);
        const inventoryValue = getInventoryValue(interaction.user.id);
        const embed = new EmbedBuilder().setTitle("\u{1F392} Inventory").setColor(9127187).setDescription(`\u{1F4B0} Total Value: ${inventoryValue} gold`);
        for (const [itemId, quantity] of Object.entries(inventory)) {
          const item = getItemInfo(itemId);
          if (item) {
            embed.addFields({
              name: `${item.name}`,
              value: `Quantity: ${quantity} (${item.value} gold each)`,
              inline: true
            });
          }
        }
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`inventory_random:${interaction.user.id}`).setLabel("\u{1F3B2} Get Random Item").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`inventory_sell_all:${interaction.user.id}`).setLabel("\u{1F4B0} Sell All Junk").setStyle(ButtonStyle.Success)
        );
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
        return;
      }
      if (action === "inventory_random") {
        const [, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          return safeInteractionReply(interaction, { content: "You cannot get random items for another user.", flags: MessageFlags.Ephemeral });
        }
        const char3 = getCharacter(interaction.user.id);
        if (!char3) {
          return safeInteractionReply(interaction, { content: "\u274C You need to create a character first!", flags: MessageFlags.Ephemeral });
        }
        const randomItem = generateRandomItem(char3.lvl);
        addItemToInventory(interaction.user.id, randomItem.id, 1);
        const embed = new EmbedBuilder().setTitle("\u{1F3B2} Random Item").setColor(16766720).setDescription(`You found a **${randomItem.name}**!

${randomItem.description}`).addFields(
          { name: "\u{1F4CA} Stats", value: `Rarity: ${randomItem.rarity} \u2022 Value: ${randomItem.value} gold`, inline: true }
        );
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
        return;
      }
      if (action === "inventory_sell_all") {
        const [, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          return safeInteractionReply(interaction, { content: "You cannot sell items for another user.", flags: MessageFlags.Ephemeral });
        }
        const char3 = getCharacter(interaction.user.id);
        if (!char3) {
          return safeInteractionReply(interaction, { content: "\u274C You need to create a character first!", flags: MessageFlags.Ephemeral });
        }
        const inventory = getInventory(interaction.user.id);
        let totalGold = 0;
        let itemsSold = 0;
        for (const [itemId, quantity] of Object.entries(inventory)) {
          const item = getItemInfo(itemId);
          if (item && item.rarity === "common") {
            const sellPrice = Math.floor(item.value * 0.5);
            totalGold += sellPrice * quantity;
            itemsSold += quantity;
            removeItemFromInventory(interaction.user.id, itemId, quantity);
          }
        }
        char3.gold += totalGold;
        saveCharacter(interaction.user.id, char3);
        const embed = new EmbedBuilder().setTitle("\u{1F4B0} Sold Junk Items").setColor(5025616).setDescription(`Sold ${itemsSold} common items for ${totalGold} gold!
\u{1F4B0} New balance: ${char3.gold} gold`);
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
        return;
      }
      if (action === "guild_contribute") {
        const [, guildName, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          return safeInteractionReply(interaction, { content: "You cannot contribute to guild for another user.", flags: MessageFlags.Ephemeral });
        }
        const modal = new ModalBuilder().setCustomId(`guild_contribute_modal:${guildName}:${interaction.user.id}`).setTitle("Contribute to Guild");
        const amountInput = new TextInputBuilder().setCustomId("amount").setLabel("Gold Amount").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("100");
        modal.addComponents({ type: 1, components: [amountInput] });
        await interaction.showModal(modal);
        return;
      }
      if (action === "guild_refresh") {
        const [, guildName, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          return safeInteractionReply(interaction, { content: "You cannot refresh guild for another user.", flags: MessageFlags.Ephemeral });
        }
        const guildInfo = getUserGuild(interaction.user.id);
        const embed = new EmbedBuilder().setTitle("\u{1F504} Guild Refreshed").setColor(5025616).setDescription(`${guildName || guildInfo?.name || "Guild"} data has been refreshed!`);
        await safeInteractionUpdate(interaction, { embeds: [embed], components: interaction.message.components });
        return;
      }
      if (action === "party_invite") {
        const [, partyId, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          return safeInteractionReply(interaction, { content: "You cannot generate invites for another user.", flags: MessageFlags.Ephemeral });
        }
        const embed = new EmbedBuilder().setTitle("\u{1F517} Party Invite Generated").setColor(2201331).setDescription(`Invite link for party ${partyId}: \`/join ${partyId}\``);
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
        return;
      }
      if (action === "guess_modal") {
        const [, gameId, min, max] = interaction.customId.split(":");
        const gameState = guessGames.get(gameId);
        if (!gameState) {
          return safeInteractionReply(interaction, {
            content: "\u274C **Game not found!** The game may have expired.",
            flags: MessageFlags.Ephemeral
          });
        }
        if (!gameState.gameActive) {
          return safeInteractionReply(interaction, {
            content: "\u274C **Game is no longer active!**",
            flags: MessageFlags.Ephemeral
          });
        }
        const modal = new ModalBuilder().setCustomId(`guess_submit:${gameId}`).setTitle("Make Your Guess");
        const guessInput = new TextInputBuilder().setCustomId("guess_number").setLabel(`Guess a number between ${min} and ${max}`).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(`${min}-${max}`);
        modal.addComponents(new ActionRowBuilder().addComponents(guessInput));
        await interaction.showModal(modal);
        return;
      }
      if (action === "fun_joke") {
        const [, category, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          await safeInteractionReply(interaction, { content: "You cannot get jokes for another user.", flags: MessageFlags.Ephemeral });
          return;
        }
        const joke = getRandomJoke(category);
        const embed = new EmbedBuilder().setTitle("\u{1F602} Joke").setColor(16766720).setDescription(String(joke || "No joke available."));
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`fun_joke:${category}:${interaction.user.id}`).setLabel("\u{1F602} Another Joke").setStyle(ButtonStyle.Primary)
        );
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
        return;
      }
      if (action === "fun_rate") {
        const [, jokeId, ratingStr, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          await safeInteractionReply(interaction, { content: "You cannot rate jokes for another user.", flags: MessageFlags.Ephemeral });
          return;
        }
        const rating = Number.parseInt(ratingStr || "0");
        if (isNaN(rating) || rating < 1 || rating > 5) {
          await safeInteractionReply(interaction, { content: "\u274C Invalid rating. Rating must be between 1 and 5 stars.", flags: MessageFlags.Ephemeral });
          return;
        }
        if (!jokeId || jokeId.length < 10) {
          await safeInteractionReply(interaction, { content: "\u274C Invalid joke reference.", flags: MessageFlags.Ephemeral });
          return;
        }
        try {
          const ratingResult = entertainmentManager.rateJoke(jokeId, rating);
          if (ratingResult !== true) {
            return safeInteractionReply(interaction, { content: "\u274C Failed to record your rating. Please try again.", flags: MessageFlags.Ephemeral });
          }
          const embed = new EmbedBuilder().setTitle("\u2B50 Thanks for your rating!").setColor(5025616).setDescription(`You rated this joke with **${rating} star${rating !== 1 ? "s" : ""}!** \u2B50

Your feedback helps improve our joke collection!`).setFooter({ text: "Rating recorded successfully" });
          await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
        } catch (error) {
          logger.error("Error rating joke", error instanceof Error ? error : new Error(String(error)), {
            userId: interaction.user.id,
            jokeId,
            rating
          });
          return safeInteractionReply(interaction, { content: "\u274C An error occurred while recording your rating. Please try again.", flags: MessageFlags.Ephemeral });
        }
        return;
      }
      if (action === "fun_story") {
        const [, genre, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          await safeInteractionReply(interaction, { content: "You cannot get stories for another user.", flags: MessageFlags.Ephemeral });
          return;
        }
        const story = generateStory(genre);
        const embed = new EmbedBuilder().setTitle("\u{1F4D6} Story").setColor(10040012).setDescription(String(story || "No story available."));
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`fun_story:${genre}:${interaction.user.id}`).setLabel("\u{1F4D6} Another Story").setStyle(ButtonStyle.Primary)
        );
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
        return;
      }
      if (action === "fun_share") {
        const [, contentId, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          await safeInteractionReply(interaction, { content: "You cannot share for another user.", flags: MessageFlags.Ephemeral });
          return;
        }
        if (targetUserId2 !== interaction.user.id) {
          await safeInteractionReply(interaction, {
            content: "\u274C **Sharing failed!** User ID mismatch.",
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        const { getContentForSharing } = await import("./entertainment.js");
        const content = getContentForSharing(contentId);
        if (!content) {
          return safeInteractionReply(interaction, {
            content: "\u274C **Content not found!** This content may have expired or is no longer available for sharing.",
            flags: MessageFlags.Ephemeral
          });
        }
        let shareEmbed;
        let shareContent = "";
        try {
          switch (content.type) {
            case "story": {
              shareEmbed = new EmbedBuilder().setTitle(`\u{1F4D6} ${content.genre.charAt(0).toUpperCase() + content.genre.slice(1)} Story`).setColor(10040012).setDescription(content.story).addFields({
                name: "\u{1F3AF} Prompt",
                value: content.prompt,
                inline: false
              }).setFooter({
                text: `Shared by ${interaction.user.username} \u2022 Originally generated from /fun story`,
                iconURL: interaction.user.displayAvatarURL({ dynamic: true })
              });
              break;
            }
            case "fact": {
              shareEmbed = new EmbedBuilder().setTitle(`\u{1F9E0} ${content.category === "random" ? "Random" : content.category.charAt(0).toUpperCase() + content.category.slice(1)} Fun Fact`).setColor(5025616).setDescription(content.fact).setFooter({
                text: `Shared by ${interaction.user.username} \u2022 Originally generated from /fun fact`,
                iconURL: interaction.user.displayAvatarURL({ dynamic: true })
              });
              break;
            }
            case "quote": {
              shareEmbed = new EmbedBuilder().setTitle(`\u{1F4AC} ${content.category.charAt(0).toUpperCase() + content.category.slice(1)} Quote`).setColor(15277667).addFields(
                { name: "Quote", value: `"${content.quote}"`, inline: false },
                { name: "Author", value: content.author, inline: true },
                { name: "Category", value: content.category, inline: true }
              ).setFooter({
                text: `Shared by ${interaction.user.username} \u2022 Originally generated from /fun quote`,
                iconURL: interaction.user.displayAvatarURL({ dynamic: true })
              });
              break;
            }
            default: {
              throw new Error(`Unknown content type: ${content.type}`);
            }
          }
          if (!interaction.channel) {
            const noChannelEmbed = new EmbedBuilder().setTitle("❌ Sharing Failed").setColor(16711680).setDescription("Channel not found to share content.").setFooter({ text: "If this persists, contact the bot administrator" });
            return await safeInteractionUpdate(interaction, { embeds: [noChannelEmbed], components: [] });
          }
          await interaction.channel.send({
            content: `\u{1F4E4} **${interaction.user.username} shared some fun content!**`,
            embeds: [shareEmbed]
          });
          const successEmbed = new EmbedBuilder().setTitle("\u2705 Content Shared Successfully!").setColor(5025616).setDescription("Your content has been shared with the channel!").setFooter({ text: "Thanks for spreading the fun!" });
          await safeInteractionUpdate(interaction, { embeds: [successEmbed], components: [] });
        } catch (error) {
          logger.error("Error sharing fun content", error instanceof Error ? error : new Error(String(error)), {
            userId: interaction.user.id,
            contentId,
            contentType: content.type
          });
          const errorEmbed2 = new EmbedBuilder().setTitle("\u274C Sharing Failed").setColor(16711680).setDescription("Sorry, there was an error sharing your content. Please try again.").setFooter({ text: "If this persists, contact the bot administrator" });
          await safeInteractionUpdate(interaction, { embeds: [errorEmbed2], components: [] });
        }
        return;
      }
      if (action === "fun_riddle") {
        const [, difficulty, riddleId, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          await safeInteractionReply(interaction, { content: "You cannot view riddles for another user.", flags: MessageFlags.Ephemeral });
          return;
        }
        const riddle = getRiddle(difficulty);
        const embed = new EmbedBuilder().setTitle("\u{1F4A1} Riddle").setColor(16750592).setDescription(`**${riddle.question}**

${riddle.hint ? `*Hint: ${riddle.hint}*` : ""}`);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`fun_riddle:${difficulty}:${riddle.id}:${interaction.user.id}`).setLabel("\u{1F4A1} Show Answer").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`fun_riddle_new:${difficulty}:${interaction.user.id}`).setLabel("\u{1F9E9} New Riddle").setStyle(ButtonStyle.Secondary)
        );
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
        return;
      }
      if (action === "fun_riddle_new") {
        const [, difficulty, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          await safeInteractionReply(interaction, { content: "You cannot get new riddles for another user.", flags: MessageFlags.Ephemeral });
          return;
        }
        const riddle = getRiddle(difficulty);
        const embed = new EmbedBuilder().setTitle("\u{1F9E9} New Riddle").setColor(16750592).setDescription(`**${riddle.question}**

${riddle.hint ? `*Hint: ${riddle.hint}*` : ""}`);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`fun_riddle:${difficulty}:${riddle.id}:${interaction.user.id}`).setLabel("\u{1F4A1} Show Answer").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`fun_riddle_new:${difficulty}:${interaction.user.id}`).setLabel("\u{1F9E9} Another Riddle").setStyle(ButtonStyle.Secondary)
        );
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
        return;
      }
      if (action === "fun_fact") {
        const [, category, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          await safeInteractionReply(interaction, { content: "You cannot get facts for another user.", flags: MessageFlags.Ephemeral });
          return;
        }
        const fact = getFunFact(category);
        const factText = typeof fact === "object" && fact && fact.fact ? String(fact.fact) : String(fact || "No fun fact available.");
        const embed = new EmbedBuilder().setTitle("\u{1F9E0} Fun Fact").setColor(5025616).setDescription(`${factText}`);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`fun_fact:${category}:${interaction.user.id}`).setLabel("\u{1F9E0} Another Fact").setStyle(ButtonStyle.Primary)
        );
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
        return;
      }
      if (action === "fun_quote") {
        const [, category, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          await safeInteractionReply(interaction, { content: "You cannot get quotes for another user.", flags: MessageFlags.Ephemeral });
          return;
        }
        const quote = getRandomQuote(category);
        const embed = new EmbedBuilder().setTitle("\u{1F4AC} Quote").setColor(10040012).setDescription(`"${quote.text || "No quote text"}"

\u2014 ${quote.author || "Unknown"}`);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`fun_quote:${category}:${interaction.user.id}`).setLabel("\u{1F4AC} Another Quote").setStyle(ButtonStyle.Primary)
        );
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
        return;
      }
      if (action === "fun_8ball") {
        const [, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          await safeInteractionReply(interaction, { content: "You cannot use 8ball for another user.", flags: MessageFlags.Ephemeral });
          return;
        }
        const answer = magic8Ball();
        const embed = new EmbedBuilder().setTitle("\u{1F52E} Magic 8-Ball").setColor(0).setDescription(`\u{1F3B1} ${answer}`);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`fun_8ball:${interaction.user.id}`).setLabel("\u{1F52E} Ask Again").setStyle(ButtonStyle.Primary)
        );
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
        return;
      }
      if (action === "fun_name") {
        const [, type, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          await safeInteractionReply(interaction, { content: "You cannot generate names for another user.", flags: MessageFlags.Ephemeral });
          return;
        }
        const name = generateFunName(type);
        const embed = new EmbedBuilder().setTitle("\u{1F3AD} Fun Name").setColor(16738740).setDescription(`**${String(name || "No name available")}**`);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`fun_name:${type}:${interaction.user.id}`).setLabel("\u{1F3AD} Another Name").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`fun_name_random:${interaction.user.id}`).setLabel("\u{1F3B2} Random Type").setStyle(ButtonStyle.Secondary)
        );
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
        return;
      }
      if (action === "fun_name_random") {
        const [, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          await safeInteractionReply(interaction, { content: "You cannot generate names for another user.", flags: MessageFlags.Ephemeral });
          return;
        }
        const types = ["hero", "villain", "animal", "object"];
        const randomType = types[Math.floor(Math.random() * types.length)];
        const name = generateFunName(randomType);
        const embed = new EmbedBuilder().setTitle("\u{1F3B2} Random Fun Name").setColor(16738740).setDescription(`**${name}** (${randomType})`);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`fun_name:${randomType}:${interaction.user.id}`).setLabel("\u{1F3AD} Another Name").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`fun_name_random:${interaction.user.id}`).setLabel("\u{1F3B2} Random Type").setStyle(ButtonStyle.Secondary)
        );
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
        return;
      }
      if (action === "fun_challenge") {
        const [, type, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          await safeInteractionReply(interaction, { content: "You cannot get challenges for another user.", flags: MessageFlags.Ephemeral });
          return;
        }
        const challenge = createFunChallenge(type);
        const embed = new EmbedBuilder().setTitle("\u{1F3AF} Challenge").setColor(16729344).setDescription(String(challenge || "No challenge available."));
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`fun_challenge:${type}:${interaction.user.id}`).setLabel("\u{1F3AF} Accept Challenge").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`fun_challenge_new:${type}:${interaction.user.id}`).setLabel("\u{1F504} New Challenge").setStyle(ButtonStyle.Secondary)
        );
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
        return;
      }
      if (action === "fun_challenge_new") {
        const [, type, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          await safeInteractionReply(interaction, { content: "You cannot get challenges for another user.", flags: MessageFlags.Ephemeral });
          return;
        }
        const challenge = createFunChallenge(type);
        const embed = new EmbedBuilder().setTitle("\u{1F504} New Challenge").setColor(16729344).setDescription(String(challenge || "No challenge available."));
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`fun_challenge:${type}:${interaction.user.id}`).setLabel("\u{1F3AF} Accept Challenge").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`fun_challenge_new:${type}:${interaction.user.id}`).setLabel("\u{1F504} Another Challenge").setStyle(ButtonStyle.Secondary)
        );
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
        return;
      }
      if (action === "ai_chat") {
        const [, model, personality, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          await safeInteractionReply(interaction, { content: "You cannot continue chat for another user.", flags: MessageFlags.Ephemeral });
          return;
        }
        const modal = new ModalBuilder().setCustomId(`ai_chat_continue_modal:${model}:${personality}:${interaction.user.id}`).setTitle("Continue AI Chat");
        const messageInput = new TextInputBuilder().setCustomId("message").setLabel("Your message").setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder("What would you like to say next?");
        modal.addComponents({ type: 1, components: [messageInput] });
        await interaction.showModal(modal);
        return;
      }
      if (action === "ai_clear") {
        const [, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          await safeInteractionReply(interaction, { content: "You cannot clear history for another user.", flags: MessageFlags.Ephemeral });
          return;
        }
        const embed = new EmbedBuilder().setTitle("\u{1F5D1}\uFE0F AI History Cleared").setColor(16711680).setDescription("Chat history has been cleared!");
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
        return;
      }
      if (action === "admin_warn") {
        const [, targetUserId2, guildId] = interaction.customId.split(":");
        const embed = new EmbedBuilder().setTitle("\u26A0\uFE0F User Warned").setColor(16753920).setDescription(`User <@${targetUserId2}> has been warned.`);
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
        return;
      }
      if (action === "admin_mute") {
        if (!interaction.guild) {
          return await safeInteractionReply(interaction, { content: "\u274C **Admin commands are only available in servers.**", flags: MessageFlags.Ephemeral });
        }
        const [, targetUserId2, guildId] = interaction.customId.split(":");
        try {
          await muteUser(interaction.guild.id, targetUserId2);
          const embed = new EmbedBuilder().setTitle("\u{1F507} User Muted").setColor(16711680).setDescription(`User <@${targetUserId2}> has been muted.`);
          await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
        } catch {
          await safeInteractionReply(interaction, { content: "\u274C Failed to mute user.", flags: MessageFlags.Ephemeral });
        }
        return;
      }
      if (action === "admin_unmute") {
        if (!interaction.guild) {
          return await safeInteractionReply(interaction, { content: "\u274C **Admin commands are only available in servers.**", flags: MessageFlags.Ephemeral });
        }
        const [, targetUserId2, guildId] = interaction.customId.split(":");
        try {
          await unmuteUser(interaction.guild.id, targetUserId2);
          const embed = new EmbedBuilder().setTitle("\u{1F50A} User Unmuted").setColor(5025616).setDescription(`User <@${targetUserId2}> has been unmuted.`);
          await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
        } catch {
          await safeInteractionReply(interaction, { content: "\u274C Failed to unmute user.", flags: MessageFlags.Ephemeral });
        }
        return;
      }
      if (action === "admin_unban") {
        if (!interaction.guild) {
          return await safeInteractionReply(interaction, { content: "\u274C **Admin commands are only available in servers.**", flags: MessageFlags.Ephemeral });
        }
        const [, targetUserId2, guildId] = interaction.customId.split(":");
        try {
          await unbanUser(interaction.guild.id, targetUserId2);
          const embed = new EmbedBuilder().setTitle("\u2705 User Unbanned").setColor(5025616).setDescription(`User <@${targetUserId2}> has been unbanned.`);
          await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
        } catch {
          await safeInteractionReply(interaction, { content: "\u274C Failed to unban user.", flags: MessageFlags.Ephemeral });
        }
        return;
      }
      if (action === "achievements_refresh") {
        const [, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          return safeInteractionReply(interaction, { content: "You cannot refresh achievements for another user.", flags: MessageFlags.Ephemeral });
        }
        const embed = new EmbedBuilder().setTitle("\u{1F504} Achievements Refreshed").setColor(5025616).setDescription("Achievement data has been refreshed!");
        await safeInteractionUpdate(interaction, { embeds: [embed], components: interaction.message.components });
        return;
      }
      if (action === "achievements_leaderboard") {
        const [, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          return safeInteractionReply(interaction, { content: "You cannot view leaderboard for another user.", flags: MessageFlags.Ephemeral });
        }
        const { getAchievementLeaderboard } = await import("./achievements.js");
        const leaderboard = getAchievementLeaderboard(10);
        if (!leaderboard || leaderboard.length === 0) {
          const embed2 = new EmbedBuilder().setTitle("\u{1F3C5} Achievement Leaderboard").setColor(16766720).setDescription("No achievement data available yet.\n\nComplete achievements to appear on the leaderboard!");
          await safeInteractionUpdate(interaction, { embeds: [embed2], components: [] });
          return;
        }
        const description = leaderboard.map((entry, index) => {
          const medal = index === 0 ? "\u{1F947}" : index === 1 ? "\u{1F948}" : index === 2 ? "\u{1F949}" : `**${index + 1}.**`;
          return `${medal} **${entry.username || entry.userId}** - ${entry.totalAchievements || entry.achievements_count} achievements, ${entry.totalPoints || entry.total_points} points`;
        }).join("\n");
        const embed = new EmbedBuilder().setTitle("\u{1F3C5} Achievement Leaderboard").setColor(16766720).setDescription(description).setFooter({ text: "Top achievers this month" });
        await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
        return;
      }
      if (action === "wordle_guess") {
        const [, targetUserId2] = interaction.customId.split(":");
        if (targetUserId2 && targetUserId2 !== interaction.user.id) {
          logCommandExecution(interaction, false, new Error("Wrong user"));
          return safeInteractionReply(interaction, { content: "You cannot guess for another user.", flags: MessageFlags.Ephemeral });
        }
        await sendWordleGuessModal(interaction, interaction.user.id);
        return;
      }
      if (action === "c4") {
        const [, colStr, gameId] = interaction.customId.split("_");
        const gameState = connect4Games.get(gameId);
        if (!gameState) {
          return safeInteractionReply(interaction, {
            content: "\u274C **Game not found!** The game may have expired or been completed.",
            flags: MessageFlags.Ephemeral
          });
        }
        if (interaction.user.id !== gameState.players[gameState.currentPlayer]?.id) {
          return safeInteractionReply(interaction, {
            content: "\u274C **Not your turn!** Please wait for the other player.",
            flags: MessageFlags.Ephemeral
          });
        }
        const column = Number.parseInt(colStr || "0");
        if (isNaN(column) || column < 0 || column > 6) {
          return safeInteractionReply(interaction, {
            content: "\u274C **Invalid column!** Please select a valid column (1-7).",
            flags: MessageFlags.Ephemeral
          });
        }
        const moveResult = await makeConnect4Move(gameState, column);
        if (!moveResult) {
          return safeInteractionReply(interaction, {
            content: "\u274C **Invalid move!** That column is full.",
            flags: MessageFlags.Ephemeral
          });
        }
        await sendConnect4Board(interaction, gameState);
        return;
      }
      if (action === "ttt") {
        const [, positionStr, gameId] = interaction.customId.split("_");
        const gameState = tttGames.get(gameId);
        if (!gameState) {
          return safeInteractionReply(interaction, {
            content: "\u274C **Game not found!** The game may have expired or been completed.",
            flags: MessageFlags.Ephemeral
          });
        }
        const currentPlayerId = gameState.players[gameState.currentPlayer]?.id;
        if (interaction.user.id !== currentPlayerId) {
          return safeInteractionReply(interaction, {
            content: "\u274C **Not your turn!** Please wait for the other player.",
            flags: MessageFlags.Ephemeral
          });
        }
        const position = Number.parseInt(positionStr || "0");
        if (isNaN(position) || position < 0 || position > 8) {
          return safeInteractionReply(interaction, {
            content: "\u274C **Invalid position!** Please select a valid board position.",
            flags: MessageFlags.Ephemeral
          });
        }
        if (gameState.board[position] !== null) {
          return safeInteractionReply(interaction, {
            content: "\u274C **Position already taken!** Please choose an empty square.",
            flags: MessageFlags.Ephemeral
          });
        }
        gameState.board[position] = gameState.currentPlayer;
        const winner = checkWinner(gameState.board);
        if (winner) {
          gameState.status = "completed";
          if (winner !== "tie") {
            const winnerPlayer = gameState.players[winner];
            if (winnerPlayer.id !== "ai") {
              await updateUserStats(winnerPlayer.id, { games: { tictactoe_wins: 1 } });
            }
          }
          if (gameState.players.X.id !== "ai") {
            await updateUserStats(gameState.players.X.id, { games: { tictactoe_games: 1 } });
          }
          if (gameState.players.O.id !== "ai") {
            await updateUserStats(gameState.players.O.id, { games: { tictactoe_games: 1 } });
          }
          const resultEmbed = new EmbedBuilder().setTitle("\u2B55 Tic-Tac-Toe - Game Over!").setColor(winner === "tie" ? 16753920 : 65280).setDescription(winner === "tie" ? "\u{1F91D} **It's a tie!**" : `\u{1F389} **${gameState.players[winner].name} wins!**`).addFields({
            name: "Final Board",
            value: formatBoard(gameState.board),
            inline: false
          });
          tttGames.delete(gameId);
          await safeInteractionUpdate(interaction, { embeds: [resultEmbed], components: [] });
          return;
        }
        gameState.currentPlayer = gameState.currentPlayer === "X" ? "O" : "X";
        if (gameState.isAI && gameState.currentPlayer === "O" && gameState.status === "active") {
          const { getAIMove } = await import("./commands/tictactoe.js");
          const aiMove = getAIMove(gameState.board, gameState.difficulty);
          if (aiMove !== null) {
            gameState.board[aiMove] = "O";
            gameState.currentPlayer = "X";
            const aiWinner = checkWinner(gameState.board);
            if (aiWinner) {
              gameState.status = "completed";
              if (aiWinner !== "tie") {
                const winnerPlayer = gameState.players[aiWinner];
                if (winnerPlayer.id !== "ai") {
                  await updateUserStats(winnerPlayer.id, { games: { tictactoe_wins: 1 } });
                }
              }
              if (gameState.players.X.id !== "ai") {
                await updateUserStats(gameState.players.X.id, { games: { tictactoe_games: 1 } });
              }
              if (gameState.players.O.id !== "ai") {
                await updateUserStats(gameState.players.O.id, { games: { tictactoe_games: 1 } });
              }
              const resultEmbed = new EmbedBuilder().setTitle("\u2B55 Tic-Tac-Toe - Game Over!").setColor(aiWinner === "tie" ? 16753920 : 65280).setDescription(aiWinner === "tie" ? "\u{1F91D} **It's a tie!**" : `\u{1F389} **${gameState.players[aiWinner].name} wins!**`).addFields({
                name: "Final Board",
                value: formatBoard(gameState.board),
                inline: false
              });
              tttGames.delete(gameId);
              await safeInteractionUpdate(interaction, { embeds: [resultEmbed], components: [] });
              return;
            }
            gameState.currentPlayer = "X";
          }
        }
        await sendTicTacToeBoard(interaction, gameState);
        return;
      }
      if (action === "poll") {
        const [, optionIndexStr] = interaction.customId.split("_");
        const optionIndex = Number.parseInt(optionIndexStr || "0");
        const messageId = interaction.message.id;
        const pollData = pollGames.get(messageId);
        if (!pollData) {
          return safeInteractionReply(interaction, {
            content: "\u274C **Poll not found!** This poll may have expired or been completed.",
            flags: MessageFlags.Ephemeral
          });
        }
        if (Date.now() > pollData.endTime) {
          return safeInteractionReply(interaction, {
            content: "\u274C **Poll has expired!** You can no longer vote on this poll.",
            flags: MessageFlags.Ephemeral
          });
        }
        if (isNaN(optionIndex) || optionIndex < 0 || optionIndex >= pollData.options.length) {
          return safeInteractionReply(interaction, {
            content: "\u274C **Invalid poll option!**",
            flags: MessageFlags.Ephemeral
          });
        }
        const userId2 = interaction.user.id;
        const previousVote = pollData.votes.get(userId2);
        if (pollData.pollType === "single") {
          if (previousVote !== void 0) {
            pollData.totalVotes--;
          }
          pollData.votes.set(userId2, optionIndex);
          pollData.totalVotes++;
        }
        const emojis = ["1\uFE0F\u20E3", "2\uFE0F\u20E3", "3\uFE0F\u20E3", "4\uFE0F\u20E3"];
        const updatedEmbed = new EmbedBuilder().setTitle(`\u{1F4CA} ${pollData.question}`).setColor(39423).setDescription(
          pollData.options.map((option, index) => {
            const voteCount = [...pollData.votes.values()].filter(
              /** @type {number} */
              (v) => v === index
            ).length;
            const percentage = pollData.totalVotes > 0 ? Math.round(voteCount / pollData.totalVotes * 100) : 0;
            return emojis[index] + " " + option + "\n" + "\u2588".repeat(Math.max(1, percentage / 5)) + (voteCount > 0 ? " **" + voteCount + "** (" + percentage + "%)" : "");
          }).join("\n\n")
        ).setFooter({ text: `Total votes: ${pollData.totalVotes} \u2022 Poll ends` }).setTimestamp(pollData.endTime);
        const buttons = pollData.options.map(
          (option, index) => new ButtonBuilder().setCustomId(`poll_${index}`).setLabel(`${emojis[index]} ${option.length > 15 ? option.slice(0, 15) + "..." : option}`).setStyle(ButtonStyle.Primary)
        );
        const rows = [];
        for (let i = 0; i < buttons.length; i += 2) {
          const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 2));
          rows.push(row);
        }
        await safeInteractionUpdate(interaction, { embeds: [updatedEmbed], components: rows });
        return;
      }
      if (action === "trivia") {
        const [, indexStr] = interaction.customId.split("_");
        const selectedAnswer = Number.parseInt(indexStr || "0");
        let gameState = null;
        let gameId = null;
        for (const [id, state] of triviaGames.entries()) {
          if (state.userId === interaction.user.id && state.gameActive) {
            gameState = state;
            gameId = id;
            break;
          }
        }
        if (!gameState) {
          return safeInteractionReply(interaction, {
            content: "\u274C **No active trivia game found!** Please start a new game with `/trivia`.",
            flags: MessageFlags.Ephemeral
          });
        }
        if (isNaN(selectedAnswer) || selectedAnswer < 0 || selectedAnswer >= 4) {
          return safeInteractionReply(interaction, {
            content: "\u274C **Invalid answer selection!**",
            flags: MessageFlags.Ephemeral
          });
        }
        const currentQuestion = gameState.questions[gameState.currentQuestion];
        if (!currentQuestion) {
          return safeInteractionReply(interaction, {
            content: "\u274C **Game error!** No current question available.",
            flags: MessageFlags.Ephemeral
          });
        }
        const isCorrect = selectedAnswer === currentQuestion.correct;
        if (isCorrect) {
          gameState.score++;
        }
        gameState.answers.push({
          question: currentQuestion.question,
          selectedAnswer,
          correctAnswer: currentQuestion.correct,
          isCorrect,
          userChoice: currentQuestion.options[selectedAnswer],
          correctChoice: currentQuestion.options[currentQuestion.correct]
        });
        gameState.currentQuestion++;
        const feedbackEmbed = new EmbedBuilder().setTitle(isCorrect ? "\u2705 Correct!" : "\u274C Incorrect!").setDescription(`**${currentQuestion.question}**

Your answer: **${currentQuestion.options[selectedAnswer]}**
Correct answer: **${currentQuestion.options[currentQuestion.correct]}**`).setColor(isCorrect ? 65280 : 16711680).setFooter({ text: `Score: ${gameState.score}/${gameState.currentQuestion}` });
        await safeInteractionReply(interaction, { embeds: [feedbackEmbed], flags: MessageFlags.Ephemeral });
        if (gameState.currentQuestion >= gameState.questions.length) {
          const totalTime = Math.round((Date.now() - gameState.startTime) / 1e3);
          const percentage = Math.round(gameState.score / gameState.questions.length * 100);
          let resultMessage = "";
          if (percentage >= 90) resultMessage = "\u{1F3C6} Outstanding! You're a trivia master!";
          else if (percentage >= 70) resultMessage = "\u{1F947} Great job! You know your stuff!";
          else if (percentage >= 50) resultMessage = "\u{1F948} Not bad! Keep practicing!";
          else resultMessage = "\u{1F4DA} Keep learning and try again!";
          try {
            const correctAnswers = gameState.answers.filter((a) => a.isCorrect).length;
            updateUserStats(interaction.user.id, {
              trivia_correct: correctAnswers,
              features_tried: 1
            });
          } catch (error) {
            console.warn("Failed to update trivia achievements:", error instanceof Error ? error.message : String(error));
          }
          const resultEmbed = new EmbedBuilder().setTitle("\u{1F3AF} Trivia Quiz Complete!").setDescription(`${resultMessage}

**Final Score: ${gameState.score}/${gameState.questions.length} (${percentage}%)**
\u23F1\uFE0F Time: ${totalTime}s`).setColor(percentage >= 70 ? 65280 : percentage >= 50 ? 16753920 : 16711680).setTimestamp();
          for (const [
            /** @type {number} */
            index,
            /** @type {{question: string, selectedAnswer: number, correctAnswer: number, isCorrect: boolean, userChoice: string, correctChoice: string}} */
            answer
          ] of gameState.answers.entries()) {
            const emoji = answer.isCorrect ? "\u2705" : "\u274C";
            const status = answer.isCorrect ? "Correct" : "Incorrect";
            resultEmbed.addFields({
              name: `Q${index + 1}: ${status}`,
              value: `${emoji} **${answer.question}**
${answer.isCorrect ? "Your answer: " + answer.userChoice : "Your answer: " + answer.userChoice + "\nCorrect: " + answer.correctChoice}`,
              inline: false
            });
          }
          triviaGames.delete(gameId);
          setTimeout(async () => {
            await safeInteractionReply(interaction, { embeds: [resultEmbed], flags: MessageFlags.Ephemeral });
          }, 2e3);
        } else {
          setTimeout(async () => {
            const nextQuestion = gameState.questions[gameState.currentQuestion];
            if (!nextQuestion) {
              return safeInteractionReply(interaction, {
                content: "\u274C **Game error!** No next question available.",
                flags: MessageFlags.Ephemeral
              });
            }
            const embed = new EmbedBuilder().setTitle(`\u{1F9E0} Trivia Quiz - Question ${gameState.currentQuestion + 1}/${gameState.questions.length}`).setDescription(`**${nextQuestion.question}**`).setColor(39423).addFields({
              name: "Category",
              value: nextQuestion.category,
              inline: true
            }).setFooter({ text: `Score: ${gameState.score}/${gameState.currentQuestion}` }).setTimestamp();
            const buttons = nextQuestion.options.map(
              (option, index) => new ButtonBuilder().setCustomId(`trivia_${index}`).setLabel(`${String.fromCharCode(65 + index)}) ${option}`).setStyle(ButtonStyle.Primary)
            );
            const rows = [];
            for (let i = 0; i < buttons.length; i += 2) {
              const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 2));
              rows.push(row);
            }
            await safeInteractionReply(interaction, { embeds: [embed], components: rows, flags: MessageFlags.Ephemeral });
          }, 2e3);
        }
        return;
      }
      logger.warn(`Unrecognized button action: ${action}`, {
        userId: interaction.user.id,
        username: interaction.user.username,
        customId: interaction.customId,
        guild: interaction.guild?.name || "DM",
        guildId: interaction.guild?.id || "N/A"
      });
      logCommandExecution(interaction, false, new Error(`Unrecognized button action: ${action}`));
      await safeInteractionReply(interaction, {
        content: `\u274C **Unknown button action: ${action}**

This button is not implemented yet. Please contact the bot administrator if this is unexpected.`,
        flags: MessageFlags.Ephemeral
      });
    }
  } catch (error) {
    logger.error(`Error handling button action ${action}`, error instanceof Error ? error : new Error(String(error)), {
      userId: interaction.user.id,
      action,
      customId: interaction.customId
    });
    logCommandExecution(interaction, false, error instanceof Error ? error : new Error(String(error)));
    await safeInteractionReply(interaction, {
      content: "\u274C **An error occurred while processing the button.**\n\nPlease try again later.",
      flags: MessageFlags.Ephemeral
    });
  }
}
export {
  circuitBreakerMap,
  handleButtonInteraction,
  handleInteraction,
  safeInteractionReply,
  safeInteractionUpdate,
  sendWordleGuessModal,
  spendCooldowns,
  updateInventoryEmbed,
  wordleWords
};
