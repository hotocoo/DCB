import { SlashCommandBuilder } from 'discord.js';
import { setGuild } from '../storage.js';

export const data = new SlashCommandBuilder()
  .setName('setmodel')
  .setDescription('Set the model URL for this guild')
  .addStringOption(opt => opt.setName('url').setDescription('Model base URL').setRequired(true))
  .addStringOption(opt => opt.setName('api').setDescription('API type (openai-compatible|openwebui|generic)'));

export async function execute(interaction) {
  if (!interaction.memberPermissions?.has || !interaction.memberPermissions.has('ManageGuild')) {
    await interaction.reply({ content: 'You need Manage Server permission to run this command.', ephemeral: true });
    return;
  }

  const url = interaction.options.getString('url');
  const api = interaction.options.getString('api') || 'openai-compatible';
  setGuild(interaction.guildId, { modelUrl: url, modelApi: api });
  await interaction.reply({ content: `Saved model URL for this guild: ${url} (api=${api})`, ephemeral: true });
}
