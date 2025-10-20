import { SlashCommandBuilder } from 'discord.js';
import { getGuild, setGuild } from '../storage.js';

export const data = new SlashCommandBuilder()
  .setName('togglechat')
  .setDescription('Enable or disable the chat responder for this guild')
  .addBooleanOption(opt => opt.setName('enabled').setDescription('Enable chat responder').setRequired(true));

export async function execute(interaction) {
  if (!interaction.memberPermissions?.has || !interaction.memberPermissions.has('ManageGuild')) {
    await interaction.reply({ content: 'You need Manage Server permission to run this command.', ephemeral: true });
    return;
  }

  const enabled = interaction.options.getBoolean('enabled');
  const cfg = getGuild(interaction.guildId) || {};
  setGuild(interaction.guildId, { ...cfg, chatEnabled: enabled });
  await interaction.reply({ content: `Chat responder is now ${enabled ? 'enabled' : 'disabled'} for this guild.`, ephemeral: true });
}
