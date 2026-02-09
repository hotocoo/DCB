/**
 * Metrics command
 * @fileoverview Displays bot performance metrics and statistics
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { metrics } from '../utils/metrics.js';
import { logger } from '../logger.js';

export const data = new SlashCommandBuilder()
  .setName('metrics')
  .setDescription('View bot performance metrics and statistics')
  .addStringOption(option =>
    option.setName('type')
      .setDescription('Type of metrics to view')
      .addChoices(
        { name: 'Summary', value: 'summary' },
        { name: 'Commands', value: 'commands' },
        { name: 'API Calls', value: 'api' },
        { name: 'Database', value: 'database' },
        { name: 'Cache', value: 'cache' }
      ));

/**
 * Formats a number with appropriate units
 * @param {number} value - Value to format
 * @returns {string} Formatted value
 */
function formatNumber(value) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)}K`;
  }
  return value.toString();
}

/**
 * Formats duration in milliseconds
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${ms.toFixed(2)}ms`;
}

/**
 * Creates a summary embed
 * @param {Object} allMetrics - All metrics data
 * @returns {EmbedBuilder} Summary embed
 */
function createSummaryEmbed(allMetrics) {
  const summary = metrics.getSummary();
  const uptime = formatDuration(summary.uptime);

  const embed = new EmbedBuilder()
    .setTitle('📊 Bot Metrics Summary')
    .setColor(0x00_AA_FF)
    .setDescription(`Bot uptime: **${uptime}**`)
    .addFields(
      { name: 'Total Commands', value: formatNumber(summary.totalCommands), inline: true },
      { name: 'Total API Calls', value: formatNumber(summary.totalAPICalls), inline: true },
      { name: 'Total DB Operations', value: formatNumber(summary.totalDBOperations), inline: true }
    )
    .setTimestamp();

  return embed;
}

/**
 * Creates a commands metrics embed
 * @param {Object} allMetrics - All metrics data
 * @returns {EmbedBuilder} Commands embed
 */
function createCommandsEmbed(allMetrics) {
  const embed = new EmbedBuilder()
    .setTitle('⚡ Command Metrics')
    .setColor(0x00_AA_FF)
    .setTimestamp();

  const commandMetrics = Object.entries(allMetrics.counters)
    .filter(([key]) => key.includes('command_total'))
    .slice(0, 10);

  if (commandMetrics.length === 0) {
    embed.setDescription('No command metrics available yet.');
    return embed;
  }

  for (const [key, value] of commandMetrics) {
    const match = key.match(/command="([^"]+)"/);
    const commandName = match ? match[1] : 'unknown';
    const statusMatch = key.match(/status="([^"]+)"/);
    const status = statusMatch ? statusMatch[1] : 'unknown';
    
    embed.addFields({
      name: `/${commandName}`,
      value: `${status}: ${formatNumber(value)}`,
      inline: true
    });
  }

  return embed;
}

/**
 * Creates an API metrics embed
 * @param {Object} allMetrics - All metrics data
 * @returns {EmbedBuilder} API embed
 */
function createAPIEmbed(allMetrics) {
  const embed = new EmbedBuilder()
    .setTitle('🌐 API Call Metrics')
    .setColor(0x00_AA_FF)
    .setTimestamp();

  const apiMetrics = Object.entries(allMetrics.counters)
    .filter(([key]) => key.includes('api_call_total'))
    .slice(0, 10);

  if (apiMetrics.length === 0) {
    embed.setDescription('No API metrics available yet.');
    return embed;
  }

  for (const [key, value] of apiMetrics) {
    const match = key.match(/service="([^"]+)"/);
    const service = match ? match[1] : 'unknown';
    const statusMatch = key.match(/status="([^"]+)"/);
    const status = statusMatch ? statusMatch[1] : 'unknown';
    
    embed.addFields({
      name: service,
      value: `${status}: ${formatNumber(value)}`,
      inline: true
    });
  }

  // Add histogram data for API call durations
  const durationMetrics = Object.entries(allMetrics.histograms)
    .filter(([key]) => key.includes('api_call_duration'));

  if (durationMetrics.length > 0) {
    for (const [key, stats] of durationMetrics.slice(0, 3)) {
      const match = key.match(/service="([^"]+)"/);
      const service = match ? match[1] : 'unknown';
      
      embed.addFields({
        name: `${service} Response Time`,
        value: `Avg: ${formatDuration(stats.avg)} | P95: ${formatDuration(stats.p95)}`,
        inline: true
      });
    }
  }

  return embed;
}

/**
 * Creates a database metrics embed
 * @param {Object} allMetrics - All metrics data
 * @returns {EmbedBuilder} Database embed
 */
function createDatabaseEmbed(allMetrics) {
  const embed = new EmbedBuilder()
    .setTitle('💾 Database Metrics')
    .setColor(0x00_AA_FF)
    .setTimestamp();

  const dbMetrics = Object.entries(allMetrics.counters)
    .filter(([key]) => key.includes('db_operation_total'))
    .slice(0, 10);

  if (dbMetrics.length === 0) {
    embed.setDescription('No database metrics available yet.');
    return embed;
  }

  for (const [key, value] of dbMetrics) {
    const match = key.match(/operation="([^"]+)"/);
    const operation = match ? match[1] : 'unknown';
    const statusMatch = key.match(/status="([^"]+)"/);
    const status = statusMatch ? statusMatch[1] : 'unknown';
    
    embed.addFields({
      name: operation,
      value: `${status}: ${formatNumber(value)}`,
      inline: true
    });
  }

  // Add histogram data for DB operation durations
  const durationMetrics = Object.entries(allMetrics.histograms)
    .filter(([key]) => key.includes('db_operation_duration'));

  if (durationMetrics.length > 0) {
    for (const [key, stats] of durationMetrics.slice(0, 3)) {
      const match = key.match(/operation="([^"]+)"/);
      const operation = match ? match[1] : 'unknown';
      
      embed.addFields({
        name: `${operation} Duration`,
        value: `Avg: ${formatDuration(stats.avg)} | P95: ${formatDuration(stats.p95)}`,
        inline: true
      });
    }
  }

  return embed;
}

/**
 * Creates a cache metrics embed
 * @param {Object} allMetrics - All metrics data
 * @returns {EmbedBuilder} Cache embed
 */
function createCacheEmbed(allMetrics) {
  const embed = new EmbedBuilder()
    .setTitle('🗄️ Cache Metrics')
    .setColor(0x00_AA_FF)
    .setTimestamp();

  const cacheMetrics = Object.entries(allMetrics.counters)
    .filter(([key]) => key.includes('cache_access_total'));

  if (cacheMetrics.length === 0) {
    embed.setDescription('No cache metrics available yet.');
    return embed;
  }

  const cacheStats = {};
  for (const [key, value] of cacheMetrics) {
    const match = key.match(/cache="([^"]+)"/);
    const cache = match ? match[1] : 'unknown';
    const resultMatch = key.match(/result="([^"]+)"/);
    const result = resultMatch ? resultMatch[1] : 'unknown';
    
    if (!cacheStats[cache]) {
      cacheStats[cache] = { hit: 0, miss: 0 };
    }
    cacheStats[cache][result] = value;
  }

  for (const [cache, stats] of Object.entries(cacheStats)) {
    const total = stats.hit + stats.miss;
    const hitRate = total > 0 ? ((stats.hit / total) * 100).toFixed(1) : '0.0';
    
    embed.addFields({
      name: cache,
      value: `Hit Rate: ${hitRate}%\nHits: ${formatNumber(stats.hit)} | Misses: ${formatNumber(stats.miss)}`,
      inline: true
    });
  }

  return embed;
}

/**
 * Executes the metrics command
 * @param {import('discord.js').CommandInteraction} interaction - The interaction object
 */
export async function execute(interaction) {
  try {
    // Check if user has appropriate permissions (optional)
    if (!interaction.member.permissions.has('Administrator')) {
      await interaction.reply({
        content: '❌ You need Administrator permissions to view metrics.',
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply();

    const type = interaction.options.getString('type') || 'summary';
    const allMetrics = metrics.getMetrics();

    let embed;
    switch (type) {
      case 'summary':
        embed = createSummaryEmbed(allMetrics);
        break;
      case 'commands':
        embed = createCommandsEmbed(allMetrics);
        break;
      case 'api':
        embed = createAPIEmbed(allMetrics);
        break;
      case 'database':
        embed = createDatabaseEmbed(allMetrics);
        break;
      case 'cache':
        embed = createCacheEmbed(allMetrics);
        break;
      default:
        embed = createSummaryEmbed(allMetrics);
    }

    await interaction.editReply({ embeds: [embed] });

    logger.info('Metrics command executed', {
      user: interaction.user.tag,
      type
    });

  } catch (error) {
    logger.error('Failed to execute metrics command', error);
    
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Metrics Error')
      .setDescription('An error occurred while retrieving metrics.')
      .setColor(0xFF_00_00)
      .setTimestamp();

    if (interaction.deferred) {
      await interaction.editReply({ embeds: [errorEmbed] });
    } else {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
}
