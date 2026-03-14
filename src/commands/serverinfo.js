import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('serverinfo')
  .setDescription('Displays information about the current server');

export async function execute(interaction) {
  try {
    const guild = interaction.guild;
    if (!guild) {
      return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    }

    await guild.fetch();
    const owner = await guild.fetchOwner();

    const textChannels = guild.channels.cache.filter(c => c.type === 0).size;
    const voiceChannels = guild.channels.cache.filter(c => c.type === 2).size;
    const categories = guild.channels.cache.filter(c => c.type === 4).size;

    const features = guild.features.length > 0
      ? guild.features.slice(0, 10).map(f => `\`${f}\``).join(', ')
      : 'None';

    const createdAt = `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`;

    const embed = new EmbedBuilder()
      .setTitle(guild.name)
      .setColor(0x0099FF)
      .setThumbnail(guild.iconURL({ size: 256 }))
      .addFields(
        { name: '🆔 Server ID', value: guild.id, inline: true },
        { name: '👑 Owner', value: `${owner.user.tag}`, inline: true },
        { name: '📅 Created', value: createdAt, inline: false },
        { name: '👥 Members', value: `Total: **${guild.memberCount}**`, inline: true },
        { name: '🤖 Bots', value: `**${guild.members.cache.filter(m => m.user.bot).size}**`, inline: true },
        { name: '💬 Channels', value: `Text: **${textChannels}** | Voice: **${voiceChannels}** | Categories: **${categories}**`, inline: false },
        { name: '🎭 Roles', value: `**${guild.roles.cache.size}**`, inline: true },
        { name: '🚀 Boost Level', value: `Level **${guild.premiumTier}** (${guild.premiumSubscriptionCount} boosts)`, inline: true },
        { name: '✨ Features', value: features, inline: false },
      )
      .setFooter({ text: `Server Info` })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  } catch (error) {
    const errEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('Error')
      .setDescription(`Failed to fetch server info: ${error.message}`);
    return interaction.reply({ embeds: [errEmbed], ephemeral: true });
  }
}
