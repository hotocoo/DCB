import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { exploreLocation, unlockLocation, enterDungeon, discoverLocation, getLocations } from '../locations.js';
import { narrate, checkDailyLimit, incrementDailyExploration, checkSessionXpCap } from '../rpg.js';

export const data = new SlashCommandBuilder()
  .setName('explore')
  .setDescription('Explore epic RPG locations and dungeons')
  .addSubcommand(sub => sub.setName('locations').setDescription('View available locations'))
  .addSubcommand(sub => sub.setName('discover').setDescription('Discover new locations').addStringOption(opt => opt.setName('location').setDescription('Location to discover').setRequired(true)))
  .addSubcommand(sub => sub.setName('enter').setDescription('Enter a location for adventure').addStringOption(opt => opt.setName('location').setDescription('Location to explore').setRequired(true)));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  if (sub === 'locations') {
    const locations = getLocations();
    const availableLocations = Object.values(locations).filter(loc => loc.unlocked);

    if (availableLocations.length === 0) {
      return interaction.reply({
        content: '🏕️ No locations available yet. Start your adventure by exploring the Whispering Woods!\nUse `/explore discover location:whispering_woods`',
        ephemeral: true
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
    const result = discoverLocation(userId, locationName);

    if (!result.success) {
      return interaction.reply({ content: `❌ ${result.reason}`, ephemeral: true });
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

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

  } else if (sub === 'enter') {
    const locationName = interaction.options.getString('location');

    // Check daily limit
    const dailyCheck = checkDailyLimit(userId);
    if (!dailyCheck.allowed) {
      return interaction.reply({
        content: `❌ **Daily exploration limit reached!** You have used ${dailyCheck.used}/${dailyCheck.max} explorations today. Reset in ${Math.ceil((24 - (Date.now() - (dailyCheck.resetTime || Date.now())) / 3600000))} hours.`,
        ephemeral: true
      });
    }

    // Check session XP cap
    const sessionCheck = checkSessionXpCap(userId);
    if (!sessionCheck.allowed) {
      return interaction.reply({
        content: `❌ **Session XP cap reached!** You have gained ${sessionCheck.used}/${sessionCheck.max} XP this session. Reset in ${Math.ceil((24 - (Date.now() - (sessionCheck.resetTime || Date.now())) / 3600000))} hours.`,
        ephemeral: true
      });
    }

    const result = exploreLocation(userId, locationName);

    if (!result.success) {
      return interaction.reply({ content: `❌ ${result.reason}`, ephemeral: true });
    }

    // Increment daily exploration count
    incrementDailyExploration(userId);

    const { location, encounter, narrative } = result;

    // Generate AI narrative for the location entry
    const locationNarrative = await narrate(
      interaction.guildId,
      `${location.ai_prompt} An adventurer enters this mystical place.`,
      `You enter ${location.name}. ${narrative.entry}`
    );

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
}