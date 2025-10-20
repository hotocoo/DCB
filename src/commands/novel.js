import { SlashCommandBuilder } from 'discord.js';
import { createNovel, listNovels, getNovel, generateChapter } from '../novel.js';

export const data = new SlashCommandBuilder()
  .setName('novel')
  .setDescription('Light novel features')
  .addSubcommand(sub => sub.setName('create').setDescription('Create a new novel').addStringOption(opt => opt.setName('title').setDescription('Title')).addStringOption(opt => opt.setName('prompt').setDescription('Initial prompt/context')))
  .addSubcommand(sub => sub.setName('list').setDescription('List novels'))
  .addSubcommand(sub => sub.setName('read').setDescription('Read a novel').addStringOption(opt => opt.setName('id').setDescription('Novel ID').setRequired(true)).addIntegerOption(opt => opt.setName('chapter').setDescription('Chapter number')))
  .addSubcommand(sub => sub.setName('next').setDescription('Generate next chapter').addStringOption(opt => opt.setName('id').setDescription('Novel ID').setRequired(true)));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;
  if (sub === 'create') {
    const title = interaction.options.getString('title');
    const prompt = interaction.options.getString('prompt');
    const novel = createNovel(userId, title, prompt);
    return interaction.reply({ content: `Created novel ${novel.title} (id=${novel.id})`, ephemeral: true });
  }
  if (sub === 'list') {
    const ns = listNovels();
    if (!ns.length) return interaction.reply({ content: 'No novels yet.', ephemeral: true });
    return interaction.reply(ns.join('\n'));
  }
  if (sub === 'read') {
    const id = interaction.options.getString('id');
    const chapter = interaction.options.getInteger('chapter') || 1;
    const novel = getNovel(id);
    if (!novel) return interaction.reply({ content: 'Novel not found.', ephemeral: true });
    const chap = novel.chapters[chapter - 1];
    if (!chap) return interaction.reply({ content: 'Chapter not found. You can run /novel next to generate.', ephemeral: true });
    return interaction.reply({ content: `Chapter ${chap.index} - ${novel.title}\n\n${chap.text}` });
  }
  if (sub === 'next') {
    const id = interaction.options.getString('id');
    await interaction.deferReply();
    const chapter = await generateChapter(interaction.guildId, id);
    if (!chapter) return interaction.editReply('Failed to generate chapter.');
    return interaction.editReply(`Generated Chapter ${chapter.index}:\n\n${chapter.text}`);
  }
}
