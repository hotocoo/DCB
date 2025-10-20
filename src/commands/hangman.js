import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const WORDS = [
  // Easy words
  'CAT', 'DOG', 'SUN', 'MOON', 'STAR', 'TREE', 'FISH', 'BIRD', 'ROSE', 'LAMP',
  // Medium words
  'OCEAN', 'MOUNTAIN', 'FOREST', 'GARDEN', 'FLOWER', 'BUTTERFLY', 'DRAGON', 'CASTLE', 'RAINBOW', 'THUNDER',
  // Hard words
  'PHOTOSYNTHESIS', 'ARCHAEOLOGIST', 'CONSTITUTIONAL', 'CHARACTERISTIC', 'UNPRECEDENTED', 'MISCONCEPTION', 'DISAPPOINTMENT', 'UNBELIEVABLE'
];

const HANGMAN_STAGES = [
  '🎮',
  '😊',
  '🙂',
  '😐',
  '😕',
  '😟',
  '😨',
  '😰',
  '💀'
];

export const data = new SlashCommandBuilder()
  .setName('hangman')
  .setDescription('Play a word guessing game')
  .addStringOption(option =>
    option.setName('difficulty')
      .setDescription('Game difficulty')
      .addChoices(
        { name: 'Easy (3-5 letters)', value: 'easy' },
        { name: 'Medium (6-8 letters)', value: 'medium' },
        { name: 'Hard (9+ letters)', value: 'hard' }
      )
      .setRequired(false));

export async function execute(interaction) {
  const difficulty = interaction.options.getString('difficulty') || 'easy';

  // Filter words by difficulty
  const availableWords = WORDS.filter(word => {
    const length = word.length;
    switch (difficulty) {
      case 'easy': return length >= 3 && length <= 5;
      case 'medium': return length >= 6 && length <= 8;
      case 'hard': return length >= 9;
      default: return true;
    }
  });

  if (availableWords.length === 0) {
    return interaction.reply({ content: '❌ No words available for this difficulty. Please try a different difficulty.', ephemeral: true });
  }

  const word = availableWords[Math.floor(Math.random() * availableWords.length)];
  const gameState = {
    word,
    guessedLetters: new Set(),
    wrongGuesses: 0,
    maxWrongGuesses: 7,
    guessedWord: word.replace(/[A-Z]/g, '_'),
    gameActive: true,
    startTime: Date.now()
  };

  await sendHangmanBoard(interaction, gameState);
}

async function sendHangmanBoard(interaction, gameState) {
  if (!gameState.gameActive) return;

  const { word, guessedLetters, wrongGuesses, guessedWord, maxWrongGuesses } = gameState;
  const displayWord = word.split('').map(letter => guessedLetters.has(letter) ? letter : '_').join(' ');

  // Check win/lose conditions
  if (!displayWord.includes('_')) {
    gameState.gameActive = false;
    const timeElapsed = Math.round((Date.now() - gameState.startTime) / 1000);

    const winEmbed = new EmbedBuilder()
      .setTitle('🎉 Congratulations!')
      .setDescription(`You guessed the word: **${word}**\n\n🏆 **Victory!** You won in ${timeElapsed} seconds with ${wrongGuesses} wrong guesses!`)
      .setColor(0x00FF00)
      .addFields({
        name: 'Final Word',
        value: displayWord,
        inline: false
      });

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ embeds: [winEmbed], components: [] });
    } else {
      await interaction.reply({ embeds: [winEmbed] });
    }
    return;
  }

  if (wrongGuesses >= maxWrongGuesses) {
    gameState.gameActive = false;
    const timeElapsed = Math.round((Date.now() - gameState.startTime) / 1000);

    const loseEmbed = new EmbedBuilder()
      .setTitle('💀 Game Over!')
      .setDescription(`The word was: **${word}**\n\n😔 **Defeat!** You made ${wrongGuesses} wrong guesses in ${timeElapsed} seconds.`)
      .setColor(0xFF0000)
      .addFields({
        name: 'Correct Word',
        value: word,
        inline: false
      });

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ embeds: [loseEmbed], components: [] });
    } else {
      await interaction.reply({ embeds: [loseEmbed] });
    }
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`🔤 Hangman - ${HANGMAN_STAGES[wrongGuesses]}`)
    .setDescription(`**Word:** ${displayWord}\n**Wrong Guesses:** ${wrongGuesses}/${maxWrongGuesses}`)
    .setColor(wrongGuesses > 4 ? 0xFFA500 : 0x0099FF)
    .addFields(
      {
        name: 'Guessed Letters',
        value: guessedLetters.size > 0 ? Array.from(guessedLetters).join(', ') : 'None yet',
        inline: true
      },
      {
        name: 'Remaining',
        value: `${maxWrongGuesses - wrongGuesses} attempts left`,
        inline: true
      }
    )
    .setFooter({ text: 'Guess a letter by clicking the buttons below!' });

  // Create alphabet buttons (A-Z)
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const buttons = [];

  for (let i = 0; i < alphabet.length; i += 5) {
    const row = new ActionRowBuilder();
    for (let j = i; j < i + 5 && j < alphabet.length; j++) {
      const letter = alphabet[j];
      const isGuessed = guessedLetters.has(letter);
      const isCorrect = word.includes(letter);

      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`hangman_${letter}`)
          .setLabel(letter)
          .setStyle(isGuessed ?
            (isCorrect ? ButtonStyle.Success : ButtonStyle.Danger) :
            ButtonStyle.Secondary
          )
          .setDisabled(isGuessed)
      );
    }
    buttons.push(row);
  }

  if (interaction.replied || interaction.deferred) {
    await interaction.editReply({ embeds: [embed], components: buttons });
  } else {
    await interaction.reply({ embeds: [embed], components: buttons });
  }
}