import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { startTypingGame, checkTypingAttempt } from '../minigames/typing.js';
import { CommandError, handleCommandError } from '../errorHandler.js';

const sessions = new Map(); // In-memory storage for game sessions

// Constants for game configuration
const GUESS_GAME_RANGE = { min: 1, max: 100 };
const TYPING_GAME_DURATION = 6000; // 6 seconds in milliseconds

export const data = new SlashCommandBuilder()
  .setName('minigame')
  .setDescription('Play a quick minigame')
  .addSubcommand(sub => sub.setName('guess').setDescription('Start or guess the number').addIntegerOption(opt => opt.setName('number').setDescription('Your guess').setRequired(false)))
  .addSubcommand(sub => sub.setName('type').setDescription('Start a typing challenge').addStringOption(opt => opt.setName('novel').setDescription('Novel ID to source sentence from')));

export async function execute(interaction) {
  try {
    const sub = interaction.options.getSubcommand();
    const user = interaction.user.id;

    // Input validation
    if (!user) {
      throw new CommandError('Invalid user ID', 'VALIDATION_ERROR');
    }

    if (sub === 'guess') {
      const guess = interaction.options.getInteger('number');

      // Check if user has an active game
      const hasActiveGame = sessions.has(user) && typeof sessions.get(user) === 'number';
      const isFirstGuess = !sessions.has(user) || typeof sessions.get(user) === 'object';

      if (isFirstGuess) {
        // Start new game
        const target = Math.floor(Math.random() * (GUESS_GAME_RANGE.max - GUESS_GAME_RANGE.min + 1)) + GUESS_GAME_RANGE.min;
        sessions.set(user, target);
        return interaction.reply({
          content: `🎯 I have picked a number between ${GUESS_GAME_RANGE.min} and ${GUESS_GAME_RANGE.max}. Try \`/minigame guess <number>\` to guess!`,
          flags: MessageFlags.Ephemeral
        });
      }

      if (hasActiveGame) {
        const target = sessions.get(user);

        if (!guess) {
          return interaction.reply({
            content: '❌ You need to provide a number to guess.',
            flags: MessageFlags.Ephemeral
          });
        }

        // Validate guess range
        if (guess < GUESS_GAME_RANGE.min || guess > GUESS_GAME_RANGE.max) {
          return interaction.reply({
            content: `❌ Please guess a number between ${GUESS_GAME_RANGE.min} and ${GUESS_GAME_RANGE.max}.`,
            flags: MessageFlags.Ephemeral
          });
        }

        if (guess === target) {
          sessions.delete(user);
          return interaction.reply(`🎉 ${interaction.user.username}, correct! You guessed ${target}!`);
        }

        const hint = guess < target ? 'higher' : 'lower';
        return interaction.reply({
          content: `❌ Nope — try ${hint}.`,
          flags: MessageFlags.Ephemeral
        });
      }
    }

    if (sub === 'type') {
      const novelId = interaction.options.getString('novel');
      let sentence;

      if (novelId) {
        try {
          const { getNovel } = await import('../novel.js');
          const novel = getNovel(novelId);
          if (novel && novel.chapters && novel.chapters.length > 0) {
            const text = novel.chapters[novel.chapters.length - 1].text;
            const sentences = text.split(/[\.\!\?]\s+/).filter(Boolean);
            if (sentences.length > 0) {
              sentence = sentences[Math.floor(Math.random() * sentences.length)].trim();
            }
          } else {
            return interaction.reply({
              content: '❌ Novel not found or has no chapters.',
              flags: MessageFlags.Ephemeral
            });
          }
        } catch (err) {
          console.error('Failed to load novel for typing:', err);
          return interaction.reply({
            content: '❌ Failed to load novel data.',
            flags: MessageFlags.Ephemeral
          });
        }
      }

      const gameData = startTypingGame(user, 6, sentence);
      if (!gameData || !gameData.sentence) {
        throw new CommandError('Failed to start typing game', 'GAME_ERROR');
      }

      sessions.set(user, { type: 'typing', sentence: gameData.sentence, endAt: Date.now() + TYPING_GAME_DURATION });
      return interaction.reply({
        content: `⌨️ Type this exactly within ${TYPING_GAME_DURATION / 1000} seconds:\n\`${gameData.sentence}\``,
        ephemeral: false
      });
    }
  } catch (error) {
    return handleCommandError(interaction, error);
  }
}

