import { SlashCommandBuilder } from 'discord.js';
import { getGuild, setGuild } from '../storage.js';

export const data = new SlashCommandBuilder()
  .setName('toggleplay')
  .setDescription('Enable or disable playful interactions for this guild')
  .addBooleanOption(opt => opt.setName('enabled').setDescription('Enable playful interactions').setRequired(true));

export async function execute(interaction) {
  if (!interaction.memberPermissions?.has || !interaction.memberPermissions.has('ManageGuild')) {
    await interaction.reply({ content: 'You need Manage Server permission to run this command.', ephemeral: true });
    return;
  }

  const enabled = interaction.options.getBoolean('enabled');
  const cfg = getGuild(interaction.guildId) || {};
  setGuild(interaction.guildId, { ...cfg, playEnabled: enabled });
  await interaction.reply({ content: `Playful interactions are now ${enabled ? 'enabled' : 'disabled'} for this guild.`, ephemeral: true });
}
