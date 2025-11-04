import { SlashCommandBuilder, MessageFlags } from 'discord.js';

import { getGuild, setGuild } from '../storage.js';
import { safeExecuteCommand, CommandError, validateGuild, validatePermissions } from '../errorHandler';

export const data = new SlashCommandBuilder()
  .setName('toggleplay')
  .setDescription('Enable or disable playful interactions for this guild')
  .addBooleanOption(opt => opt.setName('enabled').setDescription('Enable playful interactions').setRequired(true));

export async function execute(interaction) {
  validateGuild(interaction);
  validatePermissions(interaction, ['ManageGuild']);

  const enabled = interaction.options.getBoolean('enabled');

  if (typeof enabled !== 'boolean') {
    throw new CommandError('Invalid enabled value provided.', 'INVALID_ARGUMENT');
  }

  try {
    const cfg = getGuild(interaction.guildId) || {};
    const updatedCfg = { ...cfg, playEnabled: enabled };

    setGuild(interaction.guildId, updatedCfg);

    await interaction.reply({
      content: `✅ Playful interactions are now **${enabled ? 'enabled' : 'disabled'}** for this guild.`,
      flags: MessageFlags.Ephemeral
    });
  }
  catch (error) {
    throw new CommandError(`Failed to toggle playful interactions: ${error.message}`, 'COMMAND_ERROR', { originalError: error.message });
  }
}

export async function safeExecute(interaction) {
  return safeExecuteCommand(interaction, execute);
}
