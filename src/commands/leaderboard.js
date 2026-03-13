import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';

import { safeExecuteCommand, CommandError } from '../errorHandler.js';
import { getBalance } from '../economy.js';
import { getCharacter } from '../rpg.js';

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('Show server leaderboards')
  .addSubcommand(sub =>
    sub
      .setName('economy')
      .setDescription('Top users by balance')
      .addIntegerOption(opt => opt.setName('page').setDescription('Page number').setMinValue(1))
  )
  .addSubcommand(sub =>
    sub
      .setName('rpg')
      .setDescription('Top RPG characters by level')
      .addIntegerOption(opt => opt.setName('page').setDescription('Page number').setMinValue(1))
  );

const PAGE_SIZE = 10;

/**
 * Executes the leaderboard command.
 * @param {object} interaction - Discord interaction object
 */
export async function execute(interaction) {
  return safeExecuteCommand(interaction, async () => {
    const sub = interaction.options.getSubcommand();
    const page = interaction.options.getInteger('page') ?? 1;

    await interaction.deferReply();

    if (sub === 'economy') {
      await showEconomyLeaderboard(interaction, page);
    } else if (sub === 'rpg') {
      await showRpgLeaderboard(interaction, page);
    }
  });
}

/**
 * Shows the economy leaderboard.
 * @param {object} interaction
 * @param {number} page
 */
async function showEconomyLeaderboard(interaction, page) {
  const { getEconomyLeaderboard } = await import('../economy.js');

  let entries;
  try {
    entries = getEconomyLeaderboard(PAGE_SIZE * page);
  } catch {
    entries = [];
  }

  if (!entries || entries.length === 0) {
    await interaction.editReply({ content: '📭 No economy data available yet.' });
    return;
  }

  const startIdx = (page - 1) * PAGE_SIZE;
  const pageEntries = entries.slice(startIdx, startIdx + PAGE_SIZE);

  if (pageEntries.length === 0) {
    await interaction.editReply({ content: `📭 No entries on page ${page}.` });
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];
  const lines = await Promise.all(
    pageEntries.map(async (entry, i) => {
      const rank = startIdx + i + 1;
      const medal = medals[rank - 1] ?? `**${rank}.**`;
      let username = entry.userId;
      try {
        const user = await interaction.client.users.fetch(entry.userId);
        username = user.username;
      } catch {
        // fallback to ID
      }
      return `${medal} **${username}** — 💰 ${entry.balance.toLocaleString()} coins`;
    })
  );

  const embed = new EmbedBuilder()
    .setTitle('💰 Economy Leaderboard')
    .setColor(0xffd700)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Page ${page} • Top ${entries.length} users` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Shows the RPG leaderboard.
 * @param {object} interaction
 * @param {number} page
 */
async function showRpgLeaderboard(interaction, page) {
  const { getLeaderboard, getLeaderboardCount } = await import('../rpg.js');

  let entries;
  let total;
  try {
    entries = getLeaderboard(PAGE_SIZE, (page - 1) * PAGE_SIZE);
    total = getLeaderboardCount();
  } catch {
    entries = [];
    total = 0;
  }

  if (!entries || entries.length === 0) {
    await interaction.editReply({ content: '📭 No RPG characters found yet.' });
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];
  const lines = await Promise.all(
    entries.map(async (entry, i) => {
      const rank = (page - 1) * PAGE_SIZE + i + 1;
      const medal = medals[rank - 1] ?? `**${rank}.**`;
      let username = entry.userId;
      try {
        const user = await interaction.client.users.fetch(entry.userId);
        username = user.username;
      } catch {
        // fallback to ID
      }
      const classEmoji = { warrior: '⚔️', mage: '🔮', rogue: '🗡️', archer: '🏹', healer: '💚' }[entry.class] ?? '🎮';
      return `${medal} ${classEmoji} **${username}** (${entry.name}) — Level ${entry.level} — ${entry.xp.toLocaleString()} XP`;
    })
  );

  const embed = new EmbedBuilder()
    .setTitle('⚔️ RPG Leaderboard')
    .setColor(0x9b59b6)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Page ${page} of ${Math.ceil(total / PAGE_SIZE)} • ${total} characters` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
