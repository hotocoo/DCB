/**
 * System health and performance monitoring command
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { healthCheckManager } from '../utils/healthCheck.js';
import { performanceMonitor } from '../utils/performanceMonitor.js';
import { caches } from '../utils/cacheManager.js';
import { enhancedLogger } from '../utils/enhancedLogger.js';

export const data = new SlashCommandBuilder()
  .setName('health')
  .setDescription('View bot health and performance statistics')
  .addSubcommand(subcommand =>
    subcommand
      .setName('status')
      .setDescription('View overall bot health status'))
  .addSubcommand(subcommand =>
    subcommand
      .setName('performance')
      .setDescription('View detailed performance metrics'))
  .addSubcommand(subcommand =>
    subcommand
      .setName('cache')
      .setDescription('View cache statistics'))
  .addSubcommand(subcommand =>
    subcommand
      .setName('logs')
      .setDescription('View log file statistics'));

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  try {
    await interaction.deferReply();

    switch (subcommand) {
      case 'status':
        await handleStatus(interaction);
        break;
      case 'performance':
        await handlePerformance(interaction);
        break;
      case 'cache':
        await handleCache(interaction);
        break;
      case 'logs':
        await handleLogs(interaction);
        break;
      default:
        await interaction.editReply('Unknown subcommand');
    }
  } catch (error) {
    console.error('Health command error:', error);
    const errorMessage = 'An error occurred while fetching health information.';
    
    if (interaction.deferred) {
      await interaction.editReply(errorMessage);
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  }
}

/**
 * Handle status subcommand
 */
async function handleStatus(interaction) {
  const health = await healthCheckManager.getOverallHealth();

  const statusEmoji = {
    healthy: '✅',
    degraded: '⚠️',
    unhealthy: '❌'
  };

  const statusColor = {
    healthy: 0x00FF00,
    degraded: 0xFFFF00,
    unhealthy: 0xFF0000
  };

  const embed = new EmbedBuilder()
    .setTitle(`${statusEmoji[health.status]} Bot Health Status`)
    .setColor(statusColor[health.status])
    .setDescription(`Overall Status: **${health.status.toUpperCase()}**`)
    .setTimestamp();

  // Add summary
  embed.addFields({
    name: '📊 Summary',
    value: [
      `Total Checks: ${health.summary.total}`,
      `✅ Healthy: ${health.summary.healthy}`,
      `⚠️ Degraded: ${health.summary.degraded}`,
      `❌ Unhealthy: ${health.summary.unhealthy}`
    ].join('\n'),
    inline: false
  });

  // Add individual check results
  for (const [name, result] of Object.entries(health.checks)) {
    const emoji = statusEmoji[result.status];
    const detailsStr = Object.entries(result.details)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n') || 'No details';

    embed.addFields({
      name: `${emoji} ${name.toUpperCase()}`,
      value: detailsStr.substring(0, 1024),
      inline: true
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Handle performance subcommand
 */
async function handlePerformance(interaction) {
  const report = performanceMonitor.generateReport();
  const health = report.health;

  const embed = new EmbedBuilder()
    .setTitle('⚡ Performance Metrics')
    .setColor(0x3498DB)
    .setTimestamp();

  // System info
  embed.addFields({
    name: '💻 System',
    value: [
      `Platform: ${health.system.platform}`,
      `Node: ${health.system.nodeVersion}`,
      `CPUs: ${health.system.cpuCount}`,
      `Total Memory: ${health.system.totalMemoryMB} MB`,
      `Free Memory: ${health.system.freeMemoryMB} MB`,
      `Load Average: ${health.system.loadAverage.map(l => l.toFixed(2)).join(', ')}`
    ].join('\n'),
    inline: false
  });

  // Memory info
  embed.addFields({
    name: '🧠 Memory Usage',
    value: [
      `Heap Used: ${health.memory.heapUsedMB} MB (${health.memory.heapUsagePercent}%)`,
      `Heap Total: ${health.memory.heapTotalMB} MB`,
      `RSS: ${health.memory.rssMB} MB`,
      `External: ${health.memory.externalMB} MB`
    ].join('\n'),
    inline: false
  });

  // Uptime
  embed.addFields({
    name: '⏱️ Uptime',
    value: [
      `Bot: ${health.uptime.processFormatted}`,
      `System: ${health.uptime.systemFormatted}`
    ].join('\n'),
    inline: false
  });

  // Command stats
  embed.addFields({
    name: '📈 Commands',
    value: [
      `Total Executed: ${health.commands.total}`,
      `Errors: ${health.commands.errors}`,
      `Error Rate: ${report.performance.errorRate}`,
      `Avg Response: ${report.performance.averageResponseTime}ms`
    ].join('\n'),
    inline: false
  });

  // Top slowest commands
  if (report.performance.slowestCommands.length > 0) {
    const slowestList = report.performance.slowestCommands
      .slice(0, 5)
      .map((cmd, i) => `${i + 1}. ${cmd.name}: ${cmd.avgDuration.toFixed(2)}ms (${cmd.count} calls)`)
      .join('\n');

    embed.addFields({
      name: '🐌 Slowest Commands',
      value: slowestList,
      inline: false
    });
  }

  // Warnings
  if (report.warnings.heavyLoad || report.warnings.highMemoryUsage) {
    const warnings = [];
    if (report.warnings.heavyLoad) warnings.push('⚠️ System under heavy load');
    if (report.warnings.highMemoryUsage) warnings.push('⚠️ High memory usage');
    
    embed.addFields({
      name: '⚠️ Warnings',
      value: warnings.join('\n'),
      inline: false
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Handle cache subcommand
 */
async function handleCache(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('💾 Cache Statistics')
    .setColor(0x9B59B6)
    .setTimestamp();

  for (const [name, cache] of Object.entries(caches)) {
    const stats = cache.getStats();
    
    embed.addFields({
      name: `📦 ${name.toUpperCase()} Cache`,
      value: [
        `Size: ${stats.size}/${stats.maxSize}`,
        `Hits: ${stats.hits}`,
        `Misses: ${stats.misses}`,
        `Hit Rate: ${stats.hitRate}`,
        `Evictions: ${stats.evictions}`
      ].join('\n'),
      inline: true
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Handle logs subcommand
 */
async function handleLogs(interaction) {
  const stats = enhancedLogger.getLogStats();

  if (!stats) {
    await interaction.editReply('Unable to retrieve log statistics.');
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('📝 Log File Statistics')
    .setColor(0xE67E22)
    .setTimestamp();

  embed.addFields({
    name: '📊 Summary',
    value: [
      `Total Files: ${stats.totalFiles}`,
      `Total Size: ${stats.totalSizeMB} MB`
    ].join('\n'),
    inline: false
  });

  // List individual log files
  if (stats.files.length > 0) {
    const fileList = stats.files
      .slice(0, 10) // Show max 10 files
      .map(f => `${f.name}: ${f.sizeMB} MB (${new Date(f.modified).toLocaleString()})`)
      .join('\n');

    embed.addFields({
      name: '📄 Log Files',
      value: fileList || 'No log files',
      inline: false
    });
  }

  await interaction.editReply({ embeds: [embed] });
}
