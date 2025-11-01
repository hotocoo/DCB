import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { exploreLocation, unlockLocation, enterDungeon, discoverLocation, getLocations } from '../locations.js';
import { narrate } from '../rpg.js';
import fs from 'fs';
import path from 'path';
import { safeExecuteCommand, CommandError, validateNotEmpty, validateRange } from '../errorHandler.js';

// RPG data file path
const FILE = path.join(process.cwd(), 'data', 'rpg.json');

// in-memory cache to reduce fs reads/writes
let cache = null;
// simple per-user locks to avoid concurrent writes
const locks = new Set();

function ensureDir() {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readAll() {
  ensureDir();
  if (!fs.existsSync(FILE)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
    // migrate / ensure defaults for older characters
    for (const k of Object.keys(raw)) {
      const c = raw[k] || {};
      if (typeof c.dailyExplorations === 'undefined') c.dailyExplorations = 0;
      if (typeof c.lastDailyReset === 'undefined') c.lastDailyReset = Date.now();
      if (typeof c.sessionXpGained === 'undefined') c.sessionXpGained = 0;
      if (typeof c.lastSessionReset === 'undefined') c.lastSessionReset = Date.now();
      raw[k] = c;
    }
    cache = raw;
    return raw;
  } catch (err) {
    console.error('Failed to read rpg storage', err);
    return {};
  }
}

function writeAll(obj) {
  ensureDir();
  try {
    // atomic write: write to temp file then rename
    const tmp = `${FILE}.tmp`;
    console.log(`[EXPLORE DEBUG] Writing to RPG file: ${FILE}`);
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
    fs.renameSync(tmp, FILE);
    cache = obj;
  } catch (err) {
    console.error('Failed to write RPG data:', err);
    // Attempt to restore from cache if available
    if (cache) {
      console.log('Restoring from cache after write failure');
    } else {
      throw new Error(`Failed to save RPG data: ${err.message}`);
    }
  }
}

// Function to check daily exploration limit
function checkDailyLimit(userId) {
  const all = cache || readAll();
  const char = all[userId];
  if (!char) return { allowed: false, reason: 'no_character' };

  const now = Date.now();
  const dayInMs = 24 * 60 * 60 * 1000;

  // Check if we need to reset daily count
  if (now - (char.lastDailyReset || 0) >= dayInMs) {
    char.dailyExplorations = 0;
    char.lastDailyReset = now;
    writeAll(all);
  }

  const maxDaily = 10; // 10 explorations per day
  const used = char.dailyExplorations || 0;
  const allowed = used < maxDaily;

  return {
    allowed,
    used,
    max: maxDaily,
    remaining: maxDaily - used,
    resetTime: char.lastDailyReset
  };
}

// Function to increment daily exploration count
function incrementDailyExploration(userId) {
  const all = cache || readAll();
  const char = all[userId];
  if (!char) return { success: false, reason: 'no_character' };

  // Check daily limit first
  const check = checkDailyLimit(userId);
  if (!check.allowed) {
    return { success: false, reason: 'daily_limit_reached' };
  }

  char.dailyExplorations = (char.dailyExplorations || 0) + 1;
  writeAll(all);

  return { success: true, newCount: char.dailyExplorations };
}

// Function to check session XP cap
function checkSessionXpCap(userId) {
  const all = cache || readAll();
  const char = all[userId];
  if (!char) return { allowed: false, reason: 'no_character' };

  const now = Date.now();
  const sessionDurationMs = 24 * 60 * 60 * 1000; // 24 hours

  // Check if we need to reset session XP
  if (now - (char.lastSessionReset || 0) >= sessionDurationMs) {
    char.sessionXpGained = 0;
    char.lastSessionReset = now;
    writeAll(all);
  }

  const maxSessionXp = 1000; // 1000 XP per session
  const used = char.sessionXpGained || 0;
  const allowed = used < maxSessionXp;

  return {
    allowed,
    used,
    max: maxSessionXp,
    remaining: maxSessionXp - used,
    resetTime: char.lastSessionReset
  };
}

export const data = new SlashCommandBuilder()
  .setName('explore')
  .setDescription('Explore epic RPG locations and dungeons')
  .addSubcommand(sub => sub.setName('locations').setDescription('View available locations'))
  .addSubcommand(sub => sub.setName('discover').setDescription('Discover new locations').addStringOption(opt => opt.setName('location').setDescription('Location to discover').setRequired(true)))
  .addSubcommand(sub => sub.setName('enter').setDescription('Enter a location for adventure').addStringOption(opt => opt.setName('location').setDescription('Location to explore').setRequired(true)));

export async function execute(interaction) {
  return safeExecuteCommand(interaction, async () => {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

  if (sub === 'locations') {
    const locations = getLocations();
    const availableLocations = Object.values(locations).filter(loc => loc.unlocked);

    if (availableLocations.length === 0) {
      return interaction.reply({
        content: '🏕️ No locations available yet. Start your adventure by exploring the Whispering Woods!\nUse `/explore discover location:whispering_woods`',
        flags: MessageFlags.Ephemeral
      });
    }

    const dailyCheck = checkDailyLimit(userId);
    const sessionCheck = checkSessionXpCap(userId);

    const embed = new EmbedBuilder()
      .setTitle('🗺️ Available Locations')
      .setColor(0x0099FF)
      .setDescription('Choose your adventure!');

    availableLocations.forEach(location => {
      embed.addFields({
        name: `${location.emoji} ${location.name} (Level ${location.level})`,
        value: `**Type:** ${location.type}\n**Description:** ${location.description}\n**Rewards:** ${location.rewards.xp} XP, ${location.rewards.gold} gold`,
        inline: false
      });
    });

    // Add usage info
    embed.addFields({
      name: '📊 Daily Usage',
      value: dailyCheck.allowed ? `Explorations: ${dailyCheck.remaining} remaining` : `Explorations: ${dailyCheck.used}/${dailyCheck.max} (limit reached)`,
      inline: true
    });

    embed.addFields({
      name: '⭐ Session XP',
      value: sessionCheck.allowed ? `XP: ${sessionCheck.remaining} remaining` : `XP: ${sessionCheck.used}/${sessionCheck.max} (cap reached)`,
      inline: true
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`explore_unlock:${userId}`).setLabel('🔓 Discover More').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`explore_map:${userId}`).setLabel('🗺️ View Map').setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [embed], components: [row] });

    } else if (sub === 'discover') {
    const locationName = interaction.options.getString('location');

    validateNotEmpty(locationName, 'location name');

    const result = discoverLocation(userId, locationName);

    if (!result.success) {
      throw new CommandError(result.reason, 'COMMAND_ERROR');
    }

    const { location, requirements, canUnlock } = result;

    if (canUnlock) {
      const unlockResult = unlockLocation(userId, locationName);
      if (unlockResult.success) {
        const embed = new EmbedBuilder()
          .setTitle('🎉 Location Discovered!')
          .setColor(location.color)
          .setDescription(unlockResult.message)
          .addFields(
            { name: '📍 Location', value: location.name, inline: true },
            { name: '🏆 Level', value: location.level, inline: true },
            { name: '🎯 Type', value: location.type, inline: true }
          );

        await interaction.reply({ embeds: [embed] });
      } else {
        throw new CommandError(unlockResult.reason || 'Failed to unlock location', 'COMMAND_ERROR');
      }
    } else {
      const embed = new EmbedBuilder()
        .setTitle('🔒 Location Locked')
        .setColor(0xFFA500)
        .setDescription(`**${location.name}** is not yet available.`)
        .addFields({
          name: 'Requirements',
          value: `🏆 **Level ${requirements.level || 'Any'}**\n⭐ **Achievement: ${requirements.achievements?.join(', ') || 'None'}**`,
          inline: false
        });

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

  } else if (sub === 'enter') {
    const locationName = interaction.options.getString('location');

    validateNotEmpty(locationName, 'location name');

    // Check daily limit
    const dailyCheck = checkDailyLimit(userId);
    if (!dailyCheck.allowed) {
      const resetHours = Math.ceil((24 - (Date.now() - (dailyCheck.resetTime || Date.now())) / 3600000));
      throw new CommandError(`Daily exploration limit reached! You have used ${dailyCheck.used}/${dailyCheck.max} explorations today. Reset in ${resetHours} hours.`, 'COMMAND_ERROR');
    }

    // Check session XP cap
    const sessionCheck = checkSessionXpCap(userId);
    if (!sessionCheck.allowed) {
      const resetHours = Math.ceil((24 - (Date.now() - (sessionCheck.resetTime || Date.now())) / 3600000));
      throw new CommandError(`Session XP cap reached! You have gained ${sessionCheck.used}/${sessionCheck.max} XP this session. Reset in ${resetHours} hours.`, 'COMMAND_ERROR');
    }

    const result = exploreLocation(userId, locationName);

    if (!result.success) {
      throw new CommandError(result.reason, 'COMMAND_ERROR');
    }

    // Increment daily exploration count
    const incrementResult = incrementDailyExploration(userId);
    if (!incrementResult.success) {
      throw new CommandError(incrementResult.reason || 'Failed to update exploration count', 'COMMAND_ERROR');
    }

    const { location, encounter, narrative } = result;

    // Generate AI narrative for the location entry
    let locationNarrative;
    try {
      locationNarrative = await narrate(
        interaction.guildId,
        `${location.ai_prompt} An adventurer enters this mystical place.`,
        `You enter ${location.name}. ${narrative.entry}`
      );
    } catch (narrativeError) {
      console.warn('[EXPLORE] AI narrative generation failed, using fallback:', narrativeError.message);
      locationNarrative = `You enter ${location.name}. ${narrative.entry}`;
    }

    const embed = new EmbedBuilder()
      .setTitle(`${location.emoji} ${location.name}`)
      .setColor(location.color)
      .setDescription(locationNarrative)
      .addFields(
        { name: '🎯 Encounter Type', value: encounter.type.replace('_', ' ').toUpperCase(), inline: true },
        { name: '⚔️ Difficulty', value: `Level ${encounter.difficulty}`, inline: true },
        { name: '💎 Potential Rewards', value: `${encounter.rewards.xp} XP, ${encounter.rewards.gold} gold`, inline: true },
        { name: '📊 Daily Explorations', value: `${dailyCheck.remaining - 1} remaining`, inline: true },
        { name: '⭐ Session XP', value: `${sessionCheck.remaining} remaining`, inline: true }
      );

    // Add exploration action buttons
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`explore_continue:${locationName}:${userId}`).setLabel('⚔️ Continue Adventure').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`explore_leave:${locationName}:${userId}`).setLabel('🏃 Leave Location').setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [embed], components: [row] });
    }
  }, {
    command: 'explore'
  });
}