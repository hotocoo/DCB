import { SlashCommandBuilder, EmbedBuilder, MessageFlags, Events } from 'discord.js';

/**
 * In-memory store for recently deleted messages, keyed by channel ID.
 * Stores up to 5 deleted messages per channel and clears after 5 minutes.
 * @type {Map<string, Array<{author: {id: string, tag: string, avatarURL: string}, content: string, deletedAt: number, attachments: string[]}>>}
 */
export const sniped = new Map();

const SNIPE_LIMIT = 5;
const SNIPE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Registers the messageDelete listener on the client.
 * Call this once when the bot starts.
 * @param {import('discord.js').Client} client
 */
export function registerSnipeListener(client) {
  client.on(Events.MessageDelete, (message) => {
    // Ignore bot messages and messages without content or author
    if (!message.author || message.author.bot) return;
    if (!message.content && message.attachments.size === 0) return;

    const channelId = message.channelId;
    const existing = sniped.get(channelId) ?? [];

    existing.unshift({
      author: {
        id: message.author.id,
        tag: message.author.tag,
        avatarURL: message.author.displayAvatarURL({ size: 64 })
      },
      content: message.content || '',
      deletedAt: Date.now(),
      attachments: [...message.attachments.values()].map(a => a.proxyURL)
    });

    // Keep only latest SNIPE_LIMIT messages per channel
    sniped.set(channelId, existing.slice(0, SNIPE_LIMIT));

    // Auto-clean after TTL
    setTimeout(() => {
      const current = sniped.get(channelId);
      if (current) {
        const fresh = current.filter(s => Date.now() - s.deletedAt < SNIPE_TTL_MS);
        if (fresh.length === 0) {
          sniped.delete(channelId);
        }
        else {
          sniped.set(channelId, fresh);
        }
      }
    }, SNIPE_TTL_MS);
  });
}

export const data = new SlashCommandBuilder()
  .setName('snipe')
  .setDescription('Show recently deleted messages in this channel')
  .addIntegerOption(option =>
    option.setName('index')
      .setDescription('Which deleted message to show (1 = most recent, default: 1)')
      .setMinValue(1)
      .setMaxValue(SNIPE_LIMIT)
      .setRequired(false));

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  const index = (interaction.options.getInteger('index') ?? 1) - 1;
  const channelSnipes = sniped.get(interaction.channelId);

  // Filter to only messages within TTL
  const validSnipes = channelSnipes?.filter(s => Date.now() - s.deletedAt < SNIPE_TTL_MS) ?? [];

  if (validSnipes.length === 0) {
    return interaction.reply({
      content: '🔍 No recently deleted messages found in this channel.',
      flags: MessageFlags.Ephemeral
    });
  }

  if (index >= validSnipes.length) {
    return interaction.reply({
      content: `🔍 Only ${validSnipes.length} deleted message(s) available. Use a lower index.`,
      flags: MessageFlags.Ephemeral
    });
  }

  const snipe = validSnipes[index];
  const timeAgo = Math.floor((Date.now() - snipe.deletedAt) / 1000);
  const timeStr = timeAgo < 60 ? `${timeAgo}s ago` : `${Math.floor(timeAgo / 60)}m ago`;

  const embed = new EmbedBuilder()
    .setAuthor({ name: snipe.author.tag, iconURL: snipe.author.avatarURL })
    .setColor(0xFF_66_66)
    .setTimestamp(snipe.deletedAt)
    .setFooter({ text: `Deleted ${timeStr} • Message ${index + 1}/${validSnipes.length} • Requested by ${interaction.user.username}` });

  if (snipe.content) {
    embed.setDescription(snipe.content.length > 4096 ? `${snipe.content.slice(0, 4093)}...` : snipe.content);
  }
  else {
    embed.setDescription('*(no text content)*');
  }

  if (snipe.attachments.length > 0) {
    embed.setImage(snipe.attachments[0]);
    if (snipe.attachments.length > 1) {
      embed.addFields({ name: '🖼️ Attachments', value: snipe.attachments.map((a, i) => `[Attachment ${i + 1}](${a})`).join('\n'), inline: false });
    }
  }

  await interaction.reply({ embeds: [embed] });
}
