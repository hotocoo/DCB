import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getGuild, setGuild } from '../storage.js';
import { safeExecuteCommand, CommandError, validateGuild, validatePermissions } from '../errorHandler.js';

export const data = new SlashCommandBuilder()
  .setName('togglechat')
  .setDescription('Enable or disable the chat responder for this guild')
  .addBooleanOption(opt => opt.setName('enabled').setDescription('Enable chat responder').setRequired(true));

export async function execute(interaction) {
  validateGuild(interaction);
  validatePermissions(interaction, ['ManageGuild']);

  const enabled = interaction.options.getBoolean('enabled');

  if (typeof enabled !== 'boolean') {
    throw new CommandError('Invalid enabled value provided.', 'INVALID_ARGUMENT');
  }

  try {
    const cfg = getGuild(interaction.guildId) || {};
    const updatedCfg = { ...cfg, chatEnabled: enabled };

    setGuild(interaction.guildId, updatedCfg);

    await interaction.reply({
      content: `✅ Chat responder is now **${enabled ? 'enabled' : 'disabled'}** for this guild.`,
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    throw new CommandError(`Failed to toggle chat responder: ${error.message}`, 'COMMAND_ERROR', { originalError: error.message });
  }
}

export async function safeExecute(interaction) {
  return safeExecuteCommand(interaction, execute);
}
