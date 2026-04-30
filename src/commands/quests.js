/**
 * Daily quests and challenges system
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { readJSONSync, writeJSONSync } from '../utils/fileOperations.js';
import { logger } from '../logger.js';
import path from 'node:path';

const QUESTS_FILE = path.join(process.cwd(), 'data', 'daily_quests.json');

// Quest types and definitions
const QUEST_TYPES = {
  MESSAGE_COUNT: {
    id: 'message_count',
    name: 'Chatterbox',
    description: 'Send {target} messages',
    rewardGold: 50,
    rewardXp: 100,
    icon: '💬'
  },
  VOICE_TIME: {
    id: 'voice_time',
    name: 'Voice Champion',
    description: 'Spend {target} minutes in voice chat',
    rewardGold: 75,
    rewardXp: 150,
    icon: '🎙️'
  },
  COMMANDS_USED: {
    id: 'commands_used',
    name: 'Command Master',
    description: 'Use {target} different commands',
    rewardGold: 60,
    rewardXp: 120,
    icon: '⚡'
  },
  REACTIONS_GIVEN: {
    id: 'reactions_given',
    name: 'Reactor',
    description: 'React to {target} messages',
    rewardGold: 40,
    rewardXp: 80,
    icon: '👍'
  },
  GAMES_WON: {
    id: 'games_won',
    name: 'Game Winner',
    description: 'Win {target} mini-games',
    rewardGold: 100,
    rewardXp: 200,
    icon: '🎮'
  },
  HELP_OTHERS: {
    id: 'help_others',
    name: 'Helper',
    description: 'Help {target} other users',
    rewardGold: 80,
    rewardXp: 160,
    icon: '🤝'
  }
};

/**
 * Load quests data
 */
function loadQuests() {
  return readJSONSync(QUESTS_FILE, { users: {}, lastReset: Date.now() });
}

/**
 * Save quests data
 */
function saveQuests(data) {
  return writeJSONSync(QUESTS_FILE, data);
}

/**
 * Check if daily reset is needed
 */
function needsDailyReset(lastReset) {
  const now = Date.now();
  const dayInMs = 24 * 60 * 60 * 1000;
  return (now - lastReset) >= dayInMs;
}

/**
 * Generate daily quests for a user
 */
function generateDailyQuests(userId) {
  const questTypes = Object.values(QUEST_TYPES);
  const selected = [];
  
  // Select 3 random quests
  const shuffled = questTypes.sort(() => 0.5 - Math.random());
  for (let i = 0; i < 3 && i < shuffled.length; i++) {
    const questType = shuffled[i];
    const target = Math.floor(Math.random() * 5) + 3; // 3-7 target
    
    selected.push({
      id: `${questType.id}_${Date.now()}_${i}`,
      type: questType.id,
      name: questType.name,
      description: questType.description.replace('{target}', target.toString()),
      target,
      progress: 0,
      completed: false,
      rewardGold: questType.rewardGold,
      rewardXp: questType.rewardXp,
      icon: questType.icon,
      assignedAt: Date.now()
    });
  }
  
  return selected;
}

/**
 * Reset user quests if needed
 */
function resetUserQuestsIfNeeded(data, userId) {
  if (!data.users[userId]) {
    data.users[userId] = {
      quests: generateDailyQuests(userId),
      lastReset: Date.now(),
      streak: 0,
      totalCompleted: 0
    };
    return true;
  }
  
  if (needsDailyReset(data.users[userId].lastReset)) {
    const allCompleted = data.users[userId].quests.every(q => q.completed);
    
    data.users[userId].quests = generateDailyQuests(userId);
    data.users[userId].lastReset = Date.now();
    
    // Update streak
    if (allCompleted) {
      data.users[userId].streak = (data.users[userId].streak || 0) + 1;
    } else {
      data.users[userId].streak = 0;
    }
    
    return true;
  }
  
  return false;
}

/**
 * Create quest embed
 */
function createQuestEmbed(userQuests, userId) {
  const embed = new EmbedBuilder()
    .setTitle('📜 Daily Quests')
    .setDescription('Complete quests to earn gold and XP!')
    .setColor(0xFFD700)
    .setTimestamp();
  
  const completed = userQuests.quests.filter(q => q.completed).length;
  const total = userQuests.quests.length;
  
  embed.addFields({
    name: '📊 Progress',
    value: `${completed}/${total} quests completed\n🔥 Current streak: ${userQuests.streak || 0} days\n✅ Total completed: ${userQuests.totalCompleted || 0}`,
    inline: false
  });
  
  for (const quest of userQuests.quests) {
    const progressBar = createProgressBar(quest.progress, quest.target);
    const status = quest.completed ? '✅' : '⏳';
    
    embed.addFields({
      name: `${status} ${quest.icon} ${quest.name}`,
      value: [
        quest.description,
        progressBar,
        quest.completed 
          ? `**Completed!** Reward: ${quest.rewardGold} gold, ${quest.rewardXp} XP`
          : `Reward: ${quest.rewardGold} gold, ${quest.rewardXp} XP`
      ].join('\n'),
      inline: false
    });
  }
  
  // Time until reset
  const nextReset = userQuests.lastReset + (24 * 60 * 60 * 1000);
  const remaining = nextReset - Date.now();
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  
  embed.setFooter({ text: `Resets in ${hours}h ${minutes}m` });
  
  return embed;
}

/**
 * Create progress bar
 */
function createProgressBar(current, total, length = 10) {
  const percentage = Math.min(current / total, 1);
  const filled = Math.floor(percentage * length);
  const empty = length - filled;
  
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${current}/${total}`;
}

export const data = new SlashCommandBuilder()
  .setName('quests')
  .setDescription('View and manage your daily quests')
  .addSubcommand(subcommand =>
    subcommand
      .setName('view')
      .setDescription('View your current daily quests'))
  .addSubcommand(subcommand =>
    subcommand
      .setName('claim')
      .setDescription('Claim rewards from completed quests')
      .addIntegerOption(option =>
        option
          .setName('quest_number')
          .setDescription('Quest number to claim (1-3)')
          .setMinValue(1)
          .setMaxValue(3)
          .setRequired(true)))
  .addSubcommand(subcommand =>
    subcommand
      .setName('leaderboard')
      .setDescription('View the quest completion leaderboard'));

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  
  try {
    if (subcommand === 'view') {
      await handleView(interaction);
    } else if (subcommand === 'claim') {
      await handleClaim(interaction);
    } else if (subcommand === 'leaderboard') {
      await handleLeaderboard(interaction);
    }
  } catch (error) {
    logger.error('Quests command error', error, { subcommand });
    const errorMsg = 'An error occurred while processing the quests command.';
    
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(errorMsg);
    } else {
      await interaction.reply({ content: errorMsg, ephemeral: true });
    }
  }
}

/**
 * Handle view subcommand
 */
async function handleView(interaction) {
  const userId = interaction.user.id;
  const data = loadQuests();
  
  resetUserQuestsIfNeeded(data, userId);
  saveQuests(data);
  
  const userQuests = data.users[userId];
  const embed = createQuestEmbed(userQuests, userId);
  
  await interaction.reply({ embeds: [embed] });
}

/**
 * Handle claim subcommand
 */
async function handleClaim(interaction) {
  const userId = interaction.user.id;
  const questNumber = interaction.options.getInteger('quest_number');
  const data = loadQuests();
  
  resetUserQuestsIfNeeded(data, userId);
  
  const userQuests = data.users[userId];
  const quest = userQuests.quests[questNumber - 1];
  
  if (!quest) {
    await interaction.reply({ content: 'Invalid quest number.', ephemeral: true });
    return;
  }
  
  if (!quest.completed) {
    await interaction.reply({ 
      content: `This quest is not completed yet. Progress: ${quest.progress}/${quest.target}`, 
      ephemeral: true 
    });
    return;
  }
  
  if (quest.claimed) {
    await interaction.reply({ content: 'You have already claimed this quest reward.', ephemeral: true });
    return;
  }
  
  await interaction.deferReply();
  
  // Award rewards (integrate with economy and RPG systems)
  quest.claimed = true;
  userQuests.totalCompleted = (userQuests.totalCompleted || 0) + 1;
  saveQuests(data);
  
  // Try to award to economy/RPG
  try {
    const { addGold } = await import('../economy.js');
    const { applyXp, readCharacter } = await import('../rpg.js');
    
    // Add gold
    await addGold(userId, quest.rewardGold);
    
    // Add XP
    const char = readCharacter(userId);
    if (char) {
      applyXp(userId, char, quest.rewardXp);
    }
    
    await interaction.editReply({
      content: `✅ Quest completed! You earned **${quest.rewardGold} gold** and **${quest.rewardXp} XP**!`,
      embeds: [createQuestEmbed(userQuests, userId)]
    });
  } catch (error) {
    logger.error('Failed to award quest rewards', error);
    await interaction.editReply({
      content: `✅ Quest marked as claimed! (Note: Could not integrate with economy/RPG systems)`,
      embeds: [createQuestEmbed(userQuests, userId)]
    });
  }
}

/**
 * Handle leaderboard subcommand
 */
async function handleLeaderboard(interaction) {
  const data = loadQuests();
  
  const users = Object.entries(data.users)
    .map(([userId, userQuests]) => ({
      userId,
      totalCompleted: userQuests.totalCompleted || 0,
      streak: userQuests.streak || 0
    }))
    .sort((a, b) => b.totalCompleted - a.totalCompleted)
    .slice(0, 10);
  
  const embed = new EmbedBuilder()
    .setTitle('🏆 Quest Leaderboard')
    .setDescription('Top 10 quest completers')
    .setColor(0xFFD700)
    .setTimestamp();
  
  if (users.length === 0) {
    embed.setDescription('No quest data available yet.');
  } else {
    const leaderboardText = users
      .map((user, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        return `${medal} <@${user.userId}> - ${user.totalCompleted} quests (🔥 ${user.streak} day streak)`;
      })
      .join('\n');
    
    embed.addFields({
      name: 'Rankings',
      value: leaderboardText,
      inline: false
    });
  }
  
  await interaction.reply({ embeds: [embed] });
}

/**
 * Update quest progress
 * This function should be called from various parts of the bot
 */
export function updateQuestProgress(userId, questType, amount = 1) {
  try {
    const data = loadQuests();
    
    if (!data.users[userId]) {
      resetUserQuestsIfNeeded(data, userId);
    }
    
    const userQuests = data.users[userId];
    let updated = false;
    
    for (const quest of userQuests.quests) {
      if (quest.type === questType && !quest.completed) {
        quest.progress = Math.min(quest.progress + amount, quest.target);
        
        if (quest.progress >= quest.target) {
          quest.completed = true;
          logger.info('Quest completed', { userId, questId: quest.id, questName: quest.name });
        }
        
        updated = true;
      }
    }
    
    if (updated) {
      saveQuests(data);
    }
  } catch (error) {
    logger.error('Failed to update quest progress', error, { userId, questType, amount });
  }
}
