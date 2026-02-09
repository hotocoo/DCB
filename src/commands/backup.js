/**
 * Backup command
 * @fileoverview Creates backups of bot data
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { backupJSON, listJSONFiles } from '../utils/fileStorage.js';
import { logger } from '../logger.js';
import path from 'path';
import fs from 'fs/promises';

export const data = new SlashCommandBuilder()
  .setName('backup')
  .setDescription('Create backups of bot data (Admin only)')
  .addStringOption(option =>
    option.setName('type')
      .setDescription('Type of data to backup')
      .addChoices(
        { name: 'All', value: 'all' },
        { name: 'RPG Characters', value: 'rpg' },
        { name: 'Economy', value: 'economy' },
        { name: 'Guilds', value: 'guilds' }
      )
      .setRequired(true));

/**
 * Executes the backup command
 * @param {import('discord.js').CommandInteraction} interaction - The interaction object
 */
export async function execute(interaction) {
  try {
    // Check if user has administrator permissions
    if (!interaction.member.permissions.has('Administrator')) {
      await interaction.reply({
        content: '❌ You need Administrator permissions to create backups.',
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const type = interaction.options.getString('type');
    const dataDir = path.join(process.cwd(), 'data');
    
    let backupCount = 0;
    const backupResults = [];

    const embed = new EmbedBuilder()
      .setTitle('💾 Backup Operation')
      .setColor(0x00_AA_FF)
      .setTimestamp();

    try {
      if (type === 'all' || type === 'rpg') {
        const playersDir = path.join(dataDir, 'players');
        const playerFiles = await listJSONFiles(playersDir);
        
        for (const file of playerFiles) {
          const backupPath = await backupJSON(file);
          if (backupPath) {
            backupCount++;
          }
        }
        
        backupResults.push(\`✅ RPG Characters: \${playerFiles.length} files backed up\`);
      }

      if (type === 'all' || type === 'economy') {
        const economyFile = path.join(dataDir, 'economy.json');
        try {
          await fs.access(economyFile);
          const backupPath = await backupJSON(economyFile);
          if (backupPath) {
            backupCount++;
            backupResults.push('✅ Economy data backed up');
          }
        } catch {
          backupResults.push('⚠️ Economy file not found');
        }
      }

      if (type === 'all' || type === 'guilds') {
        const guildsFile = path.join(dataDir, 'guilds.json');
        try {
          await fs.access(guildsFile);
          const backupPath = await backupJSON(guildsFile);
          if (backupPath) {
            backupCount++;
            backupResults.push('✅ Guilds data backed up');
          }
        } catch {
          backupResults.push('⚠️ Guilds file not found');
        }
      }

      embed.setDescription(backupResults.join('\\n'));
      embed.addFields({
        name: 'Summary',
        value: \`Total files backed up: **\${backupCount}**\`,
        inline: false
      });

      await interaction.editReply({ embeds: [embed] });

      logger.info('Backup command executed', {
        user: interaction.user.tag,
        type,
        filesBackedUp: backupCount
      });

    } catch (error) {
      throw error;
    }

  } catch (error) {
    logger.error('Failed to execute backup command', error);
    
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Backup Failed')
      .setDescription(\`An error occurred while creating backups: \${error.message}\`)
      .setColor(0xFF_00_00)
      .setTimestamp();

    if (interaction.deferred) {
      await interaction.editReply({ embeds: [errorEmbed] });
    } else {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
}
