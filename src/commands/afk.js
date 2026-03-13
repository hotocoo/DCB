import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';

import { safeExecuteCommand } from '../errorHandler.js';

/**
 * AFK status storage.
 * @type {Map<string, {reason: string, since: number}>}
 */
const afkUsers = new Map();

export const data = new SlashCommandBuilder()
  .setName('afk')
  .setDescription('Set your AFK status or check if someone is AFK')
  .addSubcommand(sub =>
    sub
      .setName('set')
      .setDescription('Set yourself as AFK')
      .addStringOption(opt =>
        opt
          .setName('reason')
          .setDescription('Why are you going AFK? (optional)')
          .setMaxLength(150)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('remove')
      .setDescription('Remove your AFK status')
  )
  .addSubcommand(sub =>
    sub
      .setName('check')
      .setDescription('Check if a user is AFK')
      .addUserOption(opt => opt.setName('user').setDescription('User to check').setRequired(true))
  );

/**
 * Executes the AFK command.
 * @param {object} interaction - Discord interaction object
 */
export async function execute(interaction) {
  return safeExecuteCommand(interaction, async () => {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === 'set') {
      const reason = interaction.options.getString('reason') ?? 'No reason provided';
      afkUsers.set(userId, { reason, since: Date.now() });

      const embed = new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle('💤 AFK Status Set')
        .setDescription(`You are now AFK.\n**Reason:** ${reason}`)
        .setFooter({ text: `You'll be marked as back when you send a message.` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

    } else if (sub === 'remove') {
      if (!afkUsers.has(userId)) {
        await interaction.reply({ content: '❌ You are not currently AFK.', flags: MessageFlags.Ephemeral });
        return;
      }

      afkUsers.delete(userId);
      await interaction.reply({ content: '✅ Your AFK status has been removed.', flags: MessageFlags.Ephemeral });

    } else if (sub === 'check') {
      const target = interaction.options.getUser('user');
      const status = afkUsers.get(target.id);

      if (!status) {
        await interaction.reply({ content: `✅ **${target.username}** is not AFK.`, flags: MessageFlags.Ephemeral });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle(`💤 ${target.username} is AFK`)
        .addFields(
          { name: '📝 Reason', value: status.reason, inline: false },
          { name: '⏰ Since', value: `<t:${Math.floor(status.since / 1000)}:R>`, inline: true },
        )
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  });
}

/**
 * Gets the AFK status of a user.
 * @param {string} userId
 * @returns {{reason: string, since: number}|undefined}
 */
export function getAfkStatus(userId) {
  return afkUsers.get(userId);
}

/**
 * Removes AFK status for a user (called when they send a message).
 * @param {string} userId
 * @returns {boolean} true if they were AFK
 */
export function clearAfkStatus(userId) {
  if (afkUsers.has(userId)) {
    afkUsers.delete(userId);
    return true;
  }
  return false;
}

export { afkUsers };
