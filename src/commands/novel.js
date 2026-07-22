import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';

import { createNovel, listNovels, getNovel, generateChapter } from '../novel.js';
import { CommandError, handleCommandError } from '../errorHandler.js';

export const data = new SlashCommandBuilder()
  .setName('novel')
  .setDescription('Light novel features')
  .addSubcommand(sub => sub.setName('create').setDescription('Create a new novel').addStringOption(opt => opt.setName('title').setDescription('Title')).addStringOption(opt => opt.setName('prompt').setDescription('Initial prompt/context')))
  .addSubcommand(sub => sub.setName('list').setDescription('List novels'))
  .addSubcommand(sub => sub.setName('read').setDescription('Read a novel').addStringOption(opt => opt.setName('id').setDescription('Novel ID').setRequired(true)).addIntegerOption(opt => opt.setName('chapter').setDescription('Chapter number')))
  .addSubcommand(sub => sub.setName('next').setDescription('Generate next chapter').addStringOption(opt => opt.setName('id').setDescription('Novel ID').setRequired(true)));

export async function execute(interaction) {
  try {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    // Input validation
    if (!userId) {
      throw new CommandError('Invalid user ID', 'VALIDATION_ERROR');
    }

    if (sub === 'create') {
      const title = interaction.options.getString('title');
      const prompt = interaction.options.getString('prompt');

      // Validate inputs
      if (!title || title.trim().length === 0) {
        return interaction.reply({
          content: '❌ Novel title cannot be empty.',
          flags: MessageFlags.Ephemeral
        });
      }

      if (title.length > 100) {
        return interaction.reply({
          content: '❌ Novel title must be 100 characters or less.',
          flags: MessageFlags.Ephemeral
        });
      }

      if (prompt && prompt.length > 500) {
        return interaction.reply({
          content: '❌ Initial prompt must be 500 characters or less.',
          flags: MessageFlags.Ephemeral
        });
      }

      const novel = createNovel(userId, title.trim(), prompt?.trim() || '');
      const embed = new EmbedBuilder()
        .setTitle('📖 Novel Created')
        .setColor(0x00_FF_00)
        .setDescription(`**${novel.title}**\n\nID: \`${novel.id}\`\nAuthor: ${interaction.user.username}`)
        .addFields({
          name: 'Next Steps',
          value: 'Use `/novel next` to generate the first chapter!'
        });

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'list') {
      const novels = listNovels();
      if (!novels || novels.length === 0) {
        return interaction.reply({
          content: '📚 No novels have been created yet.',
          flags: MessageFlags.Ephemeral
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('📚 Available Novels')
        .setColor(0x00_99_FF)
        .setDescription(novels.join('\n\n'));

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'read') {
      const id = interaction.options.getString('id');
      const chapter = interaction.options.getInteger('chapter') || 1;

      // Validate inputs
      if (!id || id.trim().length === 0) {
        return interaction.reply({
          content: '❌ Novel ID is required.',
          flags: MessageFlags.Ephemeral
        });
      }

      if (chapter < 1) {
        return interaction.reply({
          content: '❌ Chapter number must be 1 or greater.',
          flags: MessageFlags.Ephemeral
        });
      }

      const novel = getNovel(id.trim());
      if (!novel) {
        return interaction.reply({
          content: '❌ Novel not found. Check the ID and try again.',
          flags: MessageFlags.Ephemeral
        });
      }

      const chap = novel.chapters[chapter - 1];
      if (!chap) {
        return interaction.reply({
          content: `❌ Chapter ${chapter} not found. This novel has ${novel.chapters.length} chapters.\n\nUse \`/novel next\` to generate more chapters!`,
          flags: MessageFlags.Ephemeral
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(`📖 ${novel.title}`)
        .setColor(0x99_32_CC)
        .setDescription(`**Chapter ${chap.index}**\n\n${chap.text}`)
        .setFooter({ text: `Novel ID: ${novel.id} • Total Chapters: ${novel.chapters.length}` });

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'next') {
      const id = interaction.options.getString('id');

      // Validate inputs
      if (!id || id.trim().length === 0) {
        return interaction.reply({
          content: '❌ Novel ID is required.',
          flags: MessageFlags.Ephemeral
        });
      }

      const novel = getNovel(id.trim());
      if (!novel) {
        return interaction.reply({
          content: '❌ Novel not found. Check the ID and try again.',
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply();

      try {
        const chapter = await generateChapter(interaction.guildId, id.trim());
        if (!chapter) {
          return interaction.editReply({
            content: '❌ Failed to generate chapter. Please try again later.'
          });
        }

        const embed = new EmbedBuilder()
          .setTitle(`📝 Chapter ${chapter.index} Generated`)
          .setColor(0x00_FF_00)
          .setDescription(`**${novel.title}**\n\n${chapter.text}`)
          .setFooter({ text: `Novel ID: ${novel.id} • Use /novel read to view full context` });

        return interaction.editReply({ embeds: [embed] });
      }
      catch (error) {
        console.error('Chapter generation error:', error);
        return interaction.editReply({
          content: '❌ An error occurred while generating the chapter. Please try again.'
        });
      }
    }
  }
  catch (error) {
    return handleCommandError(interaction, error);
  }
}
