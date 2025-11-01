import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { startTypingGame, checkTypingAttempt } from '../minigames/typing.js';

const sessions = new Map();

export const data = new SlashCommandBuilder()
  .setName('minigame')
  .setDescription('Play a quick minigame')
  .addSubcommand(sub => sub.setName('guess').setDescription('Start or guess the number').addIntegerOption(opt => opt.setName('number').setDescription('Your guess').setRequired(false)))
  .addSubcommand(sub => sub.setName('type').setDescription('Start a typing challenge').addStringOption(opt => opt.setName('novel').setDescription('Novel ID to source sentence from')));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const user = interaction.user.id;
  if (sub === 'guess') {
    const guess = interaction.options.getInteger('number');
    if (!sessions.has(user) || typeof sessions.get(user) === 'object') {
      sessions.set(user, Math.floor(Math.random() * 100) + 1);
      return interaction.reply({ content: 'I have picked a number between 1 and 100. Try /minigame guess <number> to guess!', flags: MessageFlags.Ephemeral });
    }
    const target = sessions.get(user);
    if (!guess) return interaction.reply({ content: 'You need to provide a number to guess.', flags: MessageFlags.Ephemeral });
    if (guess === target) {
      sessions.delete(user);
      return interaction.reply(`${interaction.user.username}, correct! You guessed ${target}.`);
    }
    const hint = guess < target ? 'higher' : 'lower';
    return interaction.reply({ content: `Nope — try ${hint}.`, flags: MessageFlags.Ephemeral });
  }

  if (sub === 'type') {
    const novelId = interaction.options.getString('novel');
    let sentence;
    if (novelId) {
      // try to load latest chapter from novel
      try {
        const { getNovel } = await import('../novel.js');
        const novel = getNovel(novelId);
        if (novel && novel.chapters && novel.chapters.length) {
          // pick a random sentence from latest chapter
          const text = novel.chapters[novel.chapters.length - 1].text;
          const sentences = text.split(/[\.\!\?]\s+/).filter(Boolean);
          sentence = sentences[Math.floor(Math.random() * sentences.length)].trim();
        }
      } catch (err) {
        console.error('Failed to load novel for typing', err);
      }
    }
    const { sentence: sent } = startTypingGame(user, 6, sentence);
    sessions.set(user, { type: 'typing', sentence: sent, endAt: Date.now() + 6000 });
    return interaction.reply({ content: `Type this exactly within 6 seconds: \n\`${sent}\``, ephemeral: false });
  }
}

