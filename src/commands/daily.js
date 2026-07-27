import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getDailyState, claimDaily } from '../daily.js';

export const data = new SlashCommandBuilder()
  .setName('daily')
  .setDescription('Claim your daily reward or check your streak')
  .addSubcommand(sub => sub.setName('claim').setDescription('Claim today\'s daily reward'))
  .addSubcommand(sub => sub.setName('status').setDescription('Check your daily streak and reward progress'))
  .addSubcommand(sub => sub.setName('leaderboard').setDescription('View top daily streak leaders'));

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: false });
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  try {
    switch (sub) {
      case 'claim': return await claimReward(interaction, userId);
      case 'status': return await showStatus(interaction, userId);
      case 'leaderboard': return await showLeaderboard(interaction);
    }
  } catch (err) {
    try { await interaction.editReply({ content: '❌ Something went wrong.' }); } catch {}
  }
}

async function claimReward(i, uid) {
  const state = getDailyState(uid);

  if (state.claimedToday) {
    return await i.editReply({
      content: `🎁 You already claimed today's reward! Come back tomorrow.\n\n🔥 Current streak: **${state.streak}** days`,
    });
  }

  const result = await claimDaily(uid);
  if (!result.success) {
    return await i.editReply({ content: result.message || 'Failed to claim reward.' });
  }

  const embed = new EmbedBuilder()
    .setTitle('🎁 Daily Reward Claimed!')
    .setColor(0x57F287)
    .setDescription(result.message)
    .addFields(
      { name: '🔥 Streak', value: `${result.streak} days`, inline: true },
      { name: '💎 XP Earned', value: `+${result.reward.xp}`, inline: true },
      { name: '💰 Gold Earned', value: `+${result.reward.gold}`, inline: true },
    )
    .setTimestamp();

  await i.editReply({ embeds: [embed] });
}

async function showStatus(i, uid) {
  const state = getDailyState(uid);
  const next = state.nextReward;

  const timeLeft = !state.claimedToday ? getTimeUntilReset() : '';

  const embed = new EmbedBuilder()
    .setTitle('📊 Daily Reward Status')
    .setColor(state.claimedToday ? 0x57F287 : 0xFFAA00)
    .setDescription(
      state.claimedToday
        ? `✅ You've claimed today's reward!`
        : `⏰ Ready to claim! Your next streak will be **${state.streak + 1}** days.`,
    )
    .addFields(
      { name: '🔥 Current Streak', value: `${state.streak} day${state.streak === 1 ? '' : 's'}`, inline: true },
      { name: state.claimedToday ? '✅ Claimed' : '❓ Next Reward', value: timeLeft || `+${next.xp} XP, +${next.gold} Gold`, inline: true },
    )
    .setTimestamp();

  await i.editReply({ embeds: [embed] });
}

async function showLeaderboard(i) {
  try {
    const { getDailyLeaderboard } = await import('../daily.js');
    const leaders = getDailyLeaderboard(10);

    if (leaders.length === 0) {
      return await i.editReply({ content: 'No daily streak data yet! Be the first to claim your daily reward.' });
    }

    const entries = leaders.slice(0, 10).map((d, idx) => {
      const medals = ['🥇', '🥈', '🥉'];
      const prefix = medals[idx] || `${idx + 1}.`;
      return `${prefix} **${d.streak} days**`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setTitle('🏆 Daily Streak Leaderboard')
      .setColor(0xFFD700)
      .setDescription(entries)
      .setTimestamp();

    await i.editReply({ embeds: [embed] });
  } catch {
    await i.editReply({ content: '❌ Failed to load leaderboard.' });
  }
}

function getTimeUntilReset() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, 0);
  const diff = tomorrow - now;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `⏰ ${hours}h ${mins}m until reset`;
}
