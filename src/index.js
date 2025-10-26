import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Client, Collection, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

console.log('Starting bot...');
import { handleMessage } from './chat.js';
console.log('Imported handleMessage from chat.js');
import { checkTypingAttempt } from './minigames/typing.js';
console.log('Imported checkTypingAttempt from minigames/typing.js');
import { logger, logCommandExecution, logError } from './logger.js';
console.log('Imported logger from logger.js');
import { getLocations } from './locations.js';
console.log('Imported getLocations from locations.js');
// import { schedulerManager } from './scheduler.js';

console.log('All imports successful');
console.log('Logger available:', typeof logger.info === 'function');
import { getActiveAuctions } from './trading.js';
import { isOnCooldown, setCooldown, getFormattedCooldown } from './cooldowns.js';

// Helper function for Wordle guess modal
async function sendWordleGuessModal(interaction, gameId) {
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

// Helper function to safely handle interactions and prevent duplicate responses
async function safeInteractionReply(interaction, options) {
  const interactionId = interaction.id;

  // Check if this interaction has already been processed
  if (processedInteractions.has(interactionId)) {
    console.warn(`Interaction ${interactionId} already processed, ignoring`);
    return false;
  }

  try {
    // Check if interaction is still valid (not expired)
    if (interaction.replied || interaction.deferred) {
      console.warn(`Interaction ${interactionId} already replied/deferred`);
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

    await interaction.reply(options);
    return true;
  } catch (error) {
    console.error(`Failed to reply to interaction ${interactionId}:`, error);
    return false;
  }
}

// Helper function to safely update interactions
async function safeInteractionUpdate(interaction, options) {
  const interactionId = interaction.id;

  // Check if this interaction has already been processed
  if (processedInteractions.has(interactionId)) {
    console.warn(`Interaction ${interactionId} already processed, ignoring`);
    return false;
  }

  try {
    // Check if interaction is still valid
    if (interaction.replied || interaction.deferred) {
      console.warn(`Interaction ${interactionId} already replied/deferred`);
      return false;
    }

    // Mark as processed
    processedInteractions.set(interactionId, Date.now());

    await interaction.update(options);
    return true;
  } catch (error) {
    console.error(`Failed to update interaction ${interactionId}:`, error);
    return false;
  }
}

// Helper function to update inventory embed
async function updateInventoryEmbed(interaction, itemsByType, inventoryValue) {
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

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN || TOKEN.trim() === '' || TOKEN === 'your-discord-bot-token-here') {
  console.error('DISCORD_TOKEN is missing or invalid in .env file.');
  console.error('Please add a valid Discord bot token from https://discord.com/developers/applications');
  console.error('Update the .env file with: DISCORD_TOKEN=your_actual_token_here');
  process.exit(1);
}

console.log('About to create client');

// Include necessary intents for bot functionality
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Channel],
});

console.log('Client created successfully');
console.log('About to add event listeners');

console.log('About to add event listeners');
client.commands = new Collection();
console.log('Commands collection created');

// simple cooldown map to prevent modal spam: userId -> timestamp of last spend modal
const spendCooldowns = new Map();

// Track processed interactions to prevent duplicate responses: interactionId -> timestamp
const processedInteractions = new Map();

// Hangman game states: userId -> gameState
export const hangmanGames = new Map();

// Wordle game states: userId -> gameState
export const wordleGames = new Map();

// Guess game states: userId -> gameState
export const guessGames = new Map();

// Combat game states: userId -> gameState
export const combatGames = new Map();

// Exploration game states: userId -> gameState
export const explorationGames = new Map();

// Wordle word list
const wordleWords = ['HOUSE', 'PLANE', 'TIGER', 'BREAD', 'CHAIR', 'SNAKE', 'CLOUD', 'LIGHT', 'MUSIC', 'WATER', 'EARTH', 'STORM', 'FLAME', 'SHARP', 'QUIET', 'BRIGHT', 'DANCE', 'FIELD', 'GRASS', 'HEART', 'KNIFE', 'LARGE', 'MOUSE', 'NIGHT', 'OCEAN', 'PIANO', 'QUICK', 'RIVER', 'SHINE', 'TRUCK', 'WHEAT', 'YOUNG', 'ALARM', 'BEACH', 'CLOCK', 'DRIVE', 'ELBOW', 'FLOUR', 'GHOST', 'HAPPY', 'INDEX', 'JOINT', 'KNOCK', 'LUNCH', 'MIGHT', 'NOISE', 'OCCUR', 'PAINT', 'QUILT', 'ROBOT', 'SHORE', 'THICK', 'UNION', 'VOICE', 'WASTE', 'YIELD', 'ABUSE', 'ADULT', 'AGENT', 'AGREE', 'AHEAD', 'ALARM', 'ALBUM', 'ALERT', 'ALIEN', 'ALIGN', 'ALIKE', 'ALIVE', 'ALLOW', 'ALONE', 'ALONG', 'ALTER', 'AMONG', 'ANGER', 'ANGLE', 'ANGRY', 'APART', 'APPLE', 'APPLY', 'ARENA', 'ARGUE', 'ARISE', 'ARMED', 'ARMOR', 'ARRAY', 'ASIDE', 'ASSET', 'AVOID', 'AWAKE', 'AWARD', 'AWARE', 'BADLY', 'BAKER', 'BASES', 'BASIC', 'BEACH', 'BEGAN', 'BEGIN', 'BEING', 'BELOW', 'BENCH', 'BILLY', 'BIRTH', 'BLACK', 'BLAME', 'BLANK', 'BLIND', 'BLOCK', 'BLOOD', 'BOARD', 'BOOST', 'BOOTH', 'BOUND', 'BRAIN', 'BRAND', 'BRASS', 'BRAVE', 'BREAD', 'BREAK', 'BREED', 'BRIEF', 'BRING', 'BROAD', 'BROKE', 'BROWN', 'BUILD', 'BUILT', 'BUYER', 'CABLE', 'CALIF', 'CARRY', 'CATCH', 'CAUSE', 'CHAIN', 'CHAIR', 'CHAOS', 'CHARM', 'CHART', 'CHASE', 'CHEAP', 'CHECK', 'CHEST', 'CHIEF', 'CHILD', 'CHINA', 'CHOSE', 'CIVIL', 'CLAIM', 'CLASS', 'CLEAN', 'CLEAR', 'CLICK', 'CLIMB', 'CLOCK', 'CLOSE', 'CLOUD', 'COACH', 'COAST', 'COULD', 'COUNT', 'COURT', 'COVER', 'CRAFT', 'CRASH', 'CRAZY', 'CREAM', 'CRIME', 'CROSS', 'CROWD', 'CROWN', 'CRUDE', 'CURVE', 'CYCLE', 'DAILY', 'DANCE', 'DATED', 'DEALT', 'DEATH', 'DEBUT', 'DELAY', 'DEPTH', 'DOING', 'DOUBT', 'DOZEN', 'DRAFT', 'DRAMA', 'DRANK', 'DREAM', 'DRESS', 'DRILL', 'DRINK', 'DRIVE', 'DROVE', 'DYING', 'EAGER', 'EARLY', 'EARTH', 'EIGHT', 'ELITE', 'EMPTY', 'ENEMY', 'ENJOY', 'ENTER', 'ENTRY', 'EQUAL', 'ERROR', 'EVENT', 'EVERY', 'EXACT', 'EXIST', 'EXTRA', 'FAITH', 'FALSE', 'FAULT', 'FIBER', 'FIELD', 'FIFTH', 'FIFTY', 'FIGHT', 'FINAL', 'FIRST', 'FIXED', 'FLASH', 'FLEET', 'FLOOR', 'FLUID', 'FOCUS', 'FORCE', 'FORTH', 'FORTY', 'FORUM', 'FOUND', 'FRAME', 'FRANK', 'FRAUD', 'FRESH', 'FRONT', 'FRUIT', 'FULLY', 'FUNNY', 'GIANT', 'GIVEN', 'GLASS', 'GLOBE', 'GOING', 'GRACE', 'GRADE', 'GRAND', 'GRANT', 'GRASS', 'GRAVE', 'GREAT', 'GREEN', 'GROSS', 'GROUP', 'GROWN', 'GUARD', 'GUESS', 'GUEST', 'GUIDE', 'HAPPY', 'HARRY', 'HEART', 'HEAVY', 'HENCE', 'HENRY', 'HORSE', 'HOTEL', 'HOUSE', 'HUMAN', 'HURRY', 'IMAGE', 'INDEX', 'INNER', 'INPUT', 'ISSUE', 'JAPAN', 'JIMMY', 'JOINT', 'JONES', 'JUDGE', 'KNOWN', 'LABEL', 'LARGE', 'LASER', 'LATER', 'LAUGH', 'LAYER', 'LEARN', 'LEASE', 'LEAST', 'LEAVE', 'LEGAL', 'LEVEL', 'LEWIS', 'LIGHT', 'LIMIT', 'LINKS', 'LIVES', 'LOCAL', 'LOOSE', 'LOWER', 'LUCKY', 'LUNCH', 'LYING', 'MAGIC', 'MAJOR', 'MAKER', 'MARCH', 'MARIA', 'MATCH', 'MAYBE', 'MAYOR', 'MEANT', 'MEDAL', 'MEDIA', 'METAL', 'MIGHT', 'MINOR', 'MINUS', 'MIXED', 'MODEL', 'MONEY', 'MONTH', 'MORAL', 'MOTOR', 'MOUNT', 'MOUSE', 'MOUTH', 'MOVED', 'MOVIE', 'MUSIC', 'NEEDS', 'NEVER', 'NEWLY', 'NIGHT', 'NOISE', 'NORTH', 'NOTED', 'NOVEL', 'NURSE', 'OCCUR', 'OCEAN', 'OFFER', 'OFTEN', 'ORDER', 'OTHER', 'OUGHT', 'PAINT', 'PANEL', 'PAPER', 'PARTY', 'PEACE', 'PETER', 'PHASE', 'PHONE', 'PHOTO', 'PIANO', 'PIECE', 'PILOT', 'PITCH', 'PLACE', 'PLAIN', 'PLANE', 'PLANT', 'PLATE', 'PLAYS', 'PLENT', 'PLOTS', 'POEMS', 'POINT', 'POUND', 'POWER', 'PRESS', 'PRICE', 'PRIDE', 'PRIME', 'PRINT', 'PRIOR', 'PRIZE', 'PROOF', 'PROUD', 'PROVE', 'QUEEN', 'QUICK', 'QUIET', 'QUITE', 'RADIO', 'RAISE', 'RANGE', 'RAPID', 'RATIO', 'REACH', 'READY', 'REALM', 'REBEL', 'REFER', 'RELAX', 'REMARK', 'REMIND', 'REMOVE', 'RENDER', 'RENEW', 'RENTAL', 'REPAIR', 'REPEAT', 'REPLACE', 'REPORT', 'RESIST', 'RESOURCE', 'RESPONSE', 'RESULT', 'RETAIN', 'RETIRE', 'RETURN', 'REVEAL', 'REVIEW', 'REWARD', 'RIDER', 'RIDGE', 'RIGHT', 'RIGID', 'RING', 'RISE', 'RISK', 'RIVER', 'ROAD', 'ROBOT', 'ROGER', 'ROMAN', 'ROUGH', 'ROUND', 'ROUTE', 'ROYAL', 'RURAL', 'SCALE', 'SCENE', 'SCOPE', 'SCORE', 'SENSE', 'SERVE', 'SEVEN', 'SHALL', 'SHAPE', 'SHARE', 'SHARP', 'SHEET', 'SHELF', 'SHELL', 'SHIFT', 'SHINE', 'SHIRT', 'SHOCK', 'SHOOT', 'SHORT', 'SHOWN', 'SIDES', 'SIGHT', 'SILVER', 'SIMILAR', 'SIMPLE', 'SIXTH', 'SIXTY', 'SIZED', 'SKILL', 'SLEEP', 'SLIDE', 'SMALL', 'SMART', 'SMILE', 'SMITH', 'SMOKE', 'SNAKE', 'SOLID', 'SOLVE', 'SORRY', 'SOUND', 'SOUTH', 'SPACE', 'SPARE', 'SPEAK', 'SPEED', 'SPEND', 'SPENT', 'SPLIT', 'SPOKE', 'STAGE', 'STAKE', 'STAND', 'START', 'STATE', 'STEAM', 'STEEL', 'STEEP', 'STICK', 'STILL', 'STOCK', 'STONE', 'STOOD', 'STORE', 'STORM', 'STORY', 'STRIP', 'STUCK', 'STUDY', 'STUFF', 'STYLE', 'SUGAR', 'SUITE', 'SUPER', 'SWEET', 'TABLE', 'TAKEN', 'TASTE', 'TAXES', 'TEACH', 'TEETH', 'TERRY', 'TEXAS', 'THANK', 'THEFT', 'THEIR', 'THEME', 'THERE', 'THESE', 'THICK', 'THING', 'THINK', 'THIRD', 'THOSE', 'THREE', 'THREW', 'THROW', 'THUMB', 'TIGER', 'TIGHT', 'TIRED', 'TITLE', 'TODAY', 'TOKEN', 'TOPIC', 'TOTAL', 'TOUCH', 'TOUGH', 'TOWER', 'TRACK', 'TRADE', 'TRAIN', 'TREAT', 'TREND', 'TRIAL', 'TRIBE', 'TRICK', 'TRIED', 'TRIES', 'TRUCK', 'TRULY', 'TRUNK', 'TRUST', 'TRUTH', 'TWICE', 'TWIST', 'TYLER', 'UNION', 'UNITY', 'UNTIL', 'UPPER', 'UPSET', 'URBAN', 'USAGE', 'USUAL', 'VALUE', 'VIDEO', 'VIRUS', 'VISIT', 'VITAL', 'VOCAL', 'VOICE', 'WASTE', 'WATCH', 'WATER', 'WAVE', 'WHEEL', 'WHERE', 'WHICH', 'WHILE', 'WHITE', 'WHOLE', 'WINNER', 'WINTER', 'WOMAN', 'WOMEN', 'WORLD', 'WORRY', 'WORSE', 'WORST', 'WORTH', 'WOULD', 'WRITE', 'WRONG', 'WROTE', 'YOUNG', 'YOURS', 'YOUTH'];

// Load command modules
const commandsPath = path.join(process.cwd(), 'src', 'commands');
console.log('Commands path:', commandsPath);
if (fs.existsSync(commandsPath)) {
  console.log('Commands directory exists, reading files...');
  const files = fs.readdirSync(commandsPath);
  console.log('Found files:', files);
  for (const file of files) {
        if (file.endsWith('.js') || file.endsWith('.mjs')) {
          console.log('Loading command file:', file);
          try {
            const { data, execute } = await import(path.join(commandsPath, file));
            console.log('Loaded command:', data.name);
            client.commands.set(data.name, { data, execute });
          } catch (error) {
            console.error(`Failed to load command ${file}:`, error.message);
          }
        }
      }
  console.log('Finished loading commands');
} else {
  console.log('Commands directory does not exist');
}

client.on('error', (error) => {
  logError('Client error occurred', error);
});
console.log('Error listener added');

client.once('ready', () => {
  console.log(`Bot ready as ${client.user.tag}`);
  logger.success(`Bot started successfully as ${client.user.tag}`, {
    guilds: client.guilds.cache.size,
    users: client.guilds.cache.reduce((total, guild) => total + guild.memberCount, 0)
  });
  // schedulerManager.setClient(client);
});
console.log('Ready listener added');

client.on('interactionCreate', async interaction => {
  console.log('Interaction received');
  try {
    // Check global command cooldown
    const globalCooldown = isOnCooldown(interaction.user.id, 'command_global');
    if (globalCooldown.onCooldown) {
      return interaction.reply({
        content: `⏰ **Cooldown Active!** Please wait ${getFormattedCooldown(globalCooldown.remaining)} before using another command.`,
        ephemeral: true
      });
    }

    // Set global cooldown
    setCooldown(interaction.user.id, 'command_global');

    // Check command-specific cooldown
    const commandCooldown = isOnCooldown(interaction.user.id, interaction.commandName);
    if (commandCooldown.onCooldown) {
      return interaction.reply({
        content: `⏰ **${interaction.commandName} is on cooldown!** Please wait ${getFormattedCooldown(commandCooldown.remaining)}.`,
        ephemeral: true
      });
    }

    // Log command execution
    logCommandExecution(interaction, true);
    // handle modal submit for confirmations
    if (interaction.isModalSubmit()) {
      const custom = interaction.customId || '';
      if (custom.startsWith('rpg_reset_confirm:')) {
        const parts = custom.split(':');
        // format rpg_reset_confirm:btn|cmd:userId
        const mode = parts[1] || 'btn';
        const targetUser = parts[2] || interaction.user.id;
        if (targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot confirm reset for another user.', ephemeral: true });
        const text = interaction.fields.getTextInputValue('confirm_text');
        if (text !== 'RESET') {
          return interaction.reply({ content: 'Confirmation text did not match. Type RESET to confirm.', ephemeral: true });
        }
        const { resetCharacter } = await import('./rpg.js');
        const def = resetCharacter(interaction.user.id, parts[3] || 'warrior');
        return interaction.reply({ content: `Character reset to defaults: HP ${def.hp}/${def.maxHp} MP ${def.mp}/${def.maxMp} ATK ${def.atk} DEF ${def.def} SPD ${def.spd} Level ${def.lvl}`, ephemeral: true });
      }
      // handle guild contribution modal submit
      if (custom.startsWith('guild_contribute_modal:')) {
        const parts = custom.split(':');
        const guildName = parts[1];
        const targetUser = parts[2];
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot contribute for another user.', ephemeral: true });

        const amountStr = interaction.fields.getTextInputValue('contribution_amount');
        const amount = parseInt(amountStr || '0', 10) || 0;

        if (amount <= 0) return interaction.reply({ content: '❌ Contribution amount must be greater than 0.', ephemeral: true });

        const { contributeToGuild } = await import('./guilds.js');
        const result = contributeToGuild(guildName, interaction.user.id, amount);

        if (!result.success) return interaction.reply({ content: `❌ ${result.reason}`, ephemeral: true });

        return interaction.reply({ content: `💰 Contributed ${amount} gold to **${guildName}**!\n⭐ Guild gained ${result.expGain} experience!`, ephemeral: true });
      }
      // handle economy transfer modal submit
      if (custom.startsWith('economy_transfer_modal:')) {
        const [, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot transfer for another user.', ephemeral: true });

        const transferUser = interaction.fields.getTextInputValue('transfer_user');
        const amountStr = interaction.fields.getTextInputValue('transfer_amount');
        const amount = parseInt(amountStr || '0', 10) || 0;

        if (amount <= 0) return interaction.reply({ content: '❌ Transfer amount must be greater than 0.', ephemeral: true });

        const { getBalance, transferBalance } = await import('./economy.js');
        const currentBalance = getBalance(interaction.user.id);

        if (currentBalance < amount) {
          return interaction.reply({ content: `❌ Insufficient funds! You have ${currentBalance} gold but need ${amount} gold.`, ephemeral: true });
        }

        // Find target user by mention or username
        const transferUserStr = transferUser.trim();
        let targetUserId = null;

        // Check if it's a mention <@123456>
        if (transferUserStr.startsWith('<@') && transferUserStr.endsWith('>')) {
          targetUserId = transferUserStr.slice(2, -1);
        } else {
          // Find by username (simplified, in real use guild.members.fetch or cache)
          const member = interaction.guild.members.cache.find(m => m.user.username.toLowerCase() === transferUserStr.toLowerCase() || m.displayName.toLowerCase() === transferUserStr.toLowerCase());
          if (member) targetUserId = member.user.id;
        }

        if (!targetUserId) {
          return interaction.reply({ content: '❌ User not found. Please mention the user or use their username.', ephemeral: true });
        }

        const result = transferBalance(interaction.user.id, targetUserId, amount);

        if (result.success) {
          return interaction.reply({ content: `💸 **Transfer Successful!** Transferred ${amount} gold to <@${targetUserId}>.`, ephemeral: true });
        } else {
          return interaction.reply({ content: `❌ Transfer failed: ${result.reason}`, ephemeral: true });
        }
      }
      // handle investment modal submit
      if (custom.startsWith('invest_modal:')) {
        const [, invType, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot invest for another user.', ephemeral: true });

        const amountStr = interaction.fields.getTextInputValue('invest_amount');
        const amount = parseInt(amountStr || '0', 10) || 0;

        if (amount <= 0) return interaction.reply({ content: '❌ Investment amount must be greater than 0.', ephemeral: true });

        const { getBalance, createInvestment, getInvestmentTypes } = await import('./economy.js');
        const currentBalance = getBalance(interaction.user.id);

        if (currentBalance < amount) {
          return interaction.reply({ content: `❌ Insufficient funds! You have ${currentBalance} gold but need ${amount} gold.`, ephemeral: true });
        }

        const investmentTypes = getInvestmentTypes();
        const typeData = investmentTypes[invType];

        if (!typeData || amount < typeData.minAmount) {
          return interaction.reply({ content: `❌ Minimum amount for ${typeData.name} is ${typeData.minAmount} gold.`, ephemeral: true });
        }

        const result = createInvestment(interaction.user.id, typeData, amount);

        if (result.success) {
          return interaction.reply({ content: `📈 **Investment Created!**\nType: ${typeData.name}\nAmount: ${amount} gold\nRate: ${typeData.rate * 100}%\nDuration: ${typeData.duration} days`, ephemeral: true });
        } else {
          return interaction.reply({ content: `❌ Investment failed: ${result.reason}`, ephemeral: true });
        }
      }
      // handle profile edit modal submit
      if (custom.startsWith('profile_edit_modal:')) {
        const [, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot edit another user\'s profile.', ephemeral: true });

        const displayName = interaction.fields.getTextInputValue('display_name');
        const bio = interaction.fields.getTextInputValue('bio');
        const title = interaction.fields.getTextInputValue('title');

        const { updateProfile } = await import('./profiles.js');
        const updates = {};

        if (displayName) updates.displayName = displayName;
        if (bio) updates.bio = bio;
        if (title) updates.title = title;

        const result = updateProfile(interaction.user.id, updates);

        await interaction.reply({ content: '✨ **Profile updated successfully!** Use `/profile view` to see your changes.', ephemeral: true });
        return;
      }
      // handle trade auction modal submit
      if (custom.startsWith('trade_auction_modal:')) {
        const [, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot create auctions for another user.', ephemeral: true });

        const item = interaction.fields.getTextInputValue('auction_item');
        const priceStr = interaction.fields.getTextInputValue('auction_price');
        const price = parseInt(priceStr || '0', 10) || 0;

        if (!item) return interaction.reply({ content: '❌ Please specify an item to auction.', ephemeral: true });
        if (price <= 0) return interaction.reply({ content: '❌ Please specify a valid starting price.', ephemeral: true });

        const { createAuction } = await import('./trading.js');
        const result = createAuction(item, price, 24, interaction.user.id);

        if (result.success) {
          await interaction.reply({ content: `🎯 **Auction created!**\n**Item:** ${item}\n**Starting Price:** ${price} gold\n**Buyout:** ${price * 3} gold\n**Duration:** 24 hours`, ephemeral: true });
        } else {
          await interaction.reply({ content: `❌ Failed to create auction: ${result.reason}`, ephemeral: true });
        }
        return;
      }
      // handle admin warning modal submit
      if (custom.startsWith('admin_warn_modal:')) {
        const [, targetUser, guildId] = custom.split(':');
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ You need Administrator permissions.', ephemeral: true });
        }

        const reason = interaction.fields.getTextInputValue('warn_reason');

        const { warnUser } = await import('./moderation.js');
        const warning = warnUser(guildId, targetUser, interaction.user.id, reason, 'medium');

        await interaction.reply({ content: `⚠️ **Warning issued to <@${targetUser}>**\n📋 Reason: ${reason}`, ephemeral: true });
        return;
      }
      // handle admin mute modal submit
      if (custom.startsWith('admin_mute_modal:')) {
        const [, targetUser, guildId] = custom.split(':');
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ You need Administrator permissions.', ephemeral: true });
        }

        const reason = interaction.fields.getTextInputValue('mute_reason');
        const durationStr = interaction.fields.getTextInputValue('mute_duration') || '60';
        const duration = parseInt(durationStr) * 60 * 1000; // Convert minutes to milliseconds

        const { muteUser } = await import('./moderation.js');
        const mute = muteUser(guildId, targetUser, interaction.user.id, reason, duration);

        await interaction.reply({ content: `🔇 **User <@${targetUser}> muted for ${durationStr} minutes**\n📋 Reason: ${reason}`, ephemeral: true });
        return;
      }
      // handle guess game modal submit
      if (custom.startsWith('guess_submit:')) {
        const [, gameId, min, max] = custom.split(':');
        const guess = parseInt(interaction.fields.getTextInputValue('guess_number'));

        if (isNaN(guess)) {
          return interaction.reply({ content: '❌ Please enter a valid number!', ephemeral: true });
        }

        const userId = interaction.user.id;
        let gameState = guessGames.get(userId);

        if (!gameState) {
          // Start a new game
          const rangeMin = parseInt(min) || 1;
          const rangeMax = parseInt(max) || 100;
          const number = Math.floor(Math.random() * (rangeMax - rangeMin + 1)) + rangeMin;
          gameState = {
            number,
            min: rangeMin,
            max: rangeMax,
            attempts: 0,
            maxAttempts: 10,
            gameActive: true
          };
          guessGames.set(userId, gameState);
        }

        if (!gameState.gameActive) {
          return interaction.reply({ content: 'No active guess game. Start a new one!', ephemeral: true });
        }

        gameState.attempts++;

        let message = `🔢 Guess ${gameState.attempts}/${gameState.maxAttempts}: ${guess}\n`;

        if (guess < gameState.number) {
          message += '📈 Too low!';
        } else if (guess > gameState.number) {
          message += '📉 Too high!';
        } else {
          message += `🎉 **Correct! You guessed it in ${gameState.attempts} attempts!**`;
          gameState.gameActive = false;
        }

        if (gameState.attempts >= gameState.maxAttempts && guess !== gameState.number) {
          message += `\n💀 **Game Over!** The number was **${gameState.number}**.`;
          gameState.gameActive = false;
        }

        await interaction.reply({ content: message, ephemeral: true });
        return;
      }
      if (custom.startsWith('fun_joke:')) {
        const [, category, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot get jokes for another user.', ephemeral: true });

        const { getRandomJoke } = await import('./entertainment.js');
        const joke = getRandomJoke(category);

        await interaction.reply({ content: `😂 **${category.charAt(0).toUpperCase() + category.slice(1)} Joke:**\n${joke.joke}`, ephemeral: true });
        return;
      }
      if (custom.startsWith('fun_story:')) {
        const [, genre, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot generate stories for another user.', ephemeral: true });

        const { generateStory } = await import('./entertainment.js');
        const story = generateStory('A creative adventure', genre);

        await interaction.reply({ content: `📖 **${genre.charAt(0).toUpperCase() + genre.slice(1)} Story:**\n${story.story}`, ephemeral: true });
        return;
      }
      if (custom.startsWith('fun_riddle:')) {
        const [, difficulty, riddleId, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot get riddle answers for another user.', ephemeral: true });

        // Show riddle answer - get the riddle from the stored state or regenerate
        const { getRiddle } = await import('./entertainment.js');
        const riddle = getRiddle(difficulty);

        const embed = new EmbedBuilder()
          .setTitle(`💡 Riddle Answer - ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}`)
          .setColor(0xFF8C00)
          .addFields(
            { name: '🧩 Riddle', value: riddle.riddle, inline: false },
            { name: '✅ Answer', value: `**${riddle.answer}**`, inline: false }
          )
          .setFooter({ text: 'Think you can solve it? Use /fun riddle to get another one!' });

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }
      if (custom.startsWith('fun_riddle_new:')) {
        const [, difficulty, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot get riddles for another user.', ephemeral: true });

        const { getRiddle } = await import('./entertainment.js');
        const riddle = getRiddle(difficulty);

        await interaction.reply({ content: `🧩 **${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} Riddle:**\n${riddle.riddle}`, ephemeral: true });
        return;
      }
      if (custom.startsWith('fun_fact:')) {
        const [, category, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot get facts for another user.', ephemeral: true });

        const { getFunFact } = await import('./entertainment.js');
        const fact = getFunFact(category);

        await interaction.reply({ content: `🧠 **${category === 'random' ? 'Random' : category.charAt(0).toUpperCase() + category.slice(1)} Fun Fact:**\n${fact.fact}`, ephemeral: true });
        return;
      }
      if (custom.startsWith('fun_quote:')) {
        const [, category, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot get quotes for another user.', ephemeral: true });

        const { getRandomQuote } = await import('./entertainment.js');
        const quote = getRandomQuote(category);

        await interaction.reply({ content: `💬 **${category.charAt(0).toUpperCase() + category.slice(1)} Quote:**\n"${quote.quote}" - ${quote.author}`, ephemeral: true });
        return;
      }
      if (custom.startsWith('fun_8ball:')) {
        const [, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot ask 8-ball for another user.', ephemeral: true });

        const { magic8Ball } = await import('./entertainment.js');
        const result = magic8Ball('The magic 8-ball speaks...');

        await interaction.reply({ content: `🔮 **Magic 8-Ball says:** ${result.answer}`, ephemeral: true });
        return;
      }
      if (custom.startsWith('fun_name:')) {
        const [, type, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot generate names for another user.', ephemeral: true });

        const { generateFunName } = await import('./entertainment.js');
        const name = generateFunName(type);

        await interaction.reply({ content: `🎭 **${type.charAt(0).toUpperCase() + type.slice(1)} Name:** ${name.name}`, ephemeral: true });
        return;
      }
      if (custom.startsWith('fun_name_random:')) {
        const [, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot generate names for another user.', ephemeral: true });

        const types = ['superhero', 'villain', 'fantasy', 'sciFi'];
        const randomType = types[Math.floor(Math.random() * types.length)];

        const { generateFunName } = await import('./entertainment.js');
        const name = generateFunName(randomType);

        await interaction.reply({ content: `🎭 **${randomType.charAt(0).toUpperCase() + randomType.slice(1)} Name:** ${name.name}`, ephemeral: true });
        return;
      }
      if (custom.startsWith('fun_challenge:')) {
        const [, type, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot get challenges for another user.', ephemeral: true });

        const { createFunChallenge } = await import('./entertainment.js');
        const challenge = createFunChallenge(type);

        await interaction.reply({ content: `🎯 **${type.charAt(0).toUpperCase() + type.slice(1)} Challenge:**\n${challenge.challenge}\n💎 **Reward:** ${challenge.reward}`, ephemeral: true });
        return;
      }
      if (custom.startsWith('fun_challenge_new:')) {
        const [, type, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot get challenges for another user.', ephemeral: true });

        const { createFunChallenge } = await import('./entertainment.js');
        const challenge = createFunChallenge(type);

        await interaction.reply({ content: `🎯 **${type.charAt(0).toUpperCase() + type.slice(1)} Challenge:**\n${challenge.challenge}\n💎 **Reward:** ${challenge.reward}`, ephemeral: true });
        return;
      }
      if (custom.startsWith('fun_share:')) {
        const [, contentId, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot share content for another user.', ephemeral: true });

        // Get the content type and details from the contentId
        // contentId format: type_id (e.g., "story_123", "fact_456", "quote_789")
        const [contentType, itemId] = contentId.split('_');

        let shareContent = '';
        let embed = null;

        if (contentType === 'story') {
          const { generateStory } = await import('./entertainment.js');
          const story = generateStory('An amazing tale', 'fantasy');
          shareContent = `📖 **Story Shared by <@${interaction.user.id}>**\n\n${story.story}`;
        } else if (contentType === 'fact') {
          const { getFunFact } = await import('./entertainment.js');
          const fact = getFunFact('random');
          shareContent = `🧠 **Fun Fact Shared by <@${interaction.user.id}>**\n\n${fact.fact}\n\n*Category: ${fact.category}*`;
        } else if (contentType === 'quote') {
          const { getRandomQuote } = await import('./entertainment.js');
          const quote = getRandomQuote('inspirational');
          shareContent = `💬 **Quote Shared by <@${interaction.user.id}>**\n\n"${quote.quote}"\n\n- ${quote.author}`;
        } else {
          shareContent = `📤 **Content Shared by <@${interaction.user.id}>**\n\n*Amazing content that was shared with everyone!*`;
        }

        // Try to share to the channel where the interaction occurred
        try {
          if (interaction.channel && interaction.channel.type === 0) { // Text channel
            await interaction.channel.send({ content: shareContent });
            await interaction.reply({ content: `✅ **Content shared successfully!** Everyone in this channel can now see it.`, ephemeral: true });
          } else {
            await interaction.reply({ content: shareContent });
            await interaction.followUp({ content: `📤 **Content shared!**`, ephemeral: true });
          }
        } catch (error) {
          console.error('Failed to share content:', error);
          await interaction.reply({ content: `❌ **Failed to share content.** Please check my permissions in this channel.`, ephemeral: true });
        }
        return;
      }
      if (custom.startsWith('fun_rate:')) {
        const [, contentId, rating, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot rate content for another user.', ephemeral: true });

        await interaction.reply({ content: `⭐ **Content Rated!**\nThank you for rating! This helps improve our recommendations.`, ephemeral: true });
        return;
      }
      // handle economy buy modal submit
      if (custom.startsWith('economy_buy_modal:')) {
        const [, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot buy items for another user.', ephemeral: true });

        const item = interaction.fields.getTextInputValue('buy_item');
        const quantityStr = interaction.fields.getTextInputValue('buy_quantity');
        const quantity = parseInt(quantityStr || '1', 10) || 1;

        if (!item) return interaction.reply({ content: '❌ Please specify an item to buy.', ephemeral: true });
        if (quantity <= 0) return interaction.reply({ content: '❌ Please specify a valid quantity.', ephemeral: true });

        const { getMarketPrice, buyFromMarket } = await import('./economy.js');
        const price = getMarketPrice(item);
        const totalCost = price * quantity;

        if (price === 0) {
          return interaction.reply({ content: `❌ "${item}" is not available in the market.`, ephemeral: true });
        }

        const result = buyFromMarket(interaction.user.id, item, quantity);

        if (result.success) {
          await interaction.reply({ content: `🛒 **Purchase Complete!**\nBought ${quantity}x ${item} for ${totalCost} gold!`, ephemeral: true });
        } else {
          await interaction.reply({ content: `❌ Purchase failed: ${result.reason}`, ephemeral: true });
        }
        return;
      }
      // handle economy sell modal submit
      if (custom.startsWith('economy_sell_modal:')) {
        const [, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot sell items for another user.', ephemeral: true });

        const item = interaction.fields.getTextInputValue('sell_item');
        const quantityStr = interaction.fields.getTextInputValue('sell_quantity');
        const quantity = parseInt(quantityStr || '1', 10) || 1;

        if (!item) return interaction.reply({ content: '❌ Please specify an item to sell.', ephemeral: true });
        if (quantity <= 0) return interaction.reply({ content: '❌ Please specify a valid quantity.', ephemeral: true });

        const { getMarketPrice, sellToMarket } = await import('./economy.js');
        const sellPrice = Math.floor(getMarketPrice(item) * 0.8);
        const totalEarnings = sellPrice * quantity;

        if (sellPrice === 0) {
          return interaction.reply({ content: `❌ "${item}" is not available in the market.`, ephemeral: true });
        }

        const result = sellToMarket(interaction.user.id, item, quantity);

        if (result.success) {
          await interaction.reply({ content: `💸 **Sale Complete!**\nSold ${quantity}x ${item} for ${totalEarnings} gold!`, ephemeral: true });
        } else {
          await interaction.reply({ content: `❌ Sale failed: ${result.reason}`, ephemeral: true });
        }
        return;
      }
      if (custom.startsWith('economy_transfer:')) {
        const [, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot initiate transfers for another user.', ephemeral: true });

        // Show transfer modal
        const modal = new ModalBuilder().setCustomId(`economy_transfer_modal:${interaction.user.id}`).setTitle('Transfer Gold');
        const userInput = new TextInputBuilder().setCustomId('transfer_user').setLabel('User to transfer to').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('username');
        const amountInput = new TextInputBuilder().setCustomId('transfer_amount').setLabel('Amount to transfer').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('100');
        modal.addComponents({ type: 1, components: [userInput] });
        modal.addComponents({ type: 1, components: [amountInput] });
        await interaction.showModal(modal);
        return;
      }
      if (custom.startsWith('economy_market:')) {
        const [, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot access market for another user.', ephemeral: true });

        const { getMarketPrice } = await import('./economy.js');
        const embed = new EmbedBuilder()
          .setTitle('🏛️ Marketplace')
          .setColor(0xFFD700);

        const items = ['health_potion', 'mana_potion', 'iron_ore', 'magic_crystal', 'dragon_scale'];
        items.forEach(itemId => {
          const price = getMarketPrice(itemId);
          embed.addFields({
            name: itemId.replace('_', ' ').toUpperCase(),
            value: `💰 ${price} gold each`,
            inline: true
          });
        });

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }
      if (custom.startsWith('economy_business:')) {
        const [, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot manage businesses for another user.', ephemeral: true });

        const { collectBusinessIncome } = await import('./economy.js');
        const result = collectBusinessIncome(interaction.user.id);

        if (result.success) {
          if (result.income > 0) {
            await interaction.reply({ content: `💰 **Business Income Collected!**\nYou earned ${result.income} gold from your ${result.businesses} business(es)!`, ephemeral: true });
          } else {
            await interaction.reply({ content: '💤 **No income available yet.** Check back later!', ephemeral: true });
          }
        } else {
          await interaction.reply({ content: `❌ ${result.reason}`, ephemeral: true });
        }
        return;
      }
      if (custom.startsWith('economy_buy:')) {
        const [, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot buy items for another user.', ephemeral: true });

        // Show buy modal
        const modal = new ModalBuilder().setCustomId(`economy_buy_modal:${interaction.user.id}`).setTitle('Buy from Market');
        const itemInput = new TextInputBuilder().setCustomId('buy_item').setLabel('Item to buy').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('health_potion');
        const quantityInput = new TextInputBuilder().setCustomId('buy_quantity').setLabel('Quantity').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('1');
        modal.addComponents({ type: 1, components: [itemInput] });
        modal.addComponents({ type: 1, components: [quantityInput] });
        await interaction.showModal(modal);
        return;
      }
      if (custom.startsWith('economy_sell:')) {
        const [, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot sell items for another user.', ephemeral: true });

        // Show sell modal
        const modal = new ModalBuilder().setCustomId(`economy_sell_modal:${interaction.user.id}`).setTitle('Sell to Market');
        const itemInput = new TextInputBuilder().setCustomId('sell_item').setLabel('Item to sell').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('health_potion');
        const quantityInput = new TextInputBuilder().setCustomId('sell_quantity').setLabel('Quantity').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('1');
        modal.addComponents({ type: 1, components: [itemInput] });
        modal.addComponents({ type: 1, components: [quantityInput] });
        await interaction.showModal(modal);
        return;
      }
      if (custom.startsWith('economy_invest:')) {
        const [, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot manage investments for another user.', ephemeral: true });

        // Show investment options
        const { getBalance, createInvestment } = await import('./economy.js');
        const balance = getBalance(interaction.user.id);

        if (balance < 100) {
          return interaction.reply({ content: '❌ You need at least 100 gold to invest.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setTitle('📈 Investment Opportunities')
          .setColor(0x0099FF)
          .setDescription('Choose an investment to grow your wealth!')
          .addFields(
            { name: '🏦 Bank Deposit (Safe)', value: 'Rate: 5%/month\nMin: 100 gold\nDuration: 30 days', inline: true },
            { name: '🏭 Stock Market (Medium)', value: 'Rate: 10%/month\nMin: 500 gold\nDuration: 30 days', inline: true },
            { name: '🎲 High Risk Venture (High)', value: 'Rate: 20%/month\nMin: 1000 gold\nDuration: 30 days', inline: true },
            { name: '🏠 Real Estate (Medium)', value: 'Rate: 15%/month\nMin: 2000 gold\nDuration: 45 days', inline: true },
            { name: '💰 Cryptocurrency (High)', value: 'Rate: 25%/month\nMin: 300 gold\nDuration: 15 days', inline: true },
            { name: '📄 Government Bond (Safe)', value: 'Rate: 3%/month\nMin: 500 gold\nDuration: 60 days', inline: true }
          );

        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`invest_bank:${interaction.user.id}`).setLabel('🏦 Bank').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`invest_stock:${interaction.user.id}`).setLabel('🏭 Stocks').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`invest_venture:${interaction.user.id}`).setLabel('🎲 Venture').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`invest_real_estate:${interaction.user.id}`).setLabel('🏠 Real Estate').setStyle(ButtonStyle.Success)
        );

        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`invest_crypto:${interaction.user.id}`).setLabel('💰 Crypto').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`invest_bond:${interaction.user.id}`).setLabel('📄 Bonds').setStyle(ButtonStyle.Primary)
        );

        await interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
        return;
      }
      if (custom.startsWith('invest_bank:')) {
        const [, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot invest for another user.', ephemeral: true });

        // Show modal for amount
        const modal = new ModalBuilder().setCustomId(`invest_modal:bank:${interaction.user.id}`).setTitle('Bank Deposit');
        const amountInput = new TextInputBuilder().setCustomId('invest_amount').setLabel('Amount to deposit (min 100)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('100');
        modal.addComponents({ type: 1, components: [amountInput] });
        await interaction.showModal(modal);
        return;
      }
      if (custom.startsWith('invest_stock:')) {
        const [, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot invest for another user.', ephemeral: true });

        const modal = new ModalBuilder().setCustomId(`invest_modal:stock:${interaction.user.id}`).setTitle('Stock Investment');
        const amountInput = new TextInputBuilder().setCustomId('invest_amount').setLabel('Amount to invest (min 500)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('500');
        modal.addComponents({ type: 1, components: [amountInput] });
        await interaction.showModal(modal);
        return;
      }
      if (custom.startsWith('invest_venture:')) {
        const [, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot invest for another user.', ephemeral: true });

        const modal = new ModalBuilder().setCustomId(`invest_modal:venture:${interaction.user.id}`).setTitle('High Risk Venture');
        const amountInput = new TextInputBuilder().setCustomId('invest_amount').setLabel('Amount to invest (min 1000)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('1000');
        modal.addComponents({ type: 1, components: [amountInput] });
        await interaction.showModal(modal);
        return;
      }
      if (custom.startsWith('invest_real_estate:')) {
        const [, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot invest for another user.', ephemeral: true });

        const modal = new ModalBuilder().setCustomId(`invest_modal:real_estate:${interaction.user.id}`).setTitle('Real Estate Investment');
        const amountInput = new TextInputBuilder().setCustomId('invest_amount').setLabel('Amount to invest (min 2000)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('2000');
        modal.addComponents({ type: 1, components: [amountInput] });
        await interaction.showModal(modal);
        return;
      }
      if (custom.startsWith('invest_crypto:')) {
        const [, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot invest for another user.', ephemeral: true });

        const modal = new ModalBuilder().setCustomId(`invest_modal:crypto:${interaction.user.id}`).setTitle('Cryptocurrency Investment');
        const amountInput = new TextInputBuilder().setCustomId('invest_amount').setLabel('Amount to invest (min 300)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('300');
        modal.addComponents({ type: 1, components: [amountInput] });
        await interaction.showModal(modal);
        return;
      }
      if (custom.startsWith('invest_bond:')) {
        const [, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot invest for another user.', ephemeral: true });

        const modal = new ModalBuilder().setCustomId(`invest_modal:bond:${interaction.user.id}`).setTitle('Government Bond');
        const amountInput = new TextInputBuilder().setCustomId('invest_amount').setLabel('Amount to invest (min 500)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('500');
        modal.addComponents({ type: 1, components: [amountInput] });
        await interaction.showModal(modal);
        return;
      }
      if (custom.startsWith('admin_warn:')) {
        const [, targetUser, guildId] = custom.split(':');
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ You need Administrator permissions.', ephemeral: true });
        }

        // Show warning modal
        const modal = new ModalBuilder().setCustomId(`admin_warn_modal:${targetUser}:${guildId}`).setTitle('Issue Warning');
        const reasonInput = new TextInputBuilder().setCustomId('warn_reason').setLabel('Warning Reason').setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder('Please explain the warning...');
        modal.addComponents({ type: 1, components: [reasonInput] });
        await interaction.showModal(modal);
        return;
      }
      if (custom.startsWith('admin_mute:')) {
        const [, targetUser, guildId] = custom.split(':');
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ You need Administrator permissions.', ephemeral: true });
        }

        // Show mute modal
        const modal = new ModalBuilder().setCustomId(`admin_mute_modal:${targetUser}:${guildId}`).setTitle('Mute User');
        const reasonInput = new TextInputBuilder().setCustomId('mute_reason').setLabel('Mute Reason').setStyle(TextInputStyle.Paragraph).setRequired(true);
        const durationInput = new TextInputBuilder().setCustomId('mute_duration').setLabel('Duration (minutes)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('60');
        modal.addComponents({ type: 1, components: [reasonInput] });
        modal.addComponents({ type: 1, components: [durationInput] });
        await interaction.showModal(modal);
        return;
      }
      if (custom.startsWith('admin_unmute:')) {
        const [, targetUser, guildId] = custom.split(':');
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ You need Administrator permissions.', ephemeral: true });
        }

        const { unmuteUser } = await import('./moderation.js');
        const result = unmuteUser(guildId, targetUser, interaction.user.id, 'Unmuted via button');

        if (result) {
          await interaction.reply({ content: '✅ **User unmuted successfully!**', ephemeral: true });
        } else {
          await interaction.reply({ content: '❌ User is not currently muted.', ephemeral: true });
        }
        return;
      }
      if (custom.startsWith('admin_unban:')) {
        const [, targetUser, guildId] = custom.split(':');
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ You need Administrator permissions.', ephemeral: true });
        }

        const { unbanUser } = await import('./moderation.js');
        const result = unbanUser(guildId, targetUser, interaction.user.id, 'Unbanned via button');

        if (result) {
          await interaction.reply({ content: '✅ **User unbanned successfully!**', ephemeral: true });
        } else {
          await interaction.reply({ content: '❌ User is not currently banned.', ephemeral: true });
        }
        return;
      }
      // handle wordle guess modal submit
      if (custom.startsWith('wordle_submit:')) {
        const [, gameId] = custom.split(':');
        const wordGuess = interaction.fields.getTextInputValue('word_guess').toUpperCase();

        if (!/^[A-Z]{5}$/.test(wordGuess)) {
          return interaction.reply({ content: '❌ Please enter a valid 5-letter word!', ephemeral: true });
        }

        const userId = interaction.user.id;
        let gameState = wordleGames.get(userId);

        if (!gameState) {
          // Start a new game
          const word = wordleWords[Math.floor(Math.random() * wordleWords.length)];
          gameState = {
            word,
            guesses: [],
            maxGuesses: 6,
            gameActive: true
          };
          wordleGames.set(userId, gameState);
        }

        if (!gameState.gameActive) {
          return interaction.reply({ content: 'No active Wordle game. Start a new one!', ephemeral: true });
        }

        // Check if word is in list (optional)
        if (!wordleWords.includes(wordGuess)) {
          return interaction.reply({ content: `❌ "${wordGuess}" is not a valid word!`, ephemeral: true });
        }

        // Process guess
        gameState.guesses.push(wordGuess);
        let result = '';
        let correct = 0;
        const wordArray = gameState.word.split('');
        const guessArray = wordGuess.split('');

        for (let i = 0; i < 5; i++) {
          if (guessArray[i] === wordArray[i]) {
            result += '🟢'; // Correct position
            correct++;
          } else if (wordArray.includes(guessArray[i])) {
            result += '🟡'; // Wrong position
          } else {
            result += '⚫'; // Not in word
          }
        }

        let message = `🔤 Guess ${gameState.guesses.length}/6: ${wordGuess}\n${result}`;

        if (correct === 5) {
          message += `\n🎉 **Congratulations! You guessed the word in ${gameState.guesses.length} guesses!**`;
          gameState.gameActive = false;
        } else if (gameState.guesses.length >= gameState.maxGuesses) {
          message += `\n💀 **Game Over!** The word was **${gameState.word}**.`;
          gameState.gameActive = false;
        }

        await interaction.reply({ content: message, ephemeral: true });
        return;
      }
      if (custom.startsWith('wordle_guess:')) {
        const [, gameId] = custom.split(':');
        // Show wordle guess modal
        await sendWordleGuessModal(interaction, gameId);
        return;
      }
      // handle spend modal submit
      if (custom.startsWith('rpg_spend_submit:')) {
        const parts = custom.split(':');
        const targetUser = parts[1] || interaction.user.id;
        if (targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot spend for another user.', ephemeral: true });
        const stat = interaction.fields.getTextInputValue('stat_choice');
        const amountStr = interaction.fields.getTextInputValue('amount_choice');
        const amount = parseInt(amountStr || '0', 10) || 0;
        const { spendSkillPoints, getCharacter } = await import('./rpg.js');
        const res = spendSkillPoints(interaction.user.id, stat, amount);
        if (!res.success) return interaction.reply({ content: `Spend failed: ${res.reason}`, ephemeral: true });
        const char = res.char;
        // try to update the original message if possible
        try {
          if (interaction.message && interaction.message.editable) {
            const remaining = char.skillPoints || 0;
            const spendRow1 = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`rpg_spend:hp:1:${interaction.user.id}`).setLabel('❤️ HP').setStyle(ButtonStyle.Primary).setDisabled(remaining <= 0),
              new ButtonBuilder().setCustomId(`rpg_spend:mp:1:${interaction.user.id}`).setLabel('🔮 MP').setStyle(ButtonStyle.Primary).setDisabled(remaining <= 0),
              new ButtonBuilder().setCustomId(`rpg_spend:maxhp:1:${interaction.user.id}`).setLabel('🛡️ Max HP').setStyle(ButtonStyle.Success).setDisabled(remaining <= 0),
              new ButtonBuilder().setCustomId(`rpg_spend:maxmp:1:${interaction.user.id}`).setLabel('🔮 Max MP').setStyle(ButtonStyle.Success).setDisabled(remaining <= 0),
              new ButtonBuilder().setCustomId(`rpg_spend:atk:1:${interaction.user.id}`).setLabel('⚔️ ATK').setStyle(ButtonStyle.Secondary).setDisabled(remaining <= 0),
            );
            const spendRow2 = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`rpg_spend:def:1:${interaction.user.id}`).setLabel('🛡️ DEF').setStyle(ButtonStyle.Secondary).setDisabled(remaining <= 0),
              new ButtonBuilder().setCustomId(`rpg_spend:spd:1:${interaction.user.id}`).setLabel('💨 SPD').setStyle(ButtonStyle.Secondary).setDisabled(remaining <= 0),
              new ButtonBuilder().setCustomId(`rpg_spend_modal:0:${interaction.user.id}`).setLabel('💎 Spend...').setStyle(ButtonStyle.Primary).setDisabled(remaining <= 0),
            );
            const content = `Name: ${char.name}\nLevel: ${char.lvl} XP: ${char.xp} Skill Points: ${remaining}\nHP: ${char.hp}/${char.maxHp} MP: ${char.mp}/${char.maxMp}\nATK: ${char.atk} DEF: ${char.def} SPD: ${char.spd}`;
            await interaction.update({ content, components: [spendRow1, spendRow2] });
            return;
          }
        } catch (err) {
          console.error('Failed to update message after modal spend', err);
        }
        return interaction.reply({ content: `Spent ${amount} on ${stat}. New points: ${char.skillPoints}`, ephemeral: true });
      }
    }
    if (interaction.isButton()) {
      // button customId format examples:
      // rpg_spend:stat:amount:userId
      // rpg_reset:0:userId
      // rpg_leaderboard:0:userId
      const [action, arg2, arg3] = interaction.customId ? interaction.customId.split(':') : [];
      const userId = interaction.user.id;
      if (action === 'rpg_spend') {
        const [ , stat, amountStr, targetUser ] = interaction.customId.split(':');
        const { spendSkillPoints } = await import('./rpg.js');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot press buttons for another user.', ephemeral: true });
        const amount = parseInt(amountStr || '1', 10) || 1;
        const res = spendSkillPoints(userId, stat, amount);
        if (!res.success) return interaction.reply({ content: `Failed: ${res.reason}` , ephemeral: true});
        const char = res.char;
        // If the message with buttons is available, update it to reflect new stats and button state
        try {
          if (interaction.message && interaction.message.editable) {
            const remaining = char.skillPoints || 0;
            // build spend buttons (disable when no points)
            const spendRow1 = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`rpg_spend:hp:1:${userId}`).setLabel('❤️ HP').setStyle(ButtonStyle.Primary).setDisabled(remaining <= 0),
              new ButtonBuilder().setCustomId(`rpg_spend:mp:1:${userId}`).setLabel('🔮 MP').setStyle(ButtonStyle.Primary).setDisabled(remaining <= 0),
              new ButtonBuilder().setCustomId(`rpg_spend:maxhp:1:${userId}`).setLabel('🛡️ Max HP').setStyle(ButtonStyle.Success).setDisabled(remaining <= 0),
              new ButtonBuilder().setCustomId(`rpg_spend:maxmp:1:${userId}`).setLabel('🔮 Max MP').setStyle(ButtonStyle.Success).setDisabled(remaining <= 0),
              new ButtonBuilder().setCustomId(`rpg_spend:atk:1:${userId}`).setLabel('⚔️ ATK').setStyle(ButtonStyle.Secondary).setDisabled(remaining <= 0),
            );
            const spendRow2 = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`rpg_spend:def:1:${userId}`).setLabel('🛡️ DEF').setStyle(ButtonStyle.Secondary).setDisabled(remaining <= 0),
              new ButtonBuilder().setCustomId(`rpg_spend:spd:1:${userId}`).setLabel('💨 SPD').setStyle(ButtonStyle.Secondary).setDisabled(remaining <= 0),
              new ButtonBuilder().setCustomId(`rpg_spend_modal:0:${userId}`).setLabel('💎 Spend...').setStyle(ButtonStyle.Primary).setDisabled(remaining <= 0),
            );
            const content = `Name: ${char.name}\nLevel: ${char.lvl} XP: ${char.xp} Skill Points: ${remaining}\nHP: ${char.hp}/${char.maxHp} MP: ${char.mp}/${char.maxMp}\nATK: ${char.atk} DEF: ${char.def} SPD: ${char.spd}`;
            await interaction.update({ content, components: [spendRow1, spendRow2] });
            return;
          }
        } catch (err) {
          // fall back to ephemeral reply on any failure
          console.error('Failed to update original message after spend', err);
        }

        return interaction.reply({ content: `Spent ${amount} point(s) on ${stat}. New stats: HP ${char.hp}/${char.maxHp} MP ${char.mp}/${char.maxMp} ATK ${char.atk} DEF ${char.def} SPD ${char.spd}. Remaining points: ${char.skillPoints}`, ephemeral: true });
      }
      if (action === 'rpg_spend_modal') {
        const [, , targetUser] = interaction.customId.split(':');
        const userNow = interaction.user.id;
        if (targetUser && targetUser !== userNow) return interaction.reply({ content: 'You cannot open a spend modal for another user.', ephemeral: true });
        // enforce short cooldown (2s) to reduce spam
        const last = spendCooldowns.get(userNow) || 0;
        const now = Date.now();
        if (now - last < 2000) return interaction.reply({ content: 'Please wait a moment before opening another spend modal.', ephemeral: true });
        spendCooldowns.set(userNow, now);
        // show a modal allowing stat and amount selection
        const modal = new ModalBuilder().setCustomId(`rpg_spend_submit:${userNow}`).setTitle('Spend Skill Points');
        const statInput = new TextInputBuilder().setCustomId('stat_choice').setLabel('Stat (hp|mp|maxhp|maxmp|atk|def|spd)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('atk');
        const amountInput = new TextInputBuilder().setCustomId('amount_choice').setLabel('Amount').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('1');
        modal.addComponents({ type: 1, components: [statInput] });
        modal.addComponents({ type: 1, components: [amountInput] });
        await interaction.showModal(modal);
        return;
      }
      if (action === 'rpg_reset') {
        const [ , , targetUser ] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot reset another user.', ephemeral: true });
        const { resetCharacter } = await import('./rpg.js');
        const def = resetCharacter(userId, targetUser || 'warrior');
        return interaction.reply({ content: `Character reset to defaults: HP ${def.hp}/${def.maxHp} MP ${def.mp}/${def.maxMp} ATK ${def.atk} DEF ${def.def} SPD ${def.spd} Level ${def.lvl}`, ephemeral: true });
      }
      if (action === 'rpg_reset_modal') {
        const [ , , targetUser ] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot reset another user.', ephemeral: true });
        // show confirmation modal
        const modal = new ModalBuilder().setCustomId(`rpg_reset_confirm:btn:${userId}`).setTitle('Confirm Reset');
        const input = new TextInputBuilder().setCustomId('confirm_text').setLabel('Type RESET to confirm').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('RESET');
        modal.addComponents({ type: 1, components: [input] });
        await interaction.showModal(modal);
        return;
      }
      if (action === 'rpg_leaderboard') {
        const [ , offsetStr, targetUser ] = interaction.customId.split(':');
        const userId = interaction.user.id;
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot view another user\'s leaderboard pagination.', ephemeral: true });
        const { getLeaderboard } = await import('./rpg.js');
        const offset = Math.max(0, parseInt(offsetStr || '0', 10) || 0);
        const limit = 10;
        const list = getLeaderboard(limit, offset);
        if (!list.length) return interaction.reply({ content: 'No players yet.', ephemeral: true });

        // check if there is more for next page
        const nextExists = getLeaderboard(1, offset + limit).length > 0;
        const row = new ActionRowBuilder();
        if (offset > 0) {
          row.addComponents(new ButtonBuilder().setCustomId(`rpg_leaderboard:${Math.max(0, offset - limit)}:${userId}`).setLabel('Prev').setStyle(ButtonStyle.Secondary));
        }
        if (nextExists) {
          row.addComponents(new ButtonBuilder().setCustomId(`rpg_leaderboard:${offset + limit}:${userId}`).setLabel('Next').setStyle(ButtonStyle.Primary));
        }

        return interaction.reply({ content: list.map((p, i) => `${offset + i + 1}. ${p.name} — Level ${p.lvl} XP ${p.xp} ATK ${p.atk}`).join('\n'), components: row.components.length ? [row] : [], ephemeral: true });
      }
      if (action === 'inventory_refresh') {
        const [, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot refresh another user\'s inventory.', ephemeral: true });

        const { getInventory, getItemInfo, getItemRarityInfo, getInventoryValue } = await import('./rpg.js');
        const inventory = getInventory(userId);
        const inventoryValue = getInventoryValue(userId);

        if (Object.keys(inventory).length === 0) {
          return interaction.reply({ content: '🛄 Your inventory is empty.', ephemeral: true });
        }

        // Group items by type
        const itemsByType = {};
        for (const [itemId, quantity] of Object.entries(inventory)) {
          const item = getItemInfo(itemId);
          if (item) {
            if (!itemsByType[item.type]) itemsByType[item.type] = [];
            itemsByType[item.type].push({ itemId, ...item, quantity });
          }
        }

        await updateInventoryEmbed(interaction, itemsByType, inventoryValue);
        return interaction.deferUpdate();
      }
      if (action === 'inventory_random') {
        const [, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot get items for another user.', ephemeral: true });

        const { addItemToInventory, generateRandomItem, getCharacter } = await import('./rpg.js');
        const char = getCharacter(userId);

        if (!char) return interaction.reply({ content: 'You need a character first. Use /rpg start', ephemeral: true });

        const randomItem = generateRandomItem(char.lvl);
        const result = addItemToInventory(userId, randomItem.id, 1);

        if (result.success) {
          const rarityInfo = getItemRarityInfo(randomItem.rarity);
          await interaction.reply({ content: `🎉 You found: **${randomItem.name}** (${randomItem.rarity})!\n📝 ${randomItem.description}`, ephemeral: true });
        } else {
          await interaction.reply({ content: '❌ Failed to add item to inventory.', ephemeral: true });
        }
        return;
      }
      if (action === 'inventory_sell_all') {
        const [, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot sell items for another user.', ephemeral: true });

        // Implement selling all junk items (common rarity) for gold
        const { getInventory, getItemInfo, removeItemFromInventory } = await import('./rpg.js');
        const { addBalance } = await import('./economy.js');

        const inventory = getInventory(userId);
        let totalGold = 0;
        let soldItems = [];

        for (const [itemId, quantity] of Object.entries(inventory)) {
          const item = getItemInfo(itemId);
          if (item && item.rarity === 'common') {
            const sellPrice = Math.floor(item.value * 0.5); // Sell for 50% of value
            totalGold += sellPrice * quantity;
            soldItems.push(`${item.name} (${quantity}x)`);
            removeItemFromInventory(userId, itemId, quantity);
          }
        }

        if (totalGold > 0) {
          addBalance(userId, totalGold);
          await interaction.reply({ content: `💰 **Sold Junk Items!**\nItems: ${soldItems.join(', ')}\nGold Earned: ${totalGold}`, ephemeral: true });
        } else {
          await interaction.reply({ content: '🗑️ No junk items to sell!', ephemeral: true });
        }
        return;
      }
      if (action === 'guild_contribute') {
        const [, guildName, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot contribute for another user.', ephemeral: true });

        // Show contribution modal
        const modal = new ModalBuilder().setCustomId(`guild_contribute_modal:${guildName}:${userId}`).setTitle('Contribute to Guild');
        const amountInput = new TextInputBuilder().setCustomId('contribution_amount').setLabel('Gold Amount').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('100');
        modal.addComponents({ type: 1, components: [amountInput] });
        await interaction.showModal(modal);
        return;
      }
      if (action === 'guild_refresh') {
        const [, guildName, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot refresh another user\'s guild.', ephemeral: true });

        // Refresh guild info (re-run the info command logic)
        const { getUserGuild } = await import('./guilds.js');
        const userGuild = getUserGuild(userId);

        if (!userGuild) {
          return interaction.reply({ content: '❌ You are no longer in a guild.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setTitle(`🏛️ ${userGuild.name}`)
          .setColor(0xFFD700)
          .setDescription(userGuild.description || 'No description set.')
          .addFields(
            { name: '👑 Leader', value: userGuild.members[userGuild.leader]?.name || 'Unknown', inline: true },
            { name: '🏆 Level', value: userGuild.level, inline: true },
            { name: '👥 Members', value: `${Object.keys(userGuild.members).length}/${userGuild.maxMembers}`, inline: true },
            { name: '💰 Guild Gold', value: userGuild.gold, inline: true },
            { name: '⭐ Experience', value: userGuild.experience, inline: true }
          );

        const memberList = Object.entries(userGuild.members)
          .map(([id, member]) => `${member.role === 'leader' ? '👑' : '👤'} ${member.name} (Level ${member.level})`)
          .join('\n');

        embed.addFields({
          name: '👥 Members',
          value: memberList,
          inline: false
        });

        await interaction.update({ embeds: [embed] });
        return;
      }
      if (action === 'party_invite') {
        const [, partyId, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot generate invites for another user.', ephemeral: true });

        await interaction.reply({ content: `🔗 **Party Invite:**\n\`${partyId}\`\nShare this ID with friends so they can join with \`/guild party action:join party_id:${partyId}\``, ephemeral: true });
        return;
      }
      if (action === 'explore_unlock') {
        const [, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot unlock locations for another user.', ephemeral: true });

        const locations = getLocations();
        const lockedLocations = Object.values(locations).filter(loc => !loc.unlocked);

        if (lockedLocations.length === 0) {
          return interaction.reply({ content: '🎉 All locations are already unlocked! You are a true explorer!', ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setTitle('🔓 Locked Locations')
          .setColor(0xFFA500)
          .setDescription('These locations await your discovery!');

        lockedLocations.forEach(location => {
          embed.addFields({
            name: `${location.emoji} ${location.name} (Level ${location.level})`,
            value: location.description,
            inline: false
          });
        });

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }
      if (action === 'explore_continue') {
        const [, locationName, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot continue adventures for another user.', ephemeral: true });

        // Generate next encounter in the location
        const result = exploreLocation(userId, locationName);

        if (!result.success) {
          return interaction.reply({ content: `❌ ${result.reason}`, ephemeral: true });
        }

        const { location, encounter, narrative } = result;

        const embed = new EmbedBuilder()
          .setTitle(`${location.emoji} Continuing ${location.name}`)
          .setColor(location.color)
          .setDescription(narrative.encounter)
          .addFields(
            { name: '🎯 Challenge', value: encounter.type.replace('_', ' ').toUpperCase(), inline: true },
            { name: '💎 Rewards', value: `${encounter.rewards.xp} XP, ${encounter.rewards.gold} gold`, inline: true }
          );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`explore_engage:${locationName}:${userId}`).setLabel('⚔️ Engage').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`explore_search:${locationName}:${userId}`).setLabel('🔍 Search Area').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`explore_leave:${locationName}:${userId}`).setLabel('🏃 Retreat').setStyle(ButtonStyle.Secondary)
        );

        await interaction.update({ embeds: [embed], components: [row] });
        return;
      }
      if (action === 'explore_engage') {
        const [, locationName, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot engage in combat for another user.', ephemeral: true });

        // Handle combat encounter - implement turn-based combat
        const { getCharacter, encounterMonster, fightTurn, applyXp, addBalance } = await import('./rpg.js');
        const { narrate } = await import('./rpg.js');

        const char = getCharacter(userId);
        if (!char) return interaction.reply({ content: 'You need a character first. Use /rpg start', ephemeral: true });

        const monster = encounterMonster(char.lvl || 1);
        const narrative = await narrate(interaction.guildId, `Describe a thrilling combat encounter with a ${monster.name}.`, `You engage in combat with ${monster.name}!`);

        // Create combat game state
        const combatState = {
          monster: { ...monster },
          playerTurn: true,
          turnCount: 1,
          lastAction: null,
          locationName,
          startedAt: Date.now()
        };

        combatGames.set(userId, combatState);

        const embed = new EmbedBuilder()
          .setTitle('⚔️ Combat Encounter!')
          .setColor(0xFF0000)
          .setDescription(`${narrative}\n\n**Turn 1** - Your turn!`)
          .addFields(
            { name: '🧙 Your Stats', value: `HP: ${char.hp}/${char.maxHp}\nMP: ${char.mp}/${char.maxMp}\nATK: ${char.atk}\nDEF: ${char.def}\nSPD: ${char.spd}`, inline: true },
            { name: '👹 Enemy Stats', value: `${monster.name}\nHP: ${monster.hp}\nATK: ${monster.atk}`, inline: true }
          );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`combat_attack:${monster.name}:${userId}`).setLabel('⚔️ Attack').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`combat_defend:${monster.name}:${userId}`).setLabel('🛡️ Defend').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`combat_flee:${monster.name}:${userId}`).setLabel('🏃 Flee').setStyle(ButtonStyle.Secondary)
        );

        await safeInteractionReply(interaction, { embeds: [embed], components: [row], ephemeral: true });
        return;
      }
      if (action === 'combat_attack') {
        const [, monsterName, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot attack for another user.', ephemeral: true });

        // Get persistent combat state
        const combatState = combatGames.get(userId);
        if (!combatState) {
          return interaction.reply({ content: '❌ No active combat session. Start a new exploration!', ephemeral: true });
        }

        const { getCharacter, fightTurn, applyXp, addBalance } = await import('./rpg.js');
        const char = getCharacter(userId);
        if (!char) return interaction.reply({ content: 'Character not found.', ephemeral: true });

        const monster = combatState.monster;
        const playerDamage = fightTurn(char, monster);

        let resultMessage = `⚔️ **Turn ${combatState.turnCount} - Attack!**\n`;
        resultMessage += `You attack ${monster.name} and deal **${playerDamage}** damage!\n`;

        if (monster.hp <= 0) {
          // Victory!
          const xpGain = char.lvl * 5;
          const goldGain = char.lvl * 3;
          applyXp(userId, char, xpGain);
          char.gold = (char.gold || 0) + goldGain;
          saveCharacter(userId, char);

          resultMessage += `🎉 **Victory!** ${monster.name} has been defeated!\n`;
          resultMessage += `💎 **Rewards:** ${xpGain} XP, ${goldGain} gold!`;

          // Clear combat state
          combatGames.delete(userId);

          await safeInteractionUpdate(interaction, { content: resultMessage, embeds: [], components: [] });
        } else {
          // Monster attacks back
          const monsterDamage = fightTurn(monster, char);
          resultMessage += `${monster.name} attacks back and deals **${monsterDamage}** damage!\n\n`;

          if (char.hp <= 0) {
            // Defeat!
            resultMessage += `💀 **Defeat!** You have fallen in battle.\n`;
            resultMessage += `❤️ You recover to half health and retreat.`;

            char.hp = Math.max(1, Math.floor(char.maxHp / 2));
            saveCharacter(userId, char);

            // Clear combat state
            combatGames.delete(userId);

            await safeInteractionUpdate(interaction, { content: resultMessage, embeds: [], components: [] });
          } else {
            // Continue combat
            resultMessage += `📊 **Current Status:**\n`;
            resultMessage += `🧙 Your HP: ${char.hp}/${char.maxHp}\n`;
            resultMessage += `👹 ${monster.name} HP: ${monster.hp}\n\n`;
            resultMessage += `**Turn ${combatState.turnCount + 1}** - Choose your action!`;

            combatState.turnCount++;
            combatState.playerTurn = true;

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`combat_attack:${monster.name}:${userId}`).setLabel('⚔️ Attack').setStyle(ButtonStyle.Danger),
              new ButtonBuilder().setCustomId(`combat_defend:${monster.name}:${userId}`).setLabel('🛡️ Defend').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId(`combat_flee:${monster.name}:${userId}`).setLabel('🏃 Flee').setStyle(ButtonStyle.Secondary)
            );

            await safeInteractionUpdate(interaction, { content: resultMessage, embeds: [], components: [row] });
          }
        }
        return;
      }
      if (action === 'combat_defend') {
        const [, monsterName, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot defend for another user.', ephemeral: true });

        // Get persistent combat state
        const combatState = combatGames.get(userId);
        if (!combatState) {
          return interaction.reply({ content: '❌ No active combat session.', ephemeral: true });
        }

        const { getCharacter, fightTurn } = await import('./rpg.js');
        const char = getCharacter(userId);
        if (!char) return interaction.reply({ content: 'Character not found.', ephemeral: true });

        const monster = combatState.monster;

        let resultMessage = `🛡️ **Turn ${combatState.turnCount} - Defend!**\n`;
        resultMessage += `You raise your guard to defend against ${monster.name}!\n\n`;

        // Monster attacks with reduced damage (defend reduces damage by 50%)
        const baseDamage = fightTurn(monster, char);
        const reducedDamage = Math.max(1, Math.floor(baseDamage * 0.5));
        char.hp = Math.max(0, char.hp - reducedDamage);

        resultMessage += `${monster.name} attacks but you defend well! Damage reduced from ${baseDamage} to ${reducedDamage}!\n\n`;

        if (char.hp <= 0) {
          // Defeat!
          resultMessage += `💀 **Defeat!** Despite your defense, you have fallen in battle.\n`;
          resultMessage += `❤️ You recover to half health and retreat.`;

          char.hp = Math.max(1, Math.floor(char.maxHp / 2));
          saveCharacter(userId, char);

          // Clear combat state
          combatGames.delete(userId);

          await safeInteractionUpdate(interaction, { content: resultMessage, embeds: [], components: [] });
        } else {
          // Continue combat
          resultMessage += `📊 **Current Status:**\n`;
          resultMessage += `🧙 Your HP: ${char.hp}/${char.maxHp}\n`;
          resultMessage += `👹 ${monster.name} HP: ${monster.hp}\n\n`;
          resultMessage += `**Turn ${combatState.turnCount + 1}** - Monster's turn!`;

          combatState.turnCount++;
          combatState.playerTurn = false;

          await safeInteractionUpdate(interaction, { content: resultMessage, embeds: [], components: [] });

          // Auto-advance to next turn after a delay
          setTimeout(async () => {
            const currentState = combatGames.get(userId);
            if (currentState && !currentState.playerTurn) {
              // Trigger monster attack automatically
              const currentChar = getCharacter(userId);
              if (currentChar && currentChar.hp > 0 && currentState.monster.hp > 0) {
                const attackDamage = fightTurn(currentState.monster, currentChar);

                let autoMessage = `👹 **Monster Turn!**\n`;
                autoMessage += `${currentState.monster.name} attacks and deals **${attackDamage}** damage!\n\n`;

                if (currentChar.hp <= 0) {
                  autoMessage += `💀 **Defeat!** You have fallen in battle.\n`;
                  autoMessage += `❤️ You recover to half health and retreat.`;

                  currentChar.hp = Math.max(1, Math.floor(currentChar.maxHp / 2));
                  saveCharacter(userId, currentChar);

                  combatGames.delete(userId);

                  // Find the original message and update it
                  try {
                    await interaction.followUp({ content: autoMessage, ephemeral: true });
                  } catch (err) {
                    console.error('Failed to send follow-up message:', err);
                  }
                } else {
                  autoMessage += `📊 **Current Status:**\n`;
                  autoMessage += `🧙 Your HP: ${currentChar.hp}/${currentChar.maxHp}\n`;
                  autoMessage += `👹 ${currentState.monster.name} HP: ${currentState.monster.hp}\n\n`;
                  autoMessage += `**Turn ${currentState.turnCount + 1}** - Your turn!`;

                  currentState.playerTurn = true;

                  const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`combat_attack:${currentState.monster.name}:${userId}`).setLabel('⚔️ Attack').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId(`combat_defend:${currentState.monster.name}:${userId}`).setLabel('🛡️ Defend').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`combat_flee:${currentState.monster.name}:${userId}`).setLabel('🏃 Flee').setStyle(ButtonStyle.Secondary)
                  );

                  try {
                    await interaction.followUp({ content: autoMessage, components: [row], ephemeral: true });
                  } catch (err) {
                    console.error('Failed to send follow-up message:', err);
                  }
                }
              }
            }
          }, 3000); // 3 second delay for monster turn
        }
        return;
      }
      if (action === 'combat_flee') {
        const [, monsterName, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot flee for another user.', ephemeral: true });

        // Get persistent combat state
        const combatState = combatGames.get(userId);
        if (!combatState) {
          return interaction.reply({ content: '❌ No active combat session.', ephemeral: true });
        }

        const { getCharacter } = await import('./rpg.js');
        const char = getCharacter(userId);
        if (!char) return interaction.reply({ content: 'Character not found.', ephemeral: true });

        let resultMessage = `🏃 **Turn ${combatState.turnCount} - Flee!**\n`;
        resultMessage += `You successfully flee from ${combatState.monster.name}!\n`;
        resultMessage += `✨ You retreat safely back to ${combatState.locationName}.`;

        // Clear combat state
        combatGames.delete(userId);

        await interaction.update({ content: resultMessage, embeds: [], components: [] });
        return;
      }
      if (action === 'explore_search') {
        const [, locationName, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot search for another user.', ephemeral: true });

        // Handle search/puzzle encounter - implement treasure finding
        const { getCharacter, addItemToInventory, generateRandomItem, applyXp } = await import('./rpg.js');

        const char = getCharacter(userId);
        if (!char) return interaction.reply({ content: 'You need a character first. Use /rpg start', ephemeral: true });

        // Random chance to find treasure
        const treasureChance = Math.random();
        let resultMessage = '🔍 **You search the area thoroughly...**\n\n';

        if (treasureChance > 0.6) {
          // Found treasure!
          const randomItem = generateRandomItem(char.lvl);
          const addResult = addItemToInventory(userId, randomItem.id, 1);

          if (addResult.success) {
            const xpGain = Math.floor(char.lvl * 2);
            applyXp(userId, char, xpGain);

            resultMessage += `🎉 **Treasure Found!**\n`;
            resultMessage += `💎 You discovered: **${randomItem.name}** (${randomItem.rarity})\n`;
            resultMessage += `📝 ${randomItem.description}\n`;
            resultMessage += `⭐ **Bonus:** ${xpGain} XP gained!`;
          } else {
            resultMessage += `💨 You found something interesting, but couldn't carry it.\n`;
            resultMessage += `Try freeing up inventory space!`;
          }
        } else if (treasureChance > 0.3) {
          // Found minor item or gold
          const goldGain = Math.floor(char.lvl * 3) + Math.floor(Math.random() * 10);
          const { addBalance } = await import('./economy.js');
          addBalance(userId, goldGain);

          const xpGain = Math.floor(char.lvl * 1);
          applyXp(userId, char, xpGain);

          resultMessage += `💰 **Minor Discovery!**\n`;
          resultMessage += `You found a small pouch with **${goldGain} gold**!\n`;
          resultMessage += `⭐ **Bonus:** ${xpGain} XP gained!`;
        } else {
          // Nothing found
          const xpGain = Math.floor(char.lvl * 0.5);
          applyXp(userId, char, xpGain);

          resultMessage += `🔍 **Nothing Found...**\n`;
          resultMessage += `The area appears to be empty, but you gained some exploration experience.\n`;
          resultMessage += `⭐ **Bonus:** ${xpGain} XP gained!`;
        }

        await interaction.reply({ content: resultMessage, ephemeral: true });
        return;
      }
      if (action === 'explore_leave') {
        const [, locationName, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot leave for another user.', ephemeral: true });

        await interaction.update({ content: '🏃 **You retreat safely from the location.**\n*You can return later to continue your adventure!*', components: [] });
        return;
      }
      if (action === 'trade_create_auction') {
        const [, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot create auctions for another user.', ephemeral: true });

        // Show auction creation modal
        const modal = new ModalBuilder().setCustomId(`trade_auction_modal:${userId}`).setTitle('Create Auction');
        const itemInput = new TextInputBuilder().setCustomId('auction_item').setLabel('Item to Auction').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('rusty_sword');
        const priceInput = new TextInputBuilder().setCustomId('auction_price').setLabel('Starting Price (gold)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('100');
        modal.addComponents({ type: 1, components: [itemInput] });
        modal.addComponents({ type: 1, components: [priceInput] });
        await interaction.showModal(modal);
        return;
      }
      if (action === 'trade_view_auctions') {
        const [, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot view auctions for another user.', ephemeral: true });

        const auctions = getActiveAuctions(10);

        if (auctions.length === 0) {
          return interaction.reply({ content: '🏛️ No active auctions. Be the first to create one!', ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setTitle('🏛️ Active Auctions')
          .setColor(0xFFD700);

        auctions.forEach((auction, index) => {
          const timeLeft = Math.max(0, auction.ends - Date.now());
          const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
          const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

          embed.addFields({
            name: `Auction #${index + 1} - ${auction.itemId}`,
            value: `💰 Current: ${auction.currentBid} gold\n⏰ Time left: ${hoursLeft}h ${minutesLeft}m\n🏷️ Buyout: ${auction.buyoutPrice} gold`,
            inline: true
          });
        });

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }
      if (action === 'explore_investigate') {
        const [, locationName, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot investigate for another user.', ephemeral: true });

        // Handle investigation encounter - reveal location lore and secrets
        const { getCharacter, applyXp } = await import('./rpg.js');
        const { getLocations } = await import('./locations.js');

        const char = getCharacter(userId);
        if (!char) return interaction.reply({ content: 'You need a character first. Use /rpg start', ephemeral: true });

        const locations = getLocations();
        const location = locations[locationName];

        if (!location) {
          return interaction.reply({ content: '❌ Location not found.', ephemeral: true });
        }

        // Generate investigation results based on location
        const investigationResults = {
          forest: [
            "You discover ancient carvings on tree trunks that tell stories of the forest's guardians.",
            "Hidden among the roots, you find a small crystal that hums with natural energy.",
            "You uncover a forgotten shrine dedicated to the spirits of the woods."
          ],
          mountain: [
            "You find cave paintings depicting the mountain's volcanic history and ancient inhabitants.",
            "Between the rocks, you discover a naturally formed crystal formation with unique properties.",
            "You stumble upon an old hermit's cabin with journals revealing mountain secrets."
          ],
          desert: [
            "You uncover ancient ruins partially buried in the sand, hinting at a lost civilization.",
            "In a hidden oasis, you find a well-preserved artifact from a forgotten era.",
            "You discover nomadic trade routes marked with mysterious symbols."
          ],
          ocean: [
            "You find a message in a bottle containing coordinates to a hidden underwater cave.",
            "Shells and coral formations reveal patterns that seem to form a map.",
            "You discover a school of fish that leads you to an underwater treasure chest."
          ]
        };

        const locationResults = investigationResults[locationName] || investigationResults.forest;
        const discovery = locationResults[Math.floor(Math.random() * locationResults.length)];

        const xpGain = Math.floor(char.lvl * 3);
        applyXp(userId, char, xpGain);

        const embed = new EmbedBuilder()
          .setTitle(`🔍 Investigation Results - ${location.name}`)
          .setColor(location.color)
          .setDescription(discovery)
          .addFields(
            { name: '📚 Knowledge Gained', value: 'You learned valuable information about this location!', inline: true },
            { name: '⭐ Experience Gained', value: `${xpGain} XP`, inline: true }
          );

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }
      if (action === 'explore_rest') {
        const [, locationName, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot rest for another user.', ephemeral: true });

        // Handle rest encounter - restore HP/MP with proper implementation
        const { getCharacter, saveCharacter, applyXp } = await import('./rpg.js');
        const { getLocations } = await import('./locations.js');

        const char = getCharacter(userId);
        if (!char) return interaction.reply({ content: 'You need a character first. Use /rpg start', ephemeral: true });

        const locations = getLocations();
        const location = locations[locationName];

        if (!location) {
          return interaction.reply({ content: '❌ Location not found.', ephemeral: true });
        }

        // Calculate rest effectiveness based on location
        const restMultiplier = {
          forest: 1.2,
          mountain: 1.0,
          desert: 0.8,
          ocean: 1.1
        }[locationName] || 1.0;

        const hpRestored = Math.floor(char.maxHp * 0.8 * restMultiplier);
        const mpRestored = Math.floor(char.maxMp * 0.6 * restMultiplier);

        char.hp = Math.min(char.maxHp, char.hp + hpRestored);
        char.mp = Math.min(char.maxMp, char.mp + mpRestored);

        // Save the updated character
        saveCharacter(userId, char);

        const xpGain = Math.floor(char.lvl * 1);
        applyXp(userId, char, xpGain);

        let restMessage = `🛌 **You take a well-deserved rest in ${location.name}**\n\n`;

        if (restMultiplier > 1.0) {
          restMessage += `🌿 The peaceful atmosphere enhances your recovery!\n`;
        } else if (restMultiplier < 1.0) {
          restMessage += `🏜️ The harsh environment makes resting difficult.\n`;
        }

        restMessage += `❤️ **HP Restored:** ${hpRestored} → ${char.hp}/${char.maxHp}\n`;
        restMessage += `🔮 **MP Restored:** ${mpRestored} → ${char.mp}/${char.maxMp}\n`;
        restMessage += `⭐ **Meditation Bonus:** ${xpGain} XP gained!\n\n`;
        restMessage += `✨ You feel refreshed and ready for more adventure!`;

        await interaction.reply({ content: restMessage, ephemeral: true });
        return;
      }
      if (action.startsWith('ttt_')) {
        const [, position, gameId] = interaction.customId.split('_');
        const pos = parseInt(position);

        if (isNaN(pos) || pos < 0 || pos > 8) return;

        // Find the game state (in a real implementation, you'd store this per channel)
        // For now, handle the move and update the board
        await interaction.reply({ content: `⭕ **Tic-Tac-Toe Move!**\nYou played position ${pos + 1}!`, ephemeral: true });

        // Update game state and refresh board
        // This would need persistent game state management
        return;
      }
      if (action === 'music_pause') {
        const [, targetGuild] = interaction.customId.split(':');
        if (targetGuild && targetGuild !== interaction.guild.id) return interaction.reply({ content: 'You cannot pause music in another server.', ephemeral: true });

        const { pause, getMusicStats } = await import('./music.js');
        const result = pause(interaction.guild.id);

        if (result) {
          // Update the button to show "Resume" instead of "Pause"
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

            await interaction.update({
              content: interaction.message.content,
              embeds: interaction.message.embeds,
              components: [new ActionRowBuilder().addComponents(newRow)]
            });
          } else {
            await interaction.reply({ content: '⏸️ **Music paused!**', ephemeral: true });
          }
        } else {
          await interaction.reply({ content: '❌ No music currently playing.', ephemeral: true });
        }
        return;
      }
      if (action === 'music_resume') {
        const [, targetGuild] = interaction.customId.split(':');
        if (targetGuild && targetGuild !== interaction.guild.id) return interaction.reply({ content: 'You cannot resume music in another server.', ephemeral: true });

        const { resume, getMusicStats } = await import('./music.js');
        const result = resume(interaction.guild.id);

        if (result) {
          // Update the button back to show "Pause" instead of "Resume"
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

            await interaction.update({
              content: interaction.message.content,
              embeds: interaction.message.embeds,
              components: [new ActionRowBuilder().addComponents(newRow)]
            });
          } else {
            await interaction.reply({ content: '▶️ **Music resumed!**', ephemeral: true });
          }
        } else {
          await interaction.reply({ content: '❌ No paused music to resume.', ephemeral: true });
        }
        return;
      }
      if (action === 'music_skip') {
        const [, targetGuild] = interaction.customId.split(':');
        if (targetGuild && targetGuild !== interaction.guild.id) return interaction.reply({ content: 'You cannot skip music in another server.', ephemeral: true });

        const { skip, getMusicStats } = await import('./music.js');
        const nextSong = skip(interaction.guild.id);
        const stats = getMusicStats(interaction.guild.id);

        if (nextSong) {
          // Update the embed with the new song info
          const embed = interaction.message.embeds[0];
          if (embed) {
            const newEmbed = {
              title: embed.title,
              color: embed.color,
              description: `**${nextSong.title}** by **${nextSong.artist}**`,
              fields: [
                { name: '⏱️ Duration', value: nextSong.duration || 'Unknown', inline: true },
                { name: '👤 Requested by', value: embed.fields[2]?.value || 'Unknown', inline: true }
              ],
              thumbnail: nextSong.thumbnail || embed.thumbnail
            };

            console.log('DEBUG: nextSong.duration:', nextSong.duration);
            console.log('DEBUG: newEmbed.fields:', JSON.stringify(newEmbed.fields, null, 2));
            console.log('DEBUG: interaction.id in music_skip:', interaction.id);
            await interaction.update({
              embeds: [newEmbed],
              components: interaction.message.components
            });
          } else {
            await interaction.reply({ content: `⏭️ **Skipped to:** ${nextSong.title} by ${nextSong.artist}`, ephemeral: true });
          }
        } else {
          await interaction.reply({ content: '❌ No songs in queue to skip to.', ephemeral: true });
        }
        return;
      }
      if (action === 'music_stop') {
        const [, targetGuild] = interaction.customId.split(':');
        if (targetGuild && targetGuild !== interaction.guild.id) return interaction.reply({ content: 'You cannot stop music in another server.', ephemeral: true });

        const { stop } = await import('./music.js');
        const result = stop(interaction.guild.id);

        if (result) {
          // Remove all buttons since music is stopped
          await interaction.update({
            content: '⏹️ **Music stopped and queue cleared!**',
            embeds: [],
            components: []
          });
        } else {
          await interaction.reply({ content: '❌ Failed to stop music.', ephemeral: true });
        }
        return;
      }
      if (action === 'music_shuffle') {
        const [, targetGuild] = interaction.customId.split(':');
        if (targetGuild && targetGuild !== interaction.guild.id) return interaction.reply({ content: 'You cannot shuffle queue in another server.', ephemeral: true });

        const { shuffleQueue } = await import('./music.js');
        const result = shuffleQueue(interaction.guild.id);

        if (result) {
          await interaction.reply({ content: '🔀 **Queue shuffled!**', ephemeral: true });
        } else {
          await interaction.reply({ content: '❌ Queue is empty or too small to shuffle.', ephemeral: true });
        }
        return;
      }
      if (action === 'music_clear') {
        const [, targetGuild] = interaction.customId.split(':');
        if (targetGuild && targetGuild !== interaction.guild.id) return interaction.reply({ content: 'You cannot clear queue in another server.', ephemeral: true });

        const { clearQueue } = await import('./music.js');
        const result = clearQueue(interaction.guild.id);

        if (result) {
          await interaction.reply({ content: '🗑️ **Queue cleared!**', ephemeral: true });
        } else {
          await interaction.reply({ content: '❌ Failed to clear queue.', ephemeral: true });
        }
        return;
      }
      if (action === 'music_queue') {
        const [, targetGuild] = interaction.customId.split(':');
        if (targetGuild && targetGuild !== interaction.guild.id) return interaction.reply({ content: 'You cannot view queue in another server.', ephemeral: true });

        const { getQueue, getMusicStats } = await import('./music.js');
        const queue = getQueue(interaction.guild.id);
        const stats = getMusicStats(interaction.guild.id);
        const current = stats.currentlyPlaying;

        let description = '';
        if (current) {
          description += `🎵 **Currently Playing:** ${current.title} by ${current.artist}\n`;
          description += `⏱️ Progress: ${Math.floor(current.progress / 1000)}s / ${current.duration}\n\n`;
        }
        if (queue.length > 0) {
          description += '📋 **Queue:**\n';
          queue.slice(0, 10).forEach((song, index) => {
            description += `${index + 1}. ${song.title} by ${song.artist} (${song.duration})\n`;
          });
          if (queue.length > 10) {
            description += `... and ${queue.length - 10} more songs`;
          }
        } else {
          description += '📭 Queue is empty.';
        }

        const embed = {
          title: '🎵 Music Queue',
          color: 0x0099FF,
          description,
          fields: [
            {
              name: '📊 Queue Info',
              value: `**Total Songs:** ${stats.queueLength}\n**Volume:** ${stats.volume}%`,
              inline: true
            }
          ]
        };

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }
      if (action === 'guess_modal') {
        const [, gameId, min, max] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot start guess games for another user.', ephemeral: true });

        // Show guess input modal
        const modal = new ModalBuilder().setCustomId(`guess_submit:${gameId}:${min || 1}:${max || 100}`).setTitle('Number Guessing Game');
        const guessInput = new TextInputBuilder()
          .setCustomId('guess_number')
          .setLabel(`Guess a number between ${min || 1} and ${max || 100}`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('42');

        modal.addComponents({ type: 1, components: [guessInput] });
        await interaction.showModal(modal);
        return;
      }
      if (action.startsWith('c4_')) {
        const [, column, gameId] = interaction.customId.split('_');
        const col = parseInt(column);

        if (isNaN(col) || col < 0 || col > 6) return;

        // Find the game state and make the move
        await interaction.reply({ content: `🎯 **Connect Four Move!**\nYou dropped a piece in column ${col + 1}!`, ephemeral: true });

        // Update game state and refresh board
        // This would need persistent game state management
        return;
      }
      if (action === 'hangman') {
        const [, letter] = interaction.customId.split('_');
        if (!letter || letter.length !== 1) return;

        // Get game state
        const gameState = hangmanGames.get(userId);
        if (!gameState || !gameState.gameActive) {
          return interaction.reply({ content: 'No active hangman game found. Start a new one with /hangman', ephemeral: true });
        }

        // Process guess
        if (gameState.guessedLetters.has(letter)) {
          return interaction.reply({ content: `You already guessed **${letter}**!`, ephemeral: true });
        }

        gameState.guessedLetters.add(letter);

        if (gameState.word.includes(letter)) {
          // Correct guess
          const displayWord = gameState.word.split('').map(l => gameState.guessedLetters.has(l) ? l : '_').join(' ');
          gameState.guessedWord = displayWord;
        } else {
          // Wrong guess
          gameState.wrongGuesses++;
        }

        // Send updated board
        const { sendHangmanBoard } = await import('./commands/hangman.js');
        await sendHangmanBoard(interaction, gameState);

        return;
      }
      if (action === 'music_radio_change') {
        const [, currentStation] = interaction.customId.split(':');
        const stations = ['lofi', 'rock', 'electronic', 'jazz', 'classical'];
        const nextStation = stations[(stations.indexOf(currentStation) + 1) % stations.length];

        const stationNames = {
          lofi: '🎵 Lo-fi Hip Hop',
          rock: '🎸 Rock Classics',
          electronic: '🎶 Electronic',
          jazz: '🎷 Smooth Jazz',
          classical: '🎼 Classical'
        };

        await interaction.reply({ content: `📻 **Changed to:** ${stationNames[nextStation]}\n🎵 *Now playing ${stationNames[nextStation]} radio!*`, ephemeral: true });
        return;
      }
      if (action === 'music_play') {
        const [, indexStr, query] = interaction.customId.split(':');
        const index = parseInt(indexStr);

        // Re-search to get the song
        const { searchSongs, play } = await import('./music.js');
        const results = await searchSongs(query, 5);
        if (results[index]) {
          const song = results[index];

          // Voice channel check
          const voiceChannel = interaction.member.voice?.channel;
          if (!voiceChannel) {
            return interaction.reply({ content: '🎵 You must be in a voice channel to play music!', ephemeral: true });
          }

          const result = await play(interaction.guild.id, voiceChannel, song);
          if (result.success) {
            const embed = new EmbedBuilder()
              .setTitle('🎵 Now Playing')
              .setColor(0x00FF00)
              .setDescription(`**${song.title}** by **${song.artist}**`)
              .addFields(
                { name: '⏱️ Duration', value: song.duration, inline: true },
                { name: '👤 Requested by', value: interaction.user.username, inline: true }
              )
              .setThumbnail(song.thumbnail || 'https://i.imgur.com/SjIgjlE.png');

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`music_pause:${interaction.guild.id}`).setLabel('⏸️ Pause').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId(`music_skip:${interaction.guild.id}`).setLabel('⏭️ Skip').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`music_stop:${interaction.guild.id}`).setLabel('⏹️ Stop').setStyle(ButtonStyle.Danger)
            );

            await interaction.reply({ embeds: [embed], components: [row] });
          } else {
            await interaction.reply({ content: `❌ Failed to play: ${result.error}`, ephemeral: true });
          }
        } else {
          await interaction.reply({ content: '❌ Song not found.', ephemeral: true });
        }
        return;
      }
      if (action === 'music_shuffle') {
        const [, targetGuild] = interaction.customId.split(':');
        if (targetGuild && targetGuild !== interaction.guild.id) return interaction.reply({ content: 'You cannot shuffle in another server.', ephemeral: true });

        const { shuffleQueue } = await import('./music.js');
        const result = shuffleQueue(interaction.guild.id);

        if (result) {
          await interaction.reply({ content: '🔀 **Queue shuffled!**', ephemeral: true });
        } else {
          await interaction.reply({ content: '❌ Queue is empty or too small to shuffle.', ephemeral: true });
        }
        return;
      }
      if (action === 'music_clear') {
        const [, targetGuild] = interaction.customId.split(':');
        if (targetGuild && targetGuild !== interaction.guild.id) return interaction.reply({ content: 'You cannot clear queue in another server.', ephemeral: true });

        const { clearQueue } = await import('./music.js');
        const result = clearQueue(interaction.guild.id);

        if (result) {
          await interaction.reply({ content: '🗑️ **Queue cleared!**', ephemeral: true });
        } else {
          await interaction.reply({ content: '❌ Failed to clear queue.', ephemeral: true });
        }
        return;
      }
      if (action === 'ai_chat') {
        const [, model, personality, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot continue AI chat for another user.', ephemeral: true });

        // Show AI chat modal
        const modal = new ModalBuilder().setCustomId(`ai_chat_modal:${model}:${personality}:${userId}`).setTitle('Continue AI Chat');
        const messageInput = new TextInputBuilder().setCustomId('ai_message').setLabel('Your message').setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder('Continue the conversation...');
        modal.addComponents({ type: 1, components: [messageInput] });
        await interaction.showModal(modal);
        return;
      }
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    await command.execute(interaction);

    // Set command-specific cooldown after successful execution
    setCooldown(interaction.user.id, interaction.commandName);
  } catch (err) {
    // Log the error with full context
    logError('Command execution failed', err, {
      command: interaction.commandName,
      user: `${interaction.user.username}#${interaction.user.discriminator}`,
      userId: interaction.user.id,
      guild: interaction.guild?.name || 'DM',
      channel: interaction.channel?.name || 'Unknown'
    });

    // Log command failure
    logCommandExecution(interaction, false, err);

    // Provide user-friendly error response
    const errorMessage = process.env.NODE_ENV === 'development'
      ? `❌ **Error:** ${err.message}`
      : '❌ There was an error while executing this command! Please try again.';

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: errorMessage, ephemeral: true });
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  }
});
console.log('Interaction listener added');

console.log('About to add message listener');
client.on('messageCreate', async message => {
  try {
    // Check global message cooldown
    const messageCooldown = isOnCooldown(message.author.id, 'message_global');
    if (messageCooldown.onCooldown) {
      return; // Silently ignore messages during cooldown
    }

    // Set message cooldown
    setCooldown(message.author.id, 'message_global');

    // First, check typing minigame attempts
    const attempt = checkTypingAttempt(message.author.id, message.content);
    if (attempt) {
      if (attempt.ok) await message.reply({ content: `Nice! You typed it correctly: ${attempt.expected}` });
      else if (attempt.reason === 'timeout') await message.reply({ content: 'Too slow! The typing challenge expired.' });
      return;
    }

    const reply = await handleMessage(message);
    if (reply) await message.reply({ content: reply });
  } catch (err) {
    logError('Message handling failed', err, {
      user: `${message.author.username}#${message.author.discriminator}`,
      userId: message.author.id,
      guild: message.guild?.name || 'DM',
      channel: message.channel?.name || 'Unknown',
      messageLength: message.content.length
    });
  }
});

console.log('All event listeners added, about to start login process');
(async () => {
  try {
    console.log('About to attempt login');
    logger.info('Attempting to login to Discord...');
    // Add timeout to prevent hanging on invalid token
    const loginPromise = client.login(TOKEN);
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Discord login timed out after 10 seconds. Please check your DISCORD_TOKEN in .env file.')), 10000));
    await Promise.race([loginPromise, timeoutPromise]);
    logger.success('Login successful');
  } catch (error) {
    console.error('Login failed:', error.message);
    logError('Failed to login to Discord', error);
    if (error.message.includes('timeout') || error.message.includes('Invalid token')) {
      console.error('Please ensure DISCORD_TOKEN in .env is set to a valid Discord bot token from https://discord.com/developers/applications');
    }
    process.exit(1);
  }
})();
