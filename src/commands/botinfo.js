import { SlashCommandBuilder, EmbedBuilder, version as djsVersion } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('botinfo')
  .setDescription('Display statistics and information about Pulse Bot');

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  const client = interaction.client;
  const uptimeMs = process.uptime() * 1000;

  const days = Math.floor(uptimeMs / 86_400_000);
  const hours = Math.floor((uptimeMs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((uptimeMs % 3_600_000) / 60_000);
  const seconds = Math.floor((uptimeMs % 60_000) / 1000);

  const uptimeStr = [
    days > 0 ? `${days}d` : '',
    hours > 0 ? `${hours}h` : '',
    minutes > 0 ? `${minutes}m` : '',
    `${seconds}s`
  ].filter(Boolean).join(' ');

  const memoryUsage = process.memoryUsage();
  const heapUsedMB = (memoryUsage.heapUsed / 1024 / 1024).toFixed(1);
  const heapTotalMB = (memoryUsage.heapTotal / 1024 / 1024).toFixed(1);
  const rssMB = (memoryUsage.rss / 1024 / 1024).toFixed(1);

  const totalUsers = client.guilds.cache.reduce((total, guild) => total + guild.memberCount, 0);
  const totalChannels = client.channels.cache.size;
  const commandCount = client.commands?.size ?? 0;

  const pingMs = Math.round(client.ws.ping);
  const pingEmoji = pingMs < 100 ? '🟢' : pingMs < 200 ? '🟡' : '🔴';

  const embed = new EmbedBuilder()
    .setTitle(`⚡ Pulse Bot — Statistics`)
    .setColor(0x57_F2_87)
    .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
    .setDescription('The most advanced Discord bot, packed with RPG, economy, music, AI, and moderation features.')
    .addFields(
      { name: '⏰ Uptime', value: uptimeStr, inline: true },
      { name: `${pingEmoji} Ping`, value: `${pingMs}ms`, inline: true },
      { name: '📅 Bot Created', value: `<t:${Math.floor(client.user.createdTimestamp / 1000)}:R>`, inline: true },
      { name: '🏰 Servers', value: client.guilds.cache.size.toLocaleString(), inline: true },
      { name: '👥 Total Users', value: totalUsers.toLocaleString(), inline: true },
      { name: '📢 Channels', value: totalChannels.toLocaleString(), inline: true },
      { name: '⚙️ Commands', value: commandCount.toString(), inline: true },
      { name: '🧠 Memory', value: `${heapUsedMB}MB / ${heapTotalMB}MB heap\n${rssMB}MB RSS`, inline: true },
      { name: '⚙️ Node.js', value: process.version, inline: true },
      { name: '📦 discord.js', value: `v${djsVersion}`, inline: true },
      { name: '🖥️ Platform', value: `${process.platform} (${process.arch})`, inline: true },
      { name: '🆔 Bot ID', value: client.user.id, inline: true }
    )
    .setFooter({ text: 'Pulse Bot v3.0 • Built with ❤️' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
