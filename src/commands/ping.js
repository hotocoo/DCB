import { SlashCommandBuilder } from 'discord.js';

import { safeExecuteCommand, validateNotEmpty } from '../errorHandler.js';

/**
 * Ping command data structure.
 */
export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Replies with Pong! and latency');

/**
 * Executes the ping command to measure bot latency.
 * @param {object} interaction - Discord interaction object
 * @returns {Promise<void>}
 */
export async function execute(interaction) {
  return safeExecuteCommand(interaction, async() => {
    // Validate interaction object
    validateNotEmpty(interaction, 'interaction');
    validateNotEmpty(interaction.client, 'client');
    validateNotEmpty(interaction.client.ws, 'websocket');

    // Send initial ping message and fetch reply for timing
    const sent = await interaction.reply({
      content: 'Pinging...',
      fetchReply: true
    });

    // Calculate latencies
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const apiLatency = Math.round(interaction.client.ws.ping);

    // Validate latency values are reasonable
    if (latency < 0 || apiLatency < 0) {
      throw new Error('Invalid latency calculation');
    }

    // Format response message with proper spacing
    const response = `Pong! Latency: ${latency}ms | API: ${apiLatency}ms`;

    // Edit the original message with results
    await interaction.editReply(response);
  });
}
