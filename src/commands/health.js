/**
 * Health check command
 * @fileoverview Displays bot health status and system metrics
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { createBotHealthChecks } from '../utils/healthCheck.js';
import { logger } from '../logger.js';

export const data = new SlashCommandBuilder()
  .setName('health')
  .setDescription('Check bot health and system status');

/**
 * Executes the health check command
 * @param {import('discord.js').CommandInteraction} interaction - The interaction object
 */
export async function execute(interaction) {
  try {
    await interaction.deferReply();

    const healthCheck = createBotHealthChecks(interaction.client);
    const results = await healthCheck.runAll();

    const statusEmoji = {
      healthy: '✅',
      degraded: '⚠️',
      unhealthy: '❌'
    };

    const statusColor = {
      healthy: 0x00_FF_00,
      degraded: 0xFF_A5_00,
      unhealthy: 0xFF_00_00
    };

    const embed = new EmbedBuilder()
      .setTitle(`${statusEmoji[results.status]} Bot Health Status`)
      .setColor(statusColor[results.status])
      .setDescription(`Overall Status: **${results.status.toUpperCase()}**`)
      .setTimestamp();

    // Add individual check results
    for (const check of results.checks) {
      const emoji = statusEmoji[check.status];
      let fieldValue = `${emoji} ${check.message}`;
      
      if (check.details && Object.keys(check.details).length > 0) {
        const detailsStr = Object.entries(check.details)
          .map(([key, value]) => `• ${key}: ${value}`)
          .join('\n');
        fieldValue += `\n${detailsStr}`;
      }

      embed.addFields({
        name: check.name.charAt(0).toUpperCase() + check.name.slice(1),
        value: fieldValue,
        inline: false
      });
    }

    // Add footer with check duration
    embed.setFooter({ text: `Health check completed in ${results.duration}ms` });

    await interaction.editReply({ embeds: [embed] });

    logger.info('Health check command executed', {
      user: interaction.user.tag,
      status: results.status,
      duration: results.duration
    });

  } catch (error) {
    logger.error('Failed to execute health check command', error);
    
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Health Check Failed')
      .setDescription('An error occurred while checking bot health.')
      .setColor(0xFF_00_00)
      .setTimestamp();

    if (interaction.deferred) {
      await interaction.editReply({ embeds: [errorEmbed] });
    } else {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
}
