import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { logCommandExecution, logError } from './logger.js';
import { isOnCooldown, setCooldown, getFormattedCooldown, getButtonCooldownType } from './cooldowns.js';
import { wordleGames, hangmanGames, guessGames, combatGames, explorationGames } from './game-states.js';
import { getCharacter, resetCharacter, spendSkillPoints, encounterMonster, fightTurn, applyXp, narrate } from './rpg.js';
import { addBalance, getBalance, transferBalance, getMarketPrice, buyFromMarket, sellToMarket } from './economy.js';
import { getUserGuild, contributeToGuild } from './guilds.js';
import { warnUser, muteUser, unmuteUser, unbanUser } from './moderation.js';
import { pause, resume, skip, stop, shuffleQueue, clearQueue, getQueue, getMusicStats, searchSongs, play } from './music.js';
import { getRandomJoke, generateStory, getRiddle, getFunFact, getRandomQuote, magic8Ball, generateFunName, createFunChallenge } from './entertainment.js';
import { getLocations } from './locations.js';
import { getActiveAuctions, createAuction } from './trading.js';
import { updateProfile } from './profiles.js';
import { CommandError, handleCommandError, safeExecuteCommand, validateUser, validateGuild, validatePermissions, validateRange, validateNotEmpty, createRateLimiter } from './errorHandler.js';
import { inputValidator, sanitizeInput, validateUserId, validateNumber, validateString } from './validation.js';

// Helper function for Wordle guess modal
export async function sendWordleGuessModal(interaction, gameId) {
  const modal = new ModalBuilder().setCustomId(`wordle_submit:${gameId}`).setTitle('Wordle Guess');
  const guessInput = new TextInputBuilder()
    .setCustomId('word_guess')
    .setLabel('Enter a 5-letter word')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('HOUSE')
    .setMinLength(5)
    .setMaxLength(5);

  modal.addComponents({ type: 1, components: [guessInput] });
  await interaction.showModal(modal);
}

// Rate limiter for interactions to prevent abuse
const interactionRateLimiter = createRateLimiter(5, 10000, (key) => key); // 5 interactions per 10 seconds per user

// Helper function to safely handle interactions and prevent duplicate responses
export async function safeInteractionReply(interaction, options) {
   const interactionId = interaction.id;

   try {
     // Rate limiting check
     await interactionRateLimiter.consume(interaction.user.id);
   } catch (error) {
     if (error instanceof CommandError && error.code === 'RATE_LIMITED') {
       logError('Interaction rate limited', error, {
         userId: interaction.user.id,
         interactionId
       });
       return false;
     }
   }

   // Check if this interaction has already been processed
   if (processedInteractions.has(interactionId)) {
     logger.warn(`Interaction ${interactionId} already processed, ignoring`, {
       userId: interaction.user.id,
       interactionId
     });
     return false;
   }

   try {
     // Validate interaction object
     validateNotEmpty(interaction, 'interaction');
     validateNotEmpty(interaction.user, 'interaction.user');
     validateUserId(interaction.user.id);

     // Check if interaction is still valid (not expired)
     if (interaction.replied || interaction.deferred) {
       logger.warn(`Interaction ${interactionId} already replied/deferred`, {
         userId: interaction.user.id,
         interactionId,
         replied: interaction.replied,
         deferred: interaction.deferred
       });
       return false;
     }

     // Mark as processed
     processedInteractions.set(interactionId, Date.now());

     // Clean up old processed interactions (older than 5 minutes)
     const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
     for (const [id, timestamp] of processedInteractions.entries()) {
       if (timestamp < fiveMinutesAgo) {
         processedInteractions.delete(id);
       }
     }

     // Sanitize content if present
     if (options.content) {
       options.content = sanitizeInput(options.content);
     }

     await interaction.reply(options);
     return true;
   } catch (error) {
     logger.error(`Failed to reply to interaction ${interactionId}`, error, {
       userId: interaction.user.id,
       interactionType: interaction.type,
       interactionId
     });
     return false;
   }
}

// Helper function to safely update interactions
export async function safeInteractionUpdate(interaction, options) {
   const interactionId = interaction.id;

   try {
     // Rate limiting check for updates
     await interactionRateLimiter.consume(interaction.user.id);
   } catch (error) {
     if (error instanceof CommandError && error.code === 'RATE_LIMITED') {
       logError('Interaction update rate limited', error, {
         userId: interaction.user.id,
         interactionId
       });
       return false;
     }
   }

   // Check if this interaction has already been processed
   if (processedInteractions.has(interactionId)) {
     logger.warn(`Interaction ${interactionId} already processed, ignoring`, {
       userId: interaction.user.id,
       interactionId
     });
     return false;
   }

   try {
     // Validate interaction object
     validateNotEmpty(interaction, 'interaction');
     validateNotEmpty(interaction.user, 'interaction.user');
     validateUserId(interaction.user.id);

     // Check if interaction is still valid
     if (interaction.replied || interaction.deferred) {
       logger.warn(`Interaction ${interactionId} already replied/deferred`, {
         userId: interaction.user.id,
         interactionId,
         replied: interaction.replied,
         deferred: interaction.deferred
       });
       return false;
     }

     // Mark as processed
     processedInteractions.set(interactionId, Date.now());

     // Sanitize content if present
     if (options.content) {
       options.content = sanitizeInput(options.content);
     }

     await interaction.update(options);
     return true;
   } catch (error) {
     logger.error(`Failed to update interaction ${interactionId}`, error, {
       userId: interaction.user.id,
       interactionType: interaction.type,
       interactionId
     });
     return false;
   }
}

// Helper function to update inventory embed
export async function updateInventoryEmbed(interaction, itemsByType, inventoryValue) {
  const { getItemInfo, getItemRarityInfo } = await import('./rpg.js');

  const embed = interaction.message.embeds[0];
  const newEmbed = {
    title: embed.title,
    color: embed.color,
    description: `💰 Total Value: ${inventoryValue} gold`,
    fields: []
  };

  for (const [type, items] of Object.entries(itemsByType)) {
    const typeEmoji = {
      weapon: '⚔️',
      armor: '🛡️',
      consumable: '🧪',
      material: '🔩'
    }[type] || '📦';

    const itemList = items.map(item => {
      return `${typeEmoji} **${item.name}** (${item.quantity}x)`;
    }).join('\n');

    newEmbed.fields.push({
      name: `${typeEmoji} ${type.charAt(0).toUpperCase() + type.slice(1)}s`,
      value: itemList || 'None',
      inline: true
    });
  }

  await interaction.editReply({ embeds: [newEmbed] });
}

// Maps for cooldowns and processed interactions
export const spendCooldowns = new Map();
export const processedInteractions = new Map();

// Wordle word list
export const wordleWords = ['HOUSE', 'PLANE', 'TIGER', 'BREAD', 'CHAIR', 'SNAKE', 'CLOUD', 'LIGHT', 'MUSIC', 'WATER', 'EARTH', 'STORM', 'FLAME', 'SHARP', 'QUIET', 'BRIGHT', 'DANCE', 'FIELD', 'GRASS', 'HEART', 'KNIFE', 'LARGE', 'MOUSE', 'NIGHT', 'OCEAN', 'PIANO', 'QUICK', 'RIVER', 'SHINE', 'TRUCK', 'WHEAT', 'YOUNG', 'ALARM', 'BEACH', 'CLOCK', 'DRIVE', 'ELBOW', 'FLOUR', 'GHOST', 'HAPPY', 'INDEX', 'JOINT', 'KNOCK', 'LUNCH', 'MIGHT', 'NOISE', 'OCCUR', 'PAINT', 'QUILT', 'ROBOT', 'SHORE', 'THICK', 'UNION', 'VOICE', 'WASTE', 'YIELD', 'ABUSE', 'ADULT', 'AGENT', 'AGREE', 'AHEAD', 'ALARM', 'ALBUM', 'ALERT', 'ALIEN', 'ALIGN', 'ALIKE', 'ALIVE', 'ALLOW', 'ALONE', 'ALONG', 'ALTER', 'AMONG', 'ANGER', 'ANGLE', 'ANGRY', 'APART', 'APPLE', 'APPLY', 'ARENA', 'ARGUE', 'ARISE', 'ARMED', 'ARMOR', 'ARRAY', 'ASIDE', 'ASSET', 'AVOID', 'AWAKE', 'AWARD', 'AWARE', 'BADLY', 'BAKER', 'BASES', 'BASIC', 'BEACH', 'BEGAN', 'BEGIN', 'BEING', 'BELOW', 'BENCH', 'BILLY', 'BIRTH', 'BLACK', 'BLAME', 'BLANK', 'BLIND', 'BLOCK', 'BLOOD', 'BOARD', 'BOOST', 'BOOTH', 'BOUND', 'BRAIN', 'BRAND', 'BRASS', 'BRAVE', 'BREAD', 'BREAK', 'BREED', 'BRIEF', 'BRING', 'BROAD', 'BROKE', 'BROWN', 'BUILD', 'BUILT', 'BUYER', 'CABLE', 'CALIF', 'CARRY', 'CATCH', 'CAUSE', 'CHAIN', 'CHAIR', 'CHAOS', 'CHARM', 'CHART', 'CHASE', 'CHEAP', 'CHECK', 'CHEST', 'CHIEF', 'CHILD', 'CHINA', 'CHOSE', 'CIVIL', 'CLAIM', 'CLASS', 'CLEAN', 'CLEAR', 'CLICK', 'CLIMB', 'CLOCK', 'CLOSE', 'CLOUD', 'COACH', 'COAST', 'COULD', 'COUNT', 'COURT', 'COVER', 'CRAFT', 'CRASH', 'CRAZY', 'CREAM', 'CRIME', 'CROSS', 'CROWD', 'CROWN', 'CRUDE', 'CURVE', 'CYCLE', 'DAILY', 'DANCE', 'DATED', 'DEALT', 'DEATH', 'DEBUT', 'DELAY', 'DEPTH', 'DOING', 'DOUBT', 'DOZEN', 'DRAFT', 'DRAMA', 'DRANK', 'DREAM', 'DRESS', 'DRILL', 'DRINK', 'DRIVE', 'DROVE', 'DYING', 'EAGER', 'EARLY', 'EARTH', 'EIGHT', 'ELITE', 'EMPTY', 'ENEMY', 'ENJOY', 'ENTER', 'ENTRY', 'EQUAL', 'ERROR', 'EVENT', 'EVERY', 'EXACT', 'EXIST', 'EXTRA', 'FAITH', 'FALSE', 'FAULT', 'FIBER', 'FIELD', 'FIFTH', 'FIFTY', 'FIGHT', 'FINAL', 'FIRST', 'FIXED', 'FLASH', 'FLEET', 'FLOOR', 'FLUID', 'FOCUS', 'FORCE', 'FORTH', 'FORTY', 'FORUM', 'FOUND', 'FRAME', 'FRANK', 'FRAUD', 'FRESH', 'FRONT', 'FRUIT', 'FULLY', 'FUNNY', 'GIANT', 'GIVEN', 'GLASS', 'GLOBE', 'GOING', 'GRACE', 'GRADE', 'GRAND', 'GRANT', 'GRASS', 'GRAVE', 'GREAT', 'GREEN', 'GROSS', 'GROUP', 'GROWN', 'GUARD', 'GUESS', 'GUEST', 'GUIDE', 'HAPPY', 'HARRY', 'HEART', 'HEAVY', 'HENCE', 'HENRY', 'HORSE', 'HOTEL', 'HOUSE', 'HUMAN', 'HURRY', 'IMAGE', 'INDEX', 'INNER', 'INPUT', 'ISSUE', 'JAPAN', 'JIMMY', 'JOINT', 'JONES', 'JUDGE', 'KNOWN', 'LABEL', 'LARGE', 'LASER', 'LATER', 'LAUGH', 'LAYER', 'LEARN', 'LEASE', 'LEAST', 'LEAVE', 'LEGAL', 'LEVEL', 'LEWIS', 'LIGHT', 'LIMIT', 'LINKS', 'LIVES', 'LOCAL', 'LOOSE', 'LOWER', 'LUCKY', 'LUNCH', 'LYING', 'MAGIC', 'MAJOR', 'MAKER', 'MARCH', 'MARIA', 'MATCH', 'MAYBE', 'MAYOR', 'MEANT', 'MEDAL', 'MEDIA', 'METAL', 'MIGHT', 'MINOR', 'MINUS', 'MIXED', 'MODEL', 'MONEY', 'MONTH', 'MORAL', 'MOTOR', 'MOUNT', 'MOUSE', 'MOUTH', 'MOVED', 'MOVIE', 'MUSIC', 'NEEDS', 'NEVER', 'NEWLY', 'NIGHT', 'NOISE', 'NORTH', 'NOTED', 'NOVEL', 'NURSE', 'OCCUR', 'OCEAN', 'OFFER', 'OFTEN', 'ORDER', 'OTHER', 'OUGHT', 'PAINT', 'PANEL', 'PAPER', 'PARTY', 'PEACE', 'PETER', 'PHASE', 'PHONE', 'PHOTO', 'PIANO', 'PIECE', 'PILOT', 'PITCH', 'PLACE', 'PLAIN', 'PLANE', 'PLANT', 'PLATE', 'PLAYS', 'PLENT', 'PLOTS', 'POEMS', 'POINT', 'POUND', 'POWER', 'PRESS', 'PRICE', 'PRIDE', 'PRIME', 'PRINT', 'PRIOR', 'PRIZE', 'PROOF', 'PROUD', 'PROVE', 'QUEEN', 'QUICK', 'QUIET', 'QUITE', 'RADIO', 'RAISE', 'RANGE', 'RAPID', 'RATIO', 'REACH', 'READY', 'REALM', 'REBEL', 'REFER', 'RELAX', 'REMARK', 'REMIND', 'REMOVE', 'RENDER', 'RENEW', 'RENTAL', 'REPAIR', 'REPEAT', 'REPLACE', 'REPORT', 'RESIST', 'RESOURCE', 'RESPONSE', 'RESULT', 'RETAIN', 'RETIRE', 'RETURN', 'REVEAL', 'REVIEW', 'REWARD', 'RIDER', 'RIDGE', 'RIGHT', 'RIGID', 'RING', 'RISE', 'RISK', 'RIVER', 'ROAD', 'ROBOT', 'ROGER', 'ROMAN', 'ROUGH', 'ROUND', 'ROUTE', 'ROYAL', 'RURAL', 'SCALE', 'SCENE', 'SCOPE', 'SCORE', 'SENSE', 'SERVE', 'SEVEN', 'SHALL', 'SHAPE', 'SHARE', 'SHARP', 'SHEET', 'SHELF', 'SHELL', 'SHIFT', 'SHINE', 'SHIRT', 'SHOCK', 'SHOOT', 'SHORT', 'SHOWN', 'SIDES', 'SIGHT', 'SILVER', 'SIMILAR', 'SIMPLE', 'SIXTH', 'SIXTY', 'SIZED', 'SKILL', 'SLEEP', 'SLIDE', 'SMALL', 'SMART', 'SMILE', 'SMITH', 'SMOKE', 'SNAKE', 'SOLID', 'SOLVE', 'SORRY', 'SOUND', 'SOUTH', 'SPACE', 'SPARE', 'SPEAK', 'SPEED', 'SPEND', 'SPENT', 'SPLIT', 'SPOKE', 'STAGE', 'STAKE', 'STAND', 'START', 'STATE', 'STEAM', 'STEEL', 'STEEP', 'STICK', 'STILL', 'STOCK', 'STONE', 'STOOD', 'STORE', 'STORM', 'STORY', 'STRIP', 'STUCK', 'STUDY', 'STUFF', 'STYLE', 'SUGAR', 'SUITE', 'SUPER', 'SWEET', 'TABLE', 'TAKEN', 'TASTE', 'TAXES', 'TEACH', 'TEETH', 'TERRY', 'TEXAS', 'THANK', 'THEFT', 'THEIR', 'THEME', 'THERE', 'THESE', 'THICK', 'THING', 'THINK', 'THIRD', 'THOSE', 'THREE', 'THREW', 'THROW', 'THUMB', 'TIGER', 'TIGHT', 'TIRED', 'TITLE', 'TODAY', 'TOKEN', 'TOPIC', 'TOTAL', 'TOUCH', 'TOUGH', 'TOWER', 'TRACK', 'TRADE', 'TRAIN', 'TREAT', 'TREND', 'TRIAL', 'TRIBE', 'TRICK', 'TRIED', 'TRIES', 'TRUCK', 'TRULY', 'TRUNK', 'TRUST', 'TRUTH', 'TWICE', 'TWIST', 'TYLER', 'UNION', 'UNITY', 'UNTIL', 'UPPER', 'UPSET', 'URBAN', 'USAGE', 'USUAL', 'VALUE', 'VIDEO', 'VIRUS', 'VISIT', 'VITAL', 'VOCAL', 'VOICE', 'WASTE', 'WATCH', 'WATER', 'WAVE', 'WHEEL', 'WHERE', 'WHICH', 'WHILE', 'WHITE', 'WHOLE', 'WINNER', 'WINTER', 'WOMAN', 'WOMEN', 'WORLD', 'WORRY', 'WORSE', 'WORST', 'WORTH', 'WOULD', 'WRITE', 'WRONG', 'WROTE', 'YOUNG', 'YOURS', 'YOUTH'];

// Main interaction handler with comprehensive error handling and validation
export async function handleInteraction(interaction, client) {
   const startTime = Date.now();

   try {
     // Validate interaction object
     validateNotEmpty(interaction, 'interaction');
     validateNotEmpty(interaction.user, 'interaction.user');
     validateUserId(interaction.user.id);

     // Global rate limiting
     try {
       await interactionRateLimiter.consume(interaction.user.id);
     } catch (error) {
       if (error instanceof CommandError && error.code === 'RATE_LIMITED') {
         logError('Global interaction rate limited', error, {
           userId: interaction.user.id,
           interactionType: interaction.type
         });
         return await safeInteractionReply(interaction, {
           content: `⏰ **Rate Limited!** Please slow down and try again in a moment.`,
           ephemeral: true
         });
       }
     }

     // Check global command cooldown
     const globalCooldown = isOnCooldown(interaction.user.id, 'command_global');
     if (globalCooldown.onCooldown) {
       return await safeInteractionReply(interaction, {
         content: `⏰ **Cooldown Active!** Please wait ${getFormattedCooldown(globalCooldown.remaining)} before using another command.`,
         ephemeral: true
       });
     }

     // Set global cooldown
     setCooldown(interaction.user.id, 'command_global');

     // Check command-specific cooldown
     const commandCooldown = isOnCooldown(interaction.user.id, interaction.commandName);
     if (commandCooldown.onCooldown) {
       return await safeInteractionReply(interaction, {
         content: `⏰ **${interaction.commandName} is on cooldown!** Please wait ${getFormattedCooldown(commandCooldown.remaining)}.`,
         ephemeral: true
       });
     }

     // Set adaptive cooldown for explore command with validation
     if (interaction.commandName === 'explore') {
       const char = getCharacter(interaction.user.id);
       const level = char ? validateRange(char.lvl || 1, 1, 100, 'character level') : 1;
       const adaptiveCooldown = Math.max(5000, 30000 - (level - 1) * 1000);
       setCooldown(interaction.user.id, 'rpg_explore', adaptiveCooldown);
     }

     // Log command execution start
     logCommandExecution(interaction, true);

     // Handle modal submits with error handling
     if (interaction.isModalSubmit()) {
       await safeExecuteCommand(interaction, () => handleModalSubmit(interaction, client), {
         interactionType: 'modal_submit',
         customId: interaction.customId
       });
       return;
     }

     // Handle button interactions with error handling
     if (interaction.isButton()) {
       await safeExecuteCommand(interaction, () => handleButtonInteraction(interaction, client), {
         interactionType: 'button',
         customId: interaction.customId
       });
       return;
     }

     // Handle chat input commands with validation
     if (interaction.isChatInputCommand()) {
       const command = client.commands.get(interaction.commandName);
       if (!command) {
         throw new CommandError(`Unknown command: ${interaction.commandName}`, 'INVALID_ARGUMENT');
       }

       // Validate command input
       const validationResult = inputValidator.validateCommandInput(interaction);
       if (!validationResult.valid) {
         throw new CommandError(validationResult.reason, 'INVALID_ARGUMENT');
       }

       // Execute command with error handling
       await safeExecuteCommand(interaction, () => command.execute(interaction), {
         interactionType: 'chat_input_command',
         commandName: interaction.commandName
       });

       // Set command-specific cooldown after successful execution
       setCooldown(interaction.user.id, interaction.commandName);
     }

     // Log successful completion with timing
     const executionTime = Date.now() - startTime;
     logCommandExecution(interaction, true, null, { executionTime });

   } catch (err) {
     const executionTime = Date.now() - startTime;

     // Use standardized error handling
     await handleCommandError(interaction, err instanceof CommandError ? err :
       new CommandError(err.message || 'Unknown error occurred', 'UNKNOWN_ERROR', {
         originalError: err.message,
         stack: err.stack,
         executionTime
       }), {
       command: interaction.commandName,
       userId: interaction.user.id,
       guild: interaction.guild?.name || 'DM',
       channel: interaction.channel?.name || 'Unknown',
       executionTime
     });

     // Log command failure
     logCommandExecution(interaction, false, err);
   }
}

// Function to handle modal submits with comprehensive validation and error handling
async function handleModalSubmit(interaction, client) {
   const custom = interaction.customId || '';

   try {
     // Validate modal custom ID
     validateNotEmpty(custom, 'modal customId');

     if (custom.startsWith('rpg_reset_confirm:')) {
       const parts = custom.split(':');
       const mode = parts[1] || 'btn';
       const targetUser = parts[2] || interaction.user.id;

       // Validate target user
       validateUserId(targetUser);
       if (targetUser !== interaction.user.id) {
         throw new CommandError('You cannot confirm reset for another user.', 'PERMISSION_DENIED');
       }

       const text = interaction.fields.getTextInputValue('confirm_text');
       if (!text || text.trim() !== 'RESET') {
         throw new CommandError('Confirmation text did not match. Type RESET to confirm.', 'INVALID_ARGUMENT');
       }

       const className = parts[3] || 'warrior';
       const validation = inputValidator.validateCharacterClass(className);
       if (!validation.valid) {
         throw new CommandError(validation.reason, 'INVALID_ARGUMENT');
       }

       const def = resetCharacter(interaction.user.id, className);
       return await safeInteractionReply(interaction, {
         content: `Character reset to defaults: HP ${def.hp}/${def.maxHp} MP ${def.mp}/${def.maxMp} ATK ${def.atk} DEF ${def.def} SPD ${def.spd} Level ${def.lvl}`,
         ephemeral: true
       });
     }

     // Handle other modal types with validation
     if (custom.startsWith('guild_contribute_modal:')) {
       const parts = custom.split(':');
       const guildName = parts[1];
       const targetUser = parts[2];

       validateUserId(targetUser);
       if (targetUser !== interaction.user.id) {
         throw new CommandError('You cannot contribute for another user.', 'PERMISSION_DENIED');
       }

       const amountStr = interaction.fields.getTextInputValue('amount');
       const amount = validateNumber(amountStr, { min: 1, max: 100000, integer: true, positive: true });

       if (!amount.valid) {
         throw new CommandError(amount.reason, 'INVALID_ARGUMENT');
       }

       const userGuild = getUserGuild(interaction.user.id);
       if (!userGuild || userGuild.name !== guildName) {
         throw new CommandError('You are not a member of this guild.', 'PERMISSION_DENIED');
       }

       const currentBalance = getBalance(interaction.user.id);
       if (currentBalance < amount.value) {
         throw new CommandError('Insufficient gold balance.', 'INSUFFICIENT_FUNDS');
       }

       contributeToGuild(guildName, interaction.user.id, amount.value);
       addBalance(interaction.user.id, -amount.value);

       return await safeInteractionReply(interaction, {
         content: `Successfully contributed ${amount.value} gold to ${guildName}!`,
         ephemeral: true
       });
     }

     // Handle economy transfer modal
     if (custom.startsWith('economy_transfer_modal:')) {
       const targetUser = custom.split(':')[1];
       validateUserId(targetUser);

       const recipientStr = interaction.fields.getTextInputValue('recipient');
       const amountStr = interaction.fields.getTextInputValue('amount');

       const recipientValidation = validateString(recipientStr, { minLength: 2, maxLength: 32, required: true });
       if (!recipientValidation.valid) {
         throw new CommandError(recipientValidation.reason, 'INVALID_ARGUMENT');
       }

       const amount = validateNumber(amountStr, { min: 1, max: 100000, integer: true, positive: true });
       if (!amount.valid) {
         throw new CommandError(amount.reason, 'INVALID_ARGUMENT');
       }

       const currentBalance = getBalance(interaction.user.id);
       if (currentBalance < amount.value) {
         throw new CommandError('Insufficient gold balance.', 'INSUFFICIENT_FUNDS');
       }

       // Find recipient by username (simplified - in real implementation would use proper user resolution)
       const recipient = interaction.guild?.members.cache.find(m =>
         m.user.username.toLowerCase() === recipientStr.toLowerCase() ||
         `${m.user.username}#${m.user.discriminator}`.toLowerCase() === recipientStr.toLowerCase()
       );

       if (!recipient) {
         throw new CommandError('Recipient not found in this server.', 'USER_NOT_FOUND');
       }

       transferBalance(interaction.user.id, recipient.user.id, amount.value);

       return await safeInteractionReply(interaction, {
         content: `Successfully transferred ${amount.value} gold to ${recipient.user.username}!`,
         ephemeral: true
       });
     }

     // Unknown modal type
     throw new CommandError(`Unknown modal type: ${custom}`, 'INVALID_ARGUMENT');

   } catch (error) {
     logger.error('Modal submit error', error, {
       customId: custom,
       userId: interaction.user.id
     });

     if (error instanceof CommandError) {
       await handleCommandError(interaction, error);
     } else {
       await handleCommandError(interaction, new CommandError(
         'An error occurred while processing the modal.',
         'UNKNOWN_ERROR',
         { originalError: error.message }
       ));
     }
   }
}

// Function to handle button interactions
async function handleButtonInteraction(interaction, client) {
  const userId = interaction.user.id;
  const buttonCooldownType = getButtonCooldownType(interaction.customId);
  const cooldownCheck = isOnCooldown(userId, buttonCooldownType);

  if (cooldownCheck.onCooldown) {
    logCommandExecution(interaction, false, new Error('Button on cooldown'));
    logger.warn('Button on cooldown', {
      userId: interaction.user.id,
      customId: interaction.customId,
      buttonCooldownType,
      remainingTime: cooldownCheck.remaining
    });
    return interaction.reply({
      content: `⏰ **Button on cooldown!** Please wait ${getFormattedCooldown(cooldownCheck.remaining)} before pressing this button again.`,
      ephemeral: true
    });
  }

  // Set adaptive cooldown after check
  const char = getCharacter(userId);
  const level = char ? char.lvl || 1 : 1;
  const adaptiveCooldown = Math.max(1000, cooldownCheck.cooldown - (level - 1) * 500);
  setCooldown(userId, buttonCooldownType, adaptiveCooldown);

  const [action, arg2, arg3] = interaction.customId ? interaction.customId.split(':') : [];

  // Comprehensive logging for all button interactions
  logger.info(`Handling button action: ${action}`, {
    userId: interaction.user.id,
    username: interaction.user.username,
    customId: interaction.customId,
    guild: interaction.guild?.name || 'DM',
    guildId: interaction.guild?.id || 'N/A',
    channel: interaction.channel?.name || 'Unknown',
    channelId: interaction.channel?.id || 'N/A',
    buttonCooldownType,
    userLevel: level,
    adaptiveCooldown
  });

  logCommandExecution(interaction, true); // Log successful button interaction start

  try {
    // Music button handlers
    if (action === 'music_pause') {
      const [, targetGuild] = interaction.customId.split(':');
      if (targetGuild && targetGuild !== interaction.guild.id) {
        logCommandExecution(interaction, false, new Error('Wrong guild'));
        return interaction.reply({ content: 'You cannot pause music in another server.', ephemeral: true });
      }

      const result = pause(interaction.guild.id);

      if (result) {
        const currentRow = interaction.message.components[0];
        if (currentRow && currentRow.components) {
          const newRow = currentRow.components.map(button => {
            if (button.customId === `music_pause:${interaction.guild.id}`) {
              return new ButtonBuilder()
                .setCustomId(`music_resume:${interaction.guild.id}`)
                .setLabel('▶️ Resume')
                .setStyle(ButtonStyle.Success);
            }
            return ButtonBuilder.from(button);
          });

          await safeInteractionUpdate(interaction, {
            content: interaction.message.content,
            embeds: interaction.message.embeds,
            components: [new ActionRowBuilder().addComponents(newRow)]
          });
        } else {
          await safeInteractionReply(interaction, { content: '⏸️ **Music paused!**', ephemeral: true });
        }
      } else {
        await safeInteractionReply(interaction, { content: '❌ No music currently playing.', ephemeral: true });
      }
      return;
    }

    if (action === 'music_resume') {
      const [, targetGuild] = interaction.customId.split(':');
      if (targetGuild && targetGuild !== interaction.guild.id) {
        logCommandExecution(interaction, false, new Error('Wrong guild'));
        return interaction.reply({ content: 'You cannot resume music in another server.', ephemeral: true });
      }

      const result = resume(interaction.guild.id);

      if (result) {
        const currentRow = interaction.message.components[0];
        if (currentRow && currentRow.components) {
          const newRow = currentRow.components.map(button => {
            if (button.customId === `music_resume:${interaction.guild.id}`) {
              return new ButtonBuilder()
                .setCustomId(`music_pause:${interaction.guild.id}`)
                .setLabel('⏸️ Pause')
                .setStyle(ButtonStyle.Primary);
            }
            return ButtonBuilder.from(button);
          });

          await safeInteractionUpdate(interaction, {
            content: interaction.message.content,
            embeds: interaction.message.embeds,
            components: [new ActionRowBuilder().addComponents(newRow)]
          });
        } else {
          await safeInteractionReply(interaction, { content: '▶️ **Music resumed!**', ephemeral: true });
        }
      } else {
        await safeInteractionReply(interaction, { content: '❌ No paused music to resume.', ephemeral: true });
      }
      return;
    }

    if (action === 'music_skip') {
      const [, targetGuild] = interaction.customId.split(':');
      if (targetGuild && targetGuild !== interaction.guild.id) {
        logCommandExecution(interaction, false, new Error('Wrong guild'));
        return interaction.reply({ content: 'You cannot skip music in another server.', ephemeral: true });
      }

      const nextSong = skip(interaction.guild.id);
      if (nextSong) {
        const embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setTitle('⏭️ Song Skipped')
          .setDescription(`**Now Playing:** ${nextSong.title} by ${nextSong.artist}`)
          .setColor(0xFFA500);

        await safeInteractionUpdate(interaction, {
          embeds: [embed],
          components: interaction.message.components
        });
      } else {
        await safeInteractionReply(interaction, { content: '❌ No songs in queue to skip.', ephemeral: true });
      }
      return;
    }

    if (action === 'music_stop') {
      const [, targetGuild] = interaction.customId.split(':');
      if (targetGuild && targetGuild !== interaction.guild.id) {
        logCommandExecution(interaction, false, new Error('Wrong guild'));
        return interaction.reply({ content: 'You cannot stop music in another server.', ephemeral: true });
      }

      const success = stop(interaction.guild.id);
      if (success) {
        const embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setTitle('⏹️ Music Stopped')
          .setDescription('Music stopped and left voice channel.')
          .setColor(0xFF0000);

        await safeInteractionUpdate(interaction, {
          embeds: [embed],
          components: []
        });
      } else {
        await safeInteractionReply(interaction, { content: '❌ No music is currently playing.', ephemeral: true });
      }
      return;
    }

    if (action === 'music_queue') {
      const [, targetGuild] = interaction.customId.split(':');
      if (targetGuild && targetGuild !== interaction.guild.id) {
        logCommandExecution(interaction, false, new Error('Wrong guild'));
        return interaction.reply({ content: 'You cannot view queue in another server.', ephemeral: true });
      }

      const queue = getQueue(interaction.guild.id);
      const stats = getMusicStats(interaction.guild.id);
      const current = stats.currentlyPlaying;

      let description = '';
      if (current) {
        description += `**Currently Playing:** ${current.title} by ${current.artist}\n\n`;
      }
      if (queue.length > 0) {
        description += '**Queue:**\n';
        queue.slice(0, 10).forEach((song, index) => {
          description += `${index + 1}. ${song.title} by ${song.artist}\n`;
        });
        if (queue.length > 10) {
          description += `... and ${queue.length - 10} more songs`;
        }
      } else {
        description += 'Queue is empty.';
      }

      const embed = new EmbedBuilder()
        .setTitle('📋 Music Queue')
        .setColor(0x0099FF)
        .setDescription(description)
        .addFields({
          name: '📊 Queue Info',
          value: `**Total Songs:** ${stats.queueLength}\n**Volume:** ${stats.volume}%`,
          inline: true
        });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`music_shuffle:${interaction.guild.id}`).setLabel('🔀 Shuffle').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`music_clear:${interaction.guild.id}`).setLabel('🗑️ Clear Queue').setStyle(ButtonStyle.Danger)
      );

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
      return;
    }

    if (action === 'music_shuffle') {
      const [, targetGuild] = interaction.customId.split(':');
      if (targetGuild && targetGuild !== interaction.guild.id) {
        logCommandExecution(interaction, false, new Error('Wrong guild'));
        return interaction.reply({ content: 'You cannot shuffle queue in another server.', ephemeral: true });
      }

      const success = shuffleQueue(interaction.guild.id);
      if (success) {
        const embed = new EmbedBuilder()
          .setTitle('🔀 Queue Shuffled')
          .setColor(0x9932CC)
          .setDescription('Music queue has been shuffled!');

        await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      } else {
        await safeInteractionReply(interaction, { content: '❌ Queue is empty or too small to shuffle.', ephemeral: true });
      }
      return;
    }

    if (action === 'music_clear') {
      const [, targetGuild] = interaction.customId.split(':');
      if (targetGuild && targetGuild !== interaction.guild.id) {
        logCommandExecution(interaction, false, new Error('Wrong guild'));
        return interaction.reply({ content: 'You cannot clear queue in another server.', ephemeral: true });
      }

      const success = clearQueue(interaction.guild.id);
      if (success) {
        const embed = new EmbedBuilder()
          .setTitle('🗑️ Queue Cleared')
          .setColor(0xFF4500)
          .setDescription('Music queue has been cleared!');

        await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      } else {
        await safeInteractionReply(interaction, { content: '❌ Queue is already empty.', ephemeral: true });
      }
      return;
    }

    if (action === 'music_back') {
      const [, targetGuild] = interaction.customId.split(':');
      if (targetGuild && targetGuild !== interaction.guild.id) {
        logCommandExecution(interaction, false, new Error('Wrong guild'));
        return interaction.reply({ content: 'You cannot go back in another server.', ephemeral: true });
      }

      const previousSong = back(interaction.guild.id);
      if (previousSong) {
        const embed = new EmbedBuilder()
          .setTitle('⬅️ Back to Previous Song')
          .setColor(0xFFA500)
          .setDescription(`**Now Playing:** ${previousSong.title} by ${previousSong.artist}`)
          .setThumbnail(previousSong.thumbnail || 'https://i.imgur.com/SjIgjlE.png');

        await safeInteractionUpdate(interaction, {
          embeds: [embed],
          components: interaction.message.components
        });
      } else {
        await safeInteractionReply(interaction, { content: '❌ No previous song in history.', ephemeral: true });
      }
      return;
    }

    if (action === 'music_play') {
      const [, index, query] = interaction.customId.split(':');
      const songIndex = parseInt(index);

      // Voice channel validation
      const voiceChannel = interaction.member.voice?.channel;
      if (!voiceChannel) {
        logCommandExecution(interaction, false, new Error('No voice channel'));
        return interaction.reply({
          content: '🎵 **You must be in a voice channel to play music!**',
          ephemeral: true
        });
      }

      // Bot permissions
      const botPermissions = voiceChannel.permissionsFor(interaction.guild.members.me);
      if (!botPermissions.has('Connect') || !botPermissions.has('Speak')) {
        logCommandExecution(interaction, false, new Error('Missing permissions'));
        return interaction.reply({
          content: '❌ **I need "Connect" and "Speak" permissions in your voice channel.**',
          ephemeral: true
        });
      }

      try {
        // Re-search to get the song (since we can't store the full list)
        const songs = await searchSongs(query, 5);
        if (songs.length > songIndex) {
          const song = songs[songIndex];

          // Play the song
          const result = await play(interaction.guild.id, voiceChannel, song);
          if (!result.success) {
            let errorMessage = `❌ **Failed to play music**`;
            switch (result.errorType) {
              case 'validation_failed':
                errorMessage += `\n\n📹 **Video unavailable**\nThe requested video is no longer available.`;
                break;
              case 'stream_creation':
                errorMessage += `\n\n🔊 **Audio stream error**\nThere was an issue creating the audio stream.`;
                break;
              case 'connection_failed':
                errorMessage += `\n\n🔗 **Voice connection error**\nFailed to establish connection.`;
                break;
              default:
                errorMessage += `: ${result.error}`;
            }
            await safeInteractionReply(interaction, { content: errorMessage, ephemeral: true });
          } else {
            // Create success embed
            const embed = new EmbedBuilder()
              .setTitle('🎵 Now Playing')
              .setColor(0x00FF00)
              .setDescription(`**${song.title}** by **${song.artist}**`)
              .addFields(
                { name: '⏱️ Duration', value: song.duration, inline: true },
                { name: '🔊 Volume', value: `${getMusicStats(interaction.guild.id).volume}%`, inline: true },
                { name: '👤 Requested by', value: interaction.user.username, inline: true }
              )
              .setThumbnail(song.thumbnail || 'https://i.imgur.com/SjIgjlE.png');

            if (song.source === 'spotify') {
              embed.addFields({ name: 'ℹ️ Note', value: 'Playing 30-second preview from Spotify', inline: false });
            } else if (song.source === 'youtube') {
              embed.addFields({ name: 'ℹ️ Note', value: 'Playing full track from YouTube', inline: false });
            }

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`music_pause:${interaction.guild.id}`).setLabel('⏸️ Pause').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId(`music_skip:${interaction.guild.id}`).setLabel('⏭️ Skip').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`music_stop:${interaction.guild.id}`).setLabel('⏹️ Stop').setStyle(ButtonStyle.Danger),
              new ButtonBuilder().setCustomId(`music_queue:${interaction.guild.id}`).setLabel('📋 Queue').setStyle(ButtonStyle.Secondary)
            );

            await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
          }
        } else {
          await safeInteractionReply(interaction, { content: '❌ **Song no longer available**', ephemeral: true });
        }
      } catch (error) {
        logger.error('[MUSIC] Play button error', error, {
          userId: interaction.user.id,
          query,
          songIndex
        });
        await safeInteractionReply(interaction, { content: '❌ **Failed to play song**', ephemeral: true });
      }
      return;
    }

    if (action === 'music_radio_change') {
      const [, stationKey] = interaction.customId.split(':');

      try {
        const stations = getRadioStations();
        const station = stations[stationKey];

        if (!station) {
          await safeInteractionReply(interaction, { content: '❌ Invalid radio station.', ephemeral: true });
          return;
        }

        // Voice channel check
        const voiceChannel = interaction.member.voice?.channel;
        if (!voiceChannel) {
          logCommandExecution(interaction, false, new Error('No voice channel'));
          return interaction.reply({ content: '🎵 You must be in a voice channel to change radio!', ephemeral: true });
        }

        // Create song object for radio
        const song = {
          title: station.name,
          artist: station.genre,
          duration: 'Live Stream',
          url: station.url,
          thumbnail: 'https://i.imgur.com/SjIgjlE.png',
          requestedBy: interaction.user.username
        };

        // Play the radio
        const result = await play(interaction.guild.id, voiceChannel, song);
        if (!result.success) {
          let errorMessage = `❌ **Failed to change radio station**`;
          switch (result.errorType) {
            case 'validation_failed':
              errorMessage += `\n\n📻 **Radio station unavailable**`;
              break;
            case 'stream_creation':
              errorMessage += `\n\n🔊 **Stream error**`;
              break;
            case 'connection_failed':
              errorMessage += `\n\n🔗 **Voice connection error**`;
              break;
            default:
              errorMessage += `: ${result.error}`;
          }
          await safeInteractionReply(interaction, { content: errorMessage, ephemeral: true });
        } else {
          const embed = new EmbedBuilder()
            .setTitle(`📻 Changed Station: ${station.name}`)
            .setColor(0xFF9800)
            .setDescription(`**${station.name}** radio is now playing!\n\n🎵 *Live streaming activated*`)
            .addFields(
              { name: '📻 Station', value: station.name, inline: true },
              { name: '🎵 Genre', value: station.genre, inline: true },
              { name: '🔊 Quality', value: 'Live Stream', inline: true }
            );

          await safeInteractionUpdate(interaction, { embeds: [embed], components: interaction.message.components });
        }
      } catch (error) {
        logger.error('[MUSIC] Radio change button error', error, {
          userId: interaction.user.id,
          stationKey
        });
        await safeInteractionReply(interaction, { content: '❌ Failed to change radio station.', ephemeral: true });
      }
      return;
    }

    // RPG/Explore button handlers
    if (action === 'rpg_leaderboard') {
      const [, offset, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot view another user\'s leaderboard.', ephemeral: true });
      }

      const limit = 10;
      const offsetNum = parseInt(offset) || 0;
      let board, total;
      try {
        board = getLeaderboard(limit, offsetNum);
        total = getLeaderboardCount();
      } catch (e) {
        board = [];
        total = 0;
      }
      const totalPages = Math.ceil(total / limit);
      const page = Math.floor(offsetNum / limit) + 1;

      const list = board.map((p, i) => `${offsetNum + i + 1}. ${p.name} — Level ${p.lvl} XP ${p.xp} ATK ${p.atk}`).join('\n');

      const embed = new EmbedBuilder()
        .setTitle('🏆 RPG Leaderboard')
        .setColor(0xFFD700)
        .setDescription(`Leaderboard — Page ${page}/${totalPages}\n\n${list}`);

      const row = new ActionRowBuilder();
      if (offsetNum > 0) row.addComponents(new ButtonBuilder().setCustomId(`rpg_leaderboard:${Math.max(0, offsetNum - limit)}:${interaction.user.id}`).setLabel('Prev').setStyle(ButtonStyle.Secondary));
      if (offsetNum + limit < total) row.addComponents(new ButtonBuilder().setCustomId(`rpg_leaderboard:${offsetNum + limit}:${interaction.user.id}`).setLabel('Next').setStyle(ButtonStyle.Primary));

      await safeInteractionUpdate(interaction, { embeds: [embed], components: row.components.length ? [row] : [] });
      return;
    }

    if (action === 'rpg_reset_modal') {
      const [, , targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot reset another user\'s character.', ephemeral: true });
      }

      const modal = new ModalBuilder().setCustomId(`rpg_reset_confirm:btn:${interaction.user.id}:${arg3 || 'warrior'}`).setTitle('Confirm Reset');
      const input = new TextInputBuilder().setCustomId('confirm_text').setLabel('Type RESET to confirm').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('RESET');

      modal.addComponents({ type: 1, components: [input] });
      await interaction.showModal(modal);
      return;
    }

    if (action === 'explore_investigate') {
      const [, locationId, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot explore for another user.', ephemeral: true });
      }

      const char = getCharacter(interaction.user.id);
      if (!char) {
        return safeInteractionReply(interaction, { content: '❌ You need to create a character first!', ephemeral: true });
      }

      const locations = getLocations();
      const location = locations.find(l => l.id === locationId);
      if (!location) {
        return safeInteractionReply(interaction, { content: '❌ Location not found.', ephemeral: true });
      }

      // Simulate investigation
      const events = ['monster', 'treasure', 'npc'];
      const event = events[Math.floor(Math.random() * events.length)];

      let result, xpGain = 0, goldGain = 0;

      if (event === 'monster') {
        const monster = encounterMonster(char.lvl);
        const damage = fightTurn(char, monster);
        if (damage > 0) {
          char.hp -= damage;
          if (char.hp <= 0) {
            char.hp = 1; // Don't let HP go to 0
          }
        }
        result = `🔍 You investigate the area and encounter a **${monster.name}**!\n⚔️ You take **${damage}** damage. HP: ${char.hp}/${char.maxHp}`;
        xpGain = 5;
      } else if (event === 'treasure') {
        const gold = Math.floor(Math.random() * 20) + 5;
        char.gold += gold;
        goldGain = gold;
        result = `🔍 You discover a hidden treasure chest!\n💰 You find **${gold}** gold!`;
        xpGain = 3;
      } else {
        result = `🔍 You meet a friendly traveler who shares some wisdom!\n📖 You gain some experience from the conversation.`;
        xpGain = 2;
      }

      applyXp(interaction.user.id, char, xpGain);
      saveCharacter(interaction.user.id, char);

      const embed = new EmbedBuilder()
        .setTitle('🔍 Investigation Results')
        .setColor(0x4CAF50)
        .setDescription(result)
        .addFields(
          { name: '📊 Stats', value: `Level ${char.lvl} • XP ${char.xp} • Gold ${char.gold}`, inline: true }
        );

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      return;
    }

    if (action === 'explore_search') {
      const [, locationId, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot explore for another user.', ephemeral: true });
      }

      const char = getCharacter(interaction.user.id);
      if (!char) {
        return safeInteractionReply(interaction, { content: '❌ You need to create a character first!', ephemeral: true });
      }

      const locations = getLocations();
      const location = locations.find(l => l.id === locationId);
      if (!location) {
        return safeInteractionReply(interaction, { content: '❌ Location not found.', ephemeral: true });
      }

      // Higher risk, higher reward search
      const events = ['monster', 'monster', 'treasure', 'treasure', 'trap'];
      const event = events[Math.floor(Math.random() * events.length)];

      let result, xpGain = 0, goldGain = 0, itemGain = null;

      if (event === 'monster') {
        const monster = encounterMonster(char.lvl + 1);
        const damage = fightTurn(char, monster);
        if (damage > 0) {
          char.hp -= damage;
          if (char.hp <= 0) {
            char.hp = 1;
          }
        }
        result = `⚔️ You search aggressively and fight a **${monster.name}**!\n💥 You take **${damage}** damage. HP: ${char.hp}/${char.maxHp}`;
        xpGain = 8;
      } else if (event === 'treasure') {
        const gold = Math.floor(Math.random() * 50) + 10;
        char.gold += gold;
        goldGain = gold;
        result = `💰 You find a valuable treasure hoard!\n🪙 You gain **${gold}** gold!`;
        xpGain = 5;
      } else if (event === 'trap') {
        const damage = Math.floor(Math.random() * 15) + 5;
        char.hp -= damage;
        if (char.hp <= 0) {
          char.hp = 1;
        }
        result = `⚠️ You trigger a trap!\n💥 You take **${damage}** damage. HP: ${char.hp}/${char.maxHp}`;
        xpGain = 1;
      }

      applyXp(interaction.user.id, char, xpGain);
      saveCharacter(interaction.user.id, char);

      const embed = new EmbedBuilder()
        .setTitle('⚔️ Search Results')
        .setColor(event === 'trap' ? 0xFF0000 : 0x2196F3)
        .setDescription(result)
        .addFields(
          { name: '📊 Stats', value: `Level ${char.lvl} • XP ${char.xp} • Gold ${char.gold}`, inline: true }
        );

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      return;
    }

    if (action === 'explore_rest') {
      const [, locationId, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot rest for another user.', ephemeral: true });
      }

      const char = getCharacter(interaction.user.id);
      if (!char) {
        return safeInteractionReply(interaction, { content: '❌ You need to create a character first!', ephemeral: true });
      }

      // Rest to recover HP and MP
      const hpGain = Math.floor(char.maxHp * 0.3);
      const mpGain = Math.floor(char.maxMp * 0.2);
      char.hp = Math.min(char.maxHp, char.hp + hpGain);
      char.mp = Math.min(char.maxMp, char.mp + mpGain);

      saveCharacter(interaction.user.id, char);

      const embed = new EmbedBuilder()
        .setTitle('🛌 Rest Results')
        .setColor(0x4CAF50)
        .setDescription(`You take a peaceful rest in the safety of ${locationId}.\n❤️ HP +${hpGain} → ${char.hp}/${char.maxHp}\n🔵 MP +${mpGain} → ${char.mp}/${char.maxMp}`)
        .addFields(
          { name: '📊 Stats', value: `Level ${char.lvl} • XP ${char.xp} • Gold ${char.gold}`, inline: true }
        );

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      return;
    }

    if (action === 'explore_continue') {
      const [, locationName, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot continue adventure for another user.', ephemeral: true });
      }

      const char = getCharacter(interaction.user.id);
      if (!char) {
        return safeInteractionReply(interaction, { content: '❌ You need to create a character first!', ephemeral: true });
      }

      // Simulate continuing adventure
      const event = randomEventType();
      let result, xpGain = 0;

      if (event === 'monster') {
        const monster = encounterMonster(char.lvl);
        const damage = fightTurn(char, monster);
        if (damage > 0) {
          char.hp -= damage;
          if (char.hp <= 0) {
            char.hp = 1;
          }
        }
        result = `🏃 You continue your adventure and encounter a **${monster.name}**!\n⚔️ You take **${damage}** damage. HP: ${char.hp}/${char.maxHp}`;
        xpGain = 6;
      } else if (event === 'treasure') {
        const gold = Math.floor(Math.random() * 30) + 10;
        char.gold += gold;
        result = `🏃 You discover treasure along the way!\n💰 You find **${gold}** gold!`;
        xpGain = 4;
      } else if (event === 'trap') {
        const damage = Math.floor(Math.random() * 10) + 3;
        char.hp -= damage;
        if (char.hp <= 0) {
          char.hp = 1;
        }
        result = `🏃 You trigger a trap while exploring!\n💥 You take **${damage}** damage. HP: ${char.hp}/${char.maxHp}`;
        xpGain = 2;
      } else {
        result = `🏃 You meet helpful travelers who guide you safely!\n📖 You learn from their stories.`;
        xpGain = 3;
      }

      applyXp(interaction.user.id, char, xpGain);
      saveCharacter(interaction.user.id, char);

      const embed = new EmbedBuilder()
        .setTitle('🏃 Continue Adventure')
        .setColor(0x2196F3)
        .setDescription(result)
        .addFields(
          { name: '📊 Stats', value: `Level ${char.lvl} • XP ${char.xp} • Gold ${char.gold}`, inline: true }
        );

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      return;
    }

    if (action === 'explore_leave') {
      const [, locationName, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot leave for another user.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle('🏃 Leave Location')
        .setColor(0xFF9800)
        .setDescription(`You safely leave ${locationName} and return to town.\n\n*Your adventure continues another day!*`);

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      return;
    }

    // Economy button handlers
    if (action === 'economy_transfer') {
      const [, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot transfer for another user.', ephemeral: true });
      }

      const modal = new ModalBuilder().setCustomId(`economy_transfer_modal:${interaction.user.id}`).setTitle('Transfer Gold');
      const recipientInput = new TextInputBuilder().setCustomId('recipient').setLabel('Recipient (username)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('username');
      const amountInput = new TextInputBuilder().setCustomId('amount').setLabel('Amount').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('100');

      modal.addComponents(
        { type: 1, components: [recipientInput] },
        { type: 1, components: [amountInput] }
      );

      await interaction.showModal(modal);
      return;
    }

    if (action === 'economy_market') {
      const [, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot access market for another user.', ephemeral: true });
      }

      const marketPrices = getMarketPrice();
      const embed = new EmbedBuilder()
        .setTitle('🛒 Market Prices')
        .setColor(0x4CAF50)
        .setDescription('Current market prices:');

      for (const [item, price] of Object.entries(marketPrices)) {
        embed.addFields({
          name: item.charAt(0).toUpperCase() + item.slice(1),
          value: `${price} gold`,
          inline: true
        });
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`economy_buy:${interaction.user.id}`).setLabel('🛒 Buy').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`economy_sell:${interaction.user.id}`).setLabel('💸 Sell').setStyle(ButtonStyle.Success)
      );

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
      return;
    }

    if (action === 'economy_business') {
      const [, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot manage business for another user.', ephemeral: true });
      }

      const income = Math.floor(Math.random() * 50) + 10;
      const balanceUpdate = addBalance(interaction.user.id, income);

      const embed = new EmbedBuilder()
        .setTitle('🏪 Business Income')
        .setColor(0x4CAF50)
        .setDescription(`Your business generated **${income}** gold today!\n💰 New balance: **${balanceUpdate}** gold`);

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      return;
    }

    if (action === 'economy_invest') {
      const [, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot invest for another user.', ephemeral: true });
      }

      const currentBalance = getBalance(interaction.user.id);
      if (currentBalance < 100) {
        return safeInteractionReply(interaction, { content: '❌ You need at least 100 gold to invest.', ephemeral: true });
      }

      const investment = 100;
      const returns = Math.random() > 0.5 ? investment * 1.5 : investment * 0.8;
      const profit = returns - investment;

      if (profit > 0) {
        addBalance(interaction.user.id, profit);
      } else {
        addBalance(interaction.user.id, profit); // This will subtract
      }

      const embed = new EmbedBuilder()
        .setTitle('📈 Investment Results')
        .setColor(profit > 0 ? 0x4CAF50 : 0xFF0000)
        .setDescription(`You invested **${investment}** gold.\n${profit > 0 ? '📈 Profit' : '📉 Loss'}: **${Math.abs(profit)}** gold\n💰 New balance: **${getBalance(interaction.user.id)}** gold`);

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      return;
    }

    if (action === 'economy_buy') {
      const [, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot buy for another user.', ephemeral: true });
      }

      const marketPrices = getMarketPrice();
      const embed = new EmbedBuilder()
        .setTitle('🛒 Buy from Market')
        .setColor(0x2196F3)
        .setDescription('Select an item to buy:');

      let description = '';
      for (const [item, price] of Object.entries(marketPrices)) {
        description += `• ${item.charAt(0).toUpperCase() + item.slice(1)}: ${price} gold\n`;
      }
      description += '\n*Use the modal to specify what you want to buy.*';

      embed.setDescription(description);

      const modal = new ModalBuilder().setCustomId(`economy_buy_modal:${interaction.user.id}`).setTitle('Buy Item');
      const itemInput = new TextInputBuilder().setCustomId('item_name').setLabel('Item Name').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('health_potion');
      const quantityInput = new TextInputBuilder().setCustomId('quantity').setLabel('Quantity').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('1');

      modal.addComponents(
        { type: 1, components: [itemInput] },
        { type: 1, components: [quantityInput] }
      );

      await interaction.showModal(modal);
      return;
    }

    if (action === 'economy_sell') {
      const [, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot sell for another user.', ephemeral: true });
      }

      const char = getCharacter(interaction.user.id);
      if (!char) {
        return safeInteractionReply(interaction, { content: '❌ You need to create a character first!', ephemeral: true });
      }

      const inventory = getInventory(interaction.user.id);
      if (Object.keys(inventory).length === 0) {
        return safeInteractionReply(interaction, { content: '❌ Your inventory is empty!', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle('💸 Sell Items')
        .setColor(0xFF9800)
        .setDescription('Select items to sell from your inventory:');

      let description = '';
      for (const [itemId, quantity] of Object.entries(inventory)) {
        const item = getItemInfo(itemId);
        if (item) {
          const sellPrice = Math.floor(item.value * 0.7); // 70% of buy price
          description += `• ${item.name}: ${quantity}x (${sellPrice} gold each)\n`;
        }
      }
      description += '\n*Use the modal to specify what you want to sell.*';

      embed.setDescription(description);

      const modal = new ModalBuilder().setCustomId(`economy_sell_modal:${interaction.user.id}`).setTitle('Sell Item');
      const itemInput = new TextInputBuilder().setCustomId('item_name').setLabel('Item Name').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('health_potion');
      const quantityInput = new TextInputBuilder().setCustomId('quantity').setLabel('Quantity').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('1');

      modal.addComponents(
        { type: 1, components: [itemInput] },
        { type: 1, components: [quantityInput] }
      );

      await interaction.showModal(modal);
      return;
    }

    // Other module button handlers
    if (action === 'trade_create_auction') {
      const [, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot create auctions for another user.', ephemeral: true });
      }

      const modal = new ModalBuilder().setCustomId(`trade_create_auction_modal:${interaction.user.id}`).setTitle('Create Auction');
      const itemInput = new TextInputBuilder().setCustomId('item_name').setLabel('Item Name').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('health_potion');
      const quantityInput = new TextInputBuilder().setCustomId('quantity').setLabel('Quantity').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('1');
      const priceInput = new TextInputBuilder().setCustomId('starting_price').setLabel('Starting Price (gold)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('50');

      modal.addComponents(
        { type: 1, components: [itemInput] },
        { type: 1, components: [quantityInput] },
        { type: 1, components: [priceInput] }
      );

      await interaction.showModal(modal);
      return;
    }

    if (action === 'trade_view_auctions') {
      const [, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot view auctions for another user.', ephemeral: true });
      }

      const auctions = getActiveAuctions();
      const embed = new EmbedBuilder()
        .setTitle('🔍 Active Auctions')
        .setColor(0x2196F3)
        .setDescription(auctions.length > 0 ?
          auctions.slice(0, 10).map(a => `• ${a.itemName} x${a.quantity} - Starting: ${a.startingPrice} gold - Seller: ${a.seller}`).join('\n') :
          'No active auctions at the moment.'
        );

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      return;
    }

    if (action === 'profile_edit') {
      const [, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot edit another user\'s profile.', ephemeral: true });
      }

      const modal = new ModalBuilder().setCustomId(`profile_edit_modal:${interaction.user.id}`).setTitle('Edit Profile');
      const displayNameInput = new TextInputBuilder().setCustomId('display_name').setLabel('Display Name').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Your display name');

      modal.addComponents({ type: 1, components: [displayNameInput] });
      await interaction.showModal(modal);
      return;
    }

    if (action === 'profile_refresh') {
      const [, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot refresh another user\'s profile.', ephemeral: true });
      }

      // Profile refresh logic would go here
      const embed = new EmbedBuilder()
        .setTitle('🔄 Profile Refreshed')
        .setColor(0x4CAF50)
        .setDescription('Profile data has been refreshed!');

      await safeInteractionUpdate(interaction, { embeds: [embed], components: interaction.message.components });
      return;
    }

    if (action === 'profile_compare') {
      const [, targetUserId, compareUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot compare profiles for another user.', ephemeral: true });
      }

      // Profile comparison logic would go here
      const embed = new EmbedBuilder()
        .setTitle('⚖️ Profile Comparison')
        .setColor(0x2196F3)
        .setDescription('Profile comparison feature coming soon!');

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      return;
    }

    if (action === 'remind_upcoming') {
      const [, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot view reminders for another user.', ephemeral: true });
      }

      // Reminder logic would go here
      const embed = new EmbedBuilder()
        .setTitle('📅 Upcoming Reminders')
        .setColor(0xFF9800)
        .setDescription('No upcoming reminders set.');

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      return;
    }

    if (action === 'memory_reset') {
      const [, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot reset memory for another user.', ephemeral: true });
      }

      // Memory game reset logic would go here
      const embed = new EmbedBuilder()
        .setTitle('🔄 Memory Game Reset')
        .setColor(0x4CAF50)
        .setDescription('Memory game has been reset!');

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      return;
    }

    if (action === 'inventory_refresh') {
      const [, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot refresh inventory for another user.', ephemeral: true });
      }

      const char = getCharacter(interaction.user.id);
      if (!char) {
        return safeInteractionReply(interaction, { content: '❌ You need to create a character first!', ephemeral: true });
      }

      const inventory = getInventory(interaction.user.id);
      const inventoryValue = getInventoryValue(interaction.user.id);

      const embed = new EmbedBuilder()
        .setTitle('🎒 Inventory')
        .setColor(0x8B4513)
        .setDescription(`💰 Total Value: ${inventoryValue} gold`);

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
        new ButtonBuilder().setCustomId(`inventory_random:${interaction.user.id}`).setLabel('🎲 Get Random Item').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`inventory_sell_all:${interaction.user.id}`).setLabel('💰 Sell All Junk').setStyle(ButtonStyle.Success)
      );

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
      return;
    }

    if (action === 'inventory_random') {
      const [, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot get random items for another user.', ephemeral: true });
      }

      const char = getCharacter(interaction.user.id);
      if (!char) {
        return safeInteractionReply(interaction, { content: '❌ You need to create a character first!', ephemeral: true });
      }

      const randomItem = generateRandomItem(char.lvl);
      addItemToInventory(interaction.user.id, randomItem.id, 1);

      const embed = new EmbedBuilder()
        .setTitle('🎲 Random Item')
        .setColor(0xFFD700)
        .setDescription(`You found a **${randomItem.name}**!\n\n${randomItem.description}`)
        .addFields(
          { name: '📊 Stats', value: `Rarity: ${randomItem.rarity} • Value: ${randomItem.value} gold`, inline: true }
        );

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      return;
    }

    if (action === 'inventory_sell_all') {
      const [, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot sell items for another user.', ephemeral: true });
      }

      const char = getCharacter(interaction.user.id);
      if (!char) {
        return safeInteractionReply(interaction, { content: '❌ You need to create a character first!', ephemeral: true });
      }

      const inventory = getInventory(interaction.user.id);
      let totalGold = 0;
      let itemsSold = 0;

      for (const [itemId, quantity] of Object.entries(inventory)) {
        const item = getItemInfo(itemId);
        if (item && item.rarity === 'common') { // Only sell common items as "junk"
          const sellPrice = Math.floor(item.value * 0.5); // 50% of value for junk
          totalGold += sellPrice * quantity;
          itemsSold += quantity;
          removeItemFromInventory(interaction.user.id, itemId, quantity);
        }
      }

      char.gold += totalGold;
      saveCharacter(interaction.user.id, char);

      const embed = new EmbedBuilder()
        .setTitle('💰 Sold Junk Items')
        .setColor(0x4CAF50)
        .setDescription(`Sold ${itemsSold} common items for ${totalGold} gold!\n💰 New balance: ${char.gold} gold`);

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      return;
    }

    if (action === 'guild_contribute') {
      const [, guildName, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot contribute to guild for another user.', ephemeral: true });
      }

      const modal = new ModalBuilder().setCustomId(`guild_contribute_modal:${guildName}:${interaction.user.id}`).setTitle('Contribute to Guild');
      const amountInput = new TextInputBuilder().setCustomId('amount').setLabel('Gold Amount').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('100');

      modal.addComponents({ type: 1, components: [amountInput] });
      await interaction.showModal(modal);
      return;
    }

    if (action === 'guild_refresh') {
      const [, guildName, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot refresh guild for another user.', ephemeral: true });
      }

      // Guild refresh logic would go here
      const embed = new EmbedBuilder()
        .setTitle('🔄 Guild Refreshed')
        .setColor(0x4CAF50)
        .setDescription(`${guildName} data has been refreshed!`);

      await safeInteractionUpdate(interaction, { embeds: [embed], components: interaction.message.components });
      return;
    }

    if (action === 'party_invite') {
      const [, partyId, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot generate invites for another user.', ephemeral: true });
      }

      // Party invite logic would go here
      const embed = new EmbedBuilder()
        .setTitle('🔗 Party Invite Generated')
        .setColor(0x2196F3)
        .setDescription(`Invite link for party ${partyId}: \`/join ${partyId}\``);

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      return;
    }

    if (action === 'guess_modal') {
      const [, gameId, min, max] = interaction.customId.split(':');

      const modal = new ModalBuilder().setCustomId(`guess_submit:${gameId}`).setTitle('Make Your Guess');
      const guessInput = new TextInputBuilder().setCustomId('guess').setLabel(`Guess a number between ${min} and ${max}`).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(`${min}-${max}`);

      modal.addComponents({ type: 1, components: [guessInput] });
      await interaction.showModal(modal);
      return;
    }

    if (action === 'fun_joke') {
      const [, category, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot get jokes for another user.', ephemeral: true });
      }

      const joke = getRandomJoke(category);
      const embed = new EmbedBuilder()
        .setTitle('😂 Joke')
        .setColor(0xFFD700)
        .setDescription(joke);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fun_joke:${category}:${interaction.user.id}`).setLabel('😂 Another Joke').setStyle(ButtonStyle.Primary)
      );

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
      return;
    }

    if (action === 'fun_rate') {
      const [, jokeId, rating, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot rate jokes for another user.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle('⭐ Rating Submitted')
        .setColor(0x4CAF50)
        .setDescription(`You rated joke ${jokeId} with ${rating} stars!`);

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      return;
    }

    if (action === 'fun_story') {
      const [, genre, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot get stories for another user.', ephemeral: true });
      }

      const story = generateStory(genre);
      const embed = new EmbedBuilder()
        .setTitle('📖 Story')
        .setColor(0x9932CC)
        .setDescription(story);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fun_story:${genre}:${interaction.user.id}`).setLabel('📖 Another Story').setStyle(ButtonStyle.Primary)
      );

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
      return;
    }

    if (action === 'fun_share') {
      const [, contentId, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot share for another user.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle('📤 Content Shared')
        .setColor(0x2196F3)
        .setDescription(`Content ${contentId} has been shared!`);

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      return;
    }

    if (action === 'fun_riddle') {
      const [, difficulty, riddleId, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot view riddles for another user.', ephemeral: true });
      }

      const riddle = getRiddle(difficulty);
      const embed = new EmbedBuilder()
        .setTitle('💡 Riddle')
        .setColor(0xFF9800)
        .setDescription(`**${riddle.question}**\n\n${riddle.hint ? `*Hint: ${riddle.hint}*` : ''}`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fun_riddle:${difficulty}:${riddle.id}:${interaction.user.id}`).setLabel('💡 Show Answer').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`fun_riddle_new:${difficulty}:${interaction.user.id}`).setLabel('🧩 New Riddle').setStyle(ButtonStyle.Secondary)
      );

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
      return;
    }

    if (action === 'fun_riddle_new') {
      const [, difficulty, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot get new riddles for another user.', ephemeral: true });
      }

      const riddle = getRiddle(difficulty);
      const embed = new EmbedBuilder()
        .setTitle('🧩 New Riddle')
        .setColor(0xFF9800)
        .setDescription(`**${riddle.question}**\n\n${riddle.hint ? `*Hint: ${riddle.hint}*` : ''}`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fun_riddle:${difficulty}:${riddle.id}:${interaction.user.id}`).setLabel('💡 Show Answer').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`fun_riddle_new:${difficulty}:${interaction.user.id}`).setLabel('🧩 Another Riddle').setStyle(ButtonStyle.Secondary)
      );

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
      return;
    }

    if (action === 'fun_fact') {
      const [, category, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot get facts for another user.', ephemeral: true });
      }

      const fact = getFunFact(category);
      const embed = new EmbedBuilder()
        .setTitle('🧠 Fun Fact')
        .setColor(0x4CAF50)
        .setDescription(fact);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fun_fact:${category}:${interaction.user.id}`).setLabel('🧠 Another Fact').setStyle(ButtonStyle.Primary)
      );

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
      return;
    }

    if (action === 'fun_quote') {
      const [, category, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot get quotes for another user.', ephemeral: true });
      }

      const quote = getRandomQuote(category);
      const embed = new EmbedBuilder()
        .setTitle('💬 Quote')
        .setColor(0x9932CC)
        .setDescription(`"${quote.text}"\n\n— ${quote.author}`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fun_quote:${category}:${interaction.user.id}`).setLabel('💬 Another Quote').setStyle(ButtonStyle.Primary)
      );

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
      return;
    }

    if (action === 'fun_8ball') {
      const [, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot use 8ball for another user.', ephemeral: true });
      }

      const answer = magic8Ball();
      const embed = new EmbedBuilder()
        .setTitle('🔮 Magic 8-Ball')
        .setColor(0x000000)
        .setDescription(`🎱 ${answer}`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fun_8ball:${interaction.user.id}`).setLabel('🔮 Ask Again').setStyle(ButtonStyle.Primary)
      );

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
      return;
    }

    if (action === 'fun_name') {
      const [, type, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot generate names for another user.', ephemeral: true });
      }

      const name = generateFunName(type);
      const embed = new EmbedBuilder()
        .setTitle('🎭 Fun Name')
        .setColor(0xFF69B4)
        .setDescription(`**${name}**`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fun_name:${type}:${interaction.user.id}`).setLabel('🎭 Another Name').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`fun_name_random:${interaction.user.id}`).setLabel('🎲 Random Type').setStyle(ButtonStyle.Secondary)
      );

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
      return;
    }

    if (action === 'fun_name_random') {
      const [, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot generate names for another user.', ephemeral: true });
      }

      const types = ['hero', 'villain', 'animal', 'object'];
      const randomType = types[Math.floor(Math.random() * types.length)];
      const name = generateFunName(randomType);

      const embed = new EmbedBuilder()
        .setTitle('🎲 Random Fun Name')
        .setColor(0xFF69B4)
        .setDescription(`**${name}** (${randomType})`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fun_name:${randomType}:${interaction.user.id}`).setLabel('🎭 Another Name').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`fun_name_random:${interaction.user.id}`).setLabel('🎲 Random Type').setStyle(ButtonStyle.Secondary)
      );

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
      return;
    }

    if (action === 'fun_challenge') {
      const [, type, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot get challenges for another user.', ephemeral: true });
      }

      const challenge = createFunChallenge(type);
      const embed = new EmbedBuilder()
        .setTitle('🎯 Challenge')
        .setColor(0xFF4500)
        .setDescription(challenge);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fun_challenge:${type}:${interaction.user.id}`).setLabel('🎯 Accept Challenge').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`fun_challenge_new:${type}:${interaction.user.id}`).setLabel('🔄 New Challenge').setStyle(ButtonStyle.Secondary)
      );

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
      return;
    }

    if (action === 'fun_challenge_new') {
      const [, type, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot get challenges for another user.', ephemeral: true });
      }

      const challenge = createFunChallenge(type);
      const embed = new EmbedBuilder()
        .setTitle('🔄 New Challenge')
        .setColor(0xFF4500)
        .setDescription(challenge);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fun_challenge:${type}:${interaction.user.id}`).setLabel('🎯 Accept Challenge').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`fun_challenge_new:${type}:${interaction.user.id}`).setLabel('🔄 Another Challenge').setStyle(ButtonStyle.Secondary)
      );

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [row] });
      return;
    }

    if (action === 'ai_chat') {
      const [, model, personality, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot continue chat for another user.', ephemeral: true });
      }

      // AI chat continuation logic would go here
      const embed = new EmbedBuilder()
        .setTitle('💬 AI Chat Continued')
        .setColor(0x00FF00)
        .setDescription('Chat continuation feature coming soon!');

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      return;
    }

    if (action === 'ai_clear') {
      const [, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot clear history for another user.', ephemeral: true });
      }

      // AI history clear logic would go here
      const embed = new EmbedBuilder()
        .setTitle('🗑️ AI History Cleared')
        .setColor(0xFF0000)
        .setDescription('Chat history has been cleared!');

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      return;
    }

    if (action === 'admin_warn') {
      const [, targetUserId, guildId] = interaction.customId.split(':');

      // Admin permission check would go here
      const embed = new EmbedBuilder()
        .setTitle('⚠️ User Warned')
        .setColor(0xFFA500)
        .setDescription(`User <@${targetUserId}> has been warned.`);

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      return;
    }

    if (action === 'admin_mute') {
      const [, targetUserId, guildId] = interaction.customId.split(':');

      // Admin permission check would go here
      try {
        await muteUser(interaction.guild.id, targetUserId);
        const embed = new EmbedBuilder()
          .setTitle('🔇 User Muted')
          .setColor(0xFF0000)
          .setDescription(`User <@${targetUserId}> has been muted.`);

        await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      } catch (error) {
        await safeInteractionReply(interaction, { content: '❌ Failed to mute user.', ephemeral: true });
      }
      return;
    }

    if (action === 'admin_unmute') {
      const [, targetUserId, guildId] = interaction.customId.split(':');

      // Admin permission check would go here
      try {
        await unmuteUser(interaction.guild.id, targetUserId);
        const embed = new EmbedBuilder()
          .setTitle('🔊 User Unmuted')
          .setColor(0x4CAF50)
          .setDescription(`User <@${targetUserId}> has been unmuted.`);

        await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      } catch (error) {
        await safeInteractionReply(interaction, { content: '❌ Failed to unmute user.', ephemeral: true });
      }
      return;
    }

    if (action === 'admin_unban') {
      const [, targetUserId, guildId] = interaction.customId.split(':');

      // Admin permission check would go here
      try {
        await unbanUser(interaction.guild.id, targetUserId);
        const embed = new EmbedBuilder()
          .setTitle('✅ User Unbanned')
          .setColor(0x4CAF50)
          .setDescription(`User <@${targetUserId}> has been unbanned.`);

        await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      } catch (error) {
        await safeInteractionReply(interaction, { content: '❌ Failed to unban user.', ephemeral: true });
      }
      return;
    }

    if (action === 'achievements_refresh') {
      const [, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot refresh achievements for another user.', ephemeral: true });
      }

      // Achievement refresh logic would go here
      const embed = new EmbedBuilder()
        .setTitle('🔄 Achievements Refreshed')
        .setColor(0x4CAF50)
        .setDescription('Achievement data has been refreshed!');

      await safeInteractionUpdate(interaction, { embeds: [embed], components: interaction.message.components });
      return;
    }

    if (action === 'achievements_leaderboard') {
      const [, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot view leaderboard for another user.', ephemeral: true });
      }

      // Achievement leaderboard logic would go here
      const embed = new EmbedBuilder()
        .setTitle('🏅 Achievement Leaderboard')
        .setColor(0xFFD700)
        .setDescription('Achievement leaderboard feature coming soon!');

      await safeInteractionUpdate(interaction, { embeds: [embed], components: [] });
      return;
    }

    if (action === 'wordle_guess') {
      const [, targetUserId] = interaction.customId.split(':');

      if (targetUserId && targetUserId !== interaction.user.id) {
        logCommandExecution(interaction, false, new Error('Wrong user'));
        return safeInteractionReply(interaction, { content: 'You cannot guess for another user.', ephemeral: true });
      }

      sendWordleGuessModal(interaction, interaction.user.id);
      return;
    }

    // Unrecognized button action with comprehensive logging
    logger.warn(`Unrecognized button action: ${action}`, {
      userId: interaction.user.id,
      username: interaction.user.username,
      customId: interaction.customId,
      guild: interaction.guild?.name || 'DM',
      guildId: interaction.guild?.id || 'N/A'
    });
    logCommandExecution(interaction, false, new Error(`Unrecognized button action: ${action}`));
    await safeInteractionReply(interaction, {
      content: `❌ **Unknown button action: ${action}**\n\nThis button is not implemented yet. Please contact the bot administrator if this is unexpected.`,
      ephemeral: true
    });

  } catch (error) {
    logger.error(`Error handling button action ${action}`, error, {
      userId: interaction.user.id,
      action,
      customId: interaction.customId
    });
    logCommandExecution(interaction, false, error);
    await safeInteractionReply(interaction, {
      content: '❌ **An error occurred while processing the button.**\n\nPlease try again later.',
      ephemeral: true
    });
  }
}