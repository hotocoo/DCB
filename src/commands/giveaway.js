import { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';

import { safeExecuteCommand, validateGuild, validatePermissions, CommandError } from '../errorHandler.js';

/**
 * Active giveaways stored in-memory.
 * @type {Map<string, object>}
 */
const activeGiveaways = new Map();

/**
 * Formats a duration string (e.g. "1h30m") into milliseconds.
 * @param {string} duration
 * @returns {number|null} milliseconds, or null if invalid
 */
function parseDuration(duration) {
  const regex = /^(\d+d)?(\d+h)?(\d+m)?(\d+s)?$/i;
  if (!regex.test(duration) || duration === '') return null;

  let ms = 0;
  const days = duration.match(/(\d+)d/i);
  const hours = duration.match(/(\d+)h/i);
  const minutes = duration.match(/(\d+)m/i);
  const seconds = duration.match(/(\d+)s/i);

  if (days) ms += parseInt(days[1]) * 86_400_000;
  if (hours) ms += parseInt(hours[1]) * 3_600_000;
  if (minutes) ms += parseInt(minutes[1]) * 60_000;
  if (seconds) ms += parseInt(seconds[1]) * 1_000;

  return ms > 0 ? ms : null;
}

export const data = new SlashCommandBuilder()
  .setName('giveaway')
  .setDescription('Manage giveaways')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(sub =>
    sub
      .setName('start')
      .setDescription('Start a new giveaway')
      .addStringOption(opt => opt.setName('prize').setDescription('What are you giving away?').setRequired(true).setMaxLength(200))
      .addStringOption(opt => opt.setName('duration').setDescription('Duration (e.g. 1h, 30m, 1d). Max 7 days.').setRequired(true))
      .addIntegerOption(opt => opt.setName('winners').setDescription('Number of winners (default: 1)').setMinValue(1).setMaxValue(20))
  )
  .addSubcommand(sub =>
    sub
      .setName('end')
      .setDescription('End a giveaway early and pick winner(s)')
      .addStringOption(opt => opt.setName('id').setDescription('Giveaway message ID').setRequired(true))
  )
  .addSubcommand(sub =>
    sub
      .setName('reroll')
      .setDescription('Reroll winner(s) for a finished giveaway')
      .addStringOption(opt => opt.setName('id').setDescription('Giveaway message ID').setRequired(true))
  )
  .addSubcommand(sub =>
    sub
      .setName('list')
      .setDescription('List all active giveaways in this server')
  );

/**
 * Picks random winners from a list of entries.
 * @param {string[]} entries
 * @param {number} count
 * @returns {string[]}
 */
function pickWinners(entries, count) {
  const shuffled = [...entries].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

/**
 * Builds a giveaway embed.
 * @param {object} giveaway
 * @returns {EmbedBuilder}
 */
function buildGiveawayEmbed(giveaway) {
  const now = Date.now();
  const remaining = giveaway.endsAt - now;
  const ended = remaining <= 0;

  const embed = new EmbedBuilder()
    .setTitle('🎉 GIVEAWAY 🎉')
    .setDescription(`**Prize:** ${giveaway.prize}\n\nClick the button below to enter!\n\n**Entries:** ${giveaway.entries.length}\n**Winners:** ${giveaway.winnerCount}`)
    .setColor(ended ? 0x36393f : 0xff6b35)
    .addFields(
      { name: ended ? '⏰ Ended' : '⏰ Ends', value: `<t:${Math.floor(giveaway.endsAt / 1000)}:R>`, inline: true },
      { name: '🎟️ Entries', value: `${giveaway.entries.length}`, inline: true },
      { name: '🏆 Winners', value: `${giveaway.winnerCount}`, inline: true },
    )
    .setFooter({ text: `Hosted by ${giveaway.hostTag} • ID: ${giveaway.messageId ?? 'Pending'}` })
    .setTimestamp(giveaway.endsAt);

  return embed;
}

/**
 * Executes the giveaway command.
 * @param {object} interaction - Discord interaction object
 */
export async function execute(interaction) {
  return safeExecuteCommand(interaction, async () => {
    validateGuild(interaction);

    const sub = interaction.options.getSubcommand();

    if (sub === 'start') {
      const prize = interaction.options.getString('prize');
      const durationStr = interaction.options.getString('duration');
      const winnerCount = interaction.options.getInteger('winners') ?? 1;

      const durationMs = parseDuration(durationStr);
      if (!durationMs) {
        throw new CommandError('Invalid duration format. Use combinations like `1h`, `30m`, `1d`, `2h30m`.', 'INVALID_ARGUMENT');
      }

      const MAX_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
      if (durationMs > MAX_DURATION) {
        throw new CommandError('Duration cannot exceed 7 days.', 'INVALID_ARGUMENT');
      }

      const endsAt = Date.now() + durationMs;
      const giveaway = {
        prize,
        endsAt,
        winnerCount,
        entries: [],
        hostId: interaction.user.id,
        hostTag: interaction.user.tag,
        guildId: interaction.guild.id,
        channelId: interaction.channel.id,
        messageId: null,
        active: true,
      };

      const enterButton = new ButtonBuilder()
        .setCustomId('giveaway_enter')
        .setLabel('🎉 Enter Giveaway')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(enterButton);
      const embed = buildGiveawayEmbed(giveaway);

      const reply = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
      giveaway.messageId = reply.id;
      activeGiveaways.set(reply.id, giveaway);

      // Auto-end the giveaway after the duration
      setTimeout(async () => {
        const gaw = activeGiveaways.get(reply.id);
        if (!gaw || !gaw.active) return;
        await endGiveaway(reply.id, interaction.channel);
      }, durationMs);

    } else if (sub === 'end') {
      const messageId = interaction.options.getString('id');
      const giveaway = activeGiveaways.get(messageId);

      if (!giveaway) {
        throw new CommandError('No active giveaway found with that ID.', 'NOT_FOUND');
      }
      if (giveaway.guildId !== interaction.guild.id) {
        throw new CommandError('That giveaway is not in this server.', 'PERMISSION_DENIED');
      }

      await endGiveaway(messageId, interaction.channel);
      await interaction.reply({ content: '✅ Giveaway ended!', flags: MessageFlags.Ephemeral });

    } else if (sub === 'reroll') {
      const messageId = interaction.options.getString('id');
      const giveaway = activeGiveaways.get(messageId);

      if (!giveaway) {
        throw new CommandError('Giveaway not found. It may have expired from memory.', 'NOT_FOUND');
      }
      if (giveaway.active) {
        throw new CommandError('The giveaway is still active. End it first.', 'INVALID_ARGUMENT');
      }

      if (giveaway.entries.length === 0) {
        await interaction.reply({ content: '❌ No one entered this giveaway.', flags: MessageFlags.Ephemeral });
        return;
      }

      const winners = pickWinners(giveaway.entries, giveaway.winnerCount);
      const winnerMentions = winners.map(id => `<@${id}>`).join(', ');

      await interaction.reply({
        content: `🎉 **Giveaway Reroll!** New winner(s): ${winnerMentions}\n🏆 Prize: **${giveaway.prize}**`,
      });

    } else if (sub === 'list') {
      const serverGiveaways = [...activeGiveaways.values()].filter(
        g => g.guildId === interaction.guild.id && g.active
      );

      if (serverGiveaways.length === 0) {
        await interaction.reply({ content: '📭 No active giveaways in this server.', flags: MessageFlags.Ephemeral });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('🎉 Active Giveaways')
        .setColor(0xff6b35)
        .setDescription(
          serverGiveaways.map(g =>
            `**${g.prize}** — Ends <t:${Math.floor(g.endsAt / 1000)}:R> — ${g.entries.length} entries — ID: \`${g.messageId}\``
          ).join('\n')
        );

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  });
}

/**
 * Ends a giveaway and announces winners.
 * @param {string} messageId
 * @param {object} channel
 */
async function endGiveaway(messageId, channel) {
  const giveaway = activeGiveaways.get(messageId);
  if (!giveaway || !giveaway.active) return;

  giveaway.active = false;

  const endedEmbed = new EmbedBuilder()
    .setTitle('🎉 GIVEAWAY ENDED 🎉')
    .setDescription(`**Prize:** ${giveaway.prize}`)
    .setColor(0x36393f)
    .addFields(
      { name: '🎟️ Total Entries', value: `${giveaway.entries.length}`, inline: true },
      { name: '🏆 Winners', value: `${giveaway.winnerCount}`, inline: true },
    )
    .setFooter({ text: `Hosted by ${giveaway.hostTag}` })
    .setTimestamp();

  let resultMessage = '';
  if (giveaway.entries.length === 0) {
    endedEmbed.addFields({ name: '🎟️ Result', value: 'No one entered the giveaway.' });
    resultMessage = '😢 No one entered the giveaway. No winners.';
  } else {
    const winners = pickWinners(giveaway.entries, giveaway.winnerCount);
    const winnerMentions = winners.map(id => `<@${id}>`).join(', ');
    endedEmbed.addFields({ name: '🏆 Winner(s)', value: winnerMentions });
    resultMessage = `🎉 Congratulations ${winnerMentions}! You won **${giveaway.prize}**!`;
  }

  try {
    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (message) {
      await message.edit({ embeds: [endedEmbed], components: [] });
    }
  } catch {
    // Message may have been deleted
  }

  await channel.send(resultMessage);
}

/**
 * Handles giveaway button interactions.
 * @param {object} interaction - Discord button interaction
 */
export async function handleGiveawayButton(interaction) {
  if (!interaction.isButton() || interaction.customId !== 'giveaway_enter') return;

  const messageId = interaction.message.id;
  const giveaway = activeGiveaways.get(messageId);

  if (!giveaway || !giveaway.active) {
    await interaction.reply({ content: '❌ This giveaway has already ended.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (giveaway.entries.includes(interaction.user.id)) {
    await interaction.reply({ content: '✅ You are already entered in this giveaway!', flags: MessageFlags.Ephemeral });
    return;
  }

  giveaway.entries.push(interaction.user.id);

  const updatedEmbed = buildGiveawayEmbed(giveaway);
  await interaction.update({ embeds: [updatedEmbed] });
}

export { activeGiveaways };
