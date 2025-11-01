import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const CARD_EMOJIS = ['🎮', '🎯', '🎲', '🎪', '🎨', '🎭', '🎪', '🎨', '🎭', '🎯', '🎲', '🎮'];
const DIFFICULTIES = {
  easy: { pairs: 6, timeLimit: 60 },
  medium: { pairs: 8, timeLimit: 90 },
  hard: { pairs: 12, timeLimit: 120 }
};

export const data = new SlashCommandBuilder()
  .setName('memory')
  .setDescription('Play a memory matching card game')
  .addStringOption(option =>
    option.setName('difficulty')
      .setDescription('Game difficulty')
      .addChoices(
        { name: 'Easy (6 pairs)', value: 'easy' },
        { name: 'Medium (8 pairs)', value: 'medium' },
        { name: 'Hard (12 pairs)', value: 'hard' }
      )
      .setRequired(false));

export async function execute(interaction) {
  const difficulty = interaction.options.getString('difficulty') || 'easy';
  const config = DIFFICULTIES[difficulty];

  // Create shuffled card deck
  const gameCards = CARD_EMOJIS.slice(0, config.pairs * 2);
  const shuffledCards = gameCards.sort(() => Math.random() - 0.5);

  const gameState = {
    cards: shuffledCards.map((emoji, index) => ({
      id: index,
      emoji,
      isFlipped: false,
      isMatched: false
    })),
    flippedCards: [],
    matchedPairs: 0,
    totalPairs: config.pairs,
    moves: 0,
    gameActive: true,
    difficulty,
    startTime: Date.now()
  };

  await sendMemoryBoard(interaction, gameState);
}

async function sendMemoryBoard(interaction, gameState) {
  if (!gameState.gameActive) return;

  const { cards, flippedCards, matchedPairs, totalPairs, moves } = gameState;

  // Check win condition
  if (matchedPairs === totalPairs) {
    gameState.gameActive = false;
    const timeElapsed = Math.round((Date.now() - gameState.startTime) / 1000);

    const winEmbed = new EmbedBuilder()
      .setTitle('🎉 Memory Master!')
      .setDescription(`Congratulations! You matched all ${totalPairs} pairs in ${moves} moves and ${timeElapsed} seconds! 🏆`)
      .setColor(0x00FF00)
      .addFields(
        {
          name: '📊 Stats',
          value: `**Moves:** ${moves}\n**Time:** ${timeElapsed}s\n**Efficiency:** ${((totalPairs / moves) * 100).toFixed(1)}%`,
          inline: true
        },
        {
          name: '🏆 Rating',
          value: getPerformanceRating(moves, totalPairs, timeElapsed),
          inline: true
        }
      );

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ embeds: [winEmbed], components: [] });
    } else {
      await interaction.reply({ embeds: [winEmbed] });
    }
  
    // Clean up game state
    const { memoryGames } = await import('../game-states.js');
    memoryGames.delete(interaction.message?.id || interaction.id);
  
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`🧠 Memory Game - ${matchedPairs}/${totalPairs} Pairs Found`)
    .setDescription(`**Moves:** ${moves} | **Difficulty:** ${gameState.difficulty.toUpperCase()}`)
    .setColor(0x0099FF);

  // Create card grid (4x3 for easy, 4x4 for medium/hard)
  const gridSize = gameState.totalPairs <= 6 ? 3 : 4;
  let cardGrid = '';

  for (let i = 0; i < cards.length; i += gridSize) {
    const row = cards.slice(i, i + gridSize).map(card => {
      if (card.isMatched) return '✅';
      if (card.isFlipped || flippedCards.includes(card.id)) return card.emoji;
      return '🂠'; // Face down card
    }).join(' ');
    cardGrid += row + '\n';
  }

  embed.addFields({
    name: 'Cards',
    value: cardGrid || 'No cards',
    inline: false
  });

  // Create buttons for card grid
  const buttons = [];
  for (let i = 0; i < cards.length; i += gridSize) {
    const row = new ActionRowBuilder();
    for (let j = i; j < i + gridSize && j < cards.length; j++) {
      const card = cards[j];
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`memory_${j}`)
          .setLabel(card.isMatched ? '✅' : card.isFlipped ? card.emoji : '🂠')
          .setStyle(card.isMatched ? ButtonStyle.Success : ButtonStyle.Primary)
          .setDisabled(card.isMatched || flippedCards.includes(j))
      );
    }
    buttons.push(row);
  }

  // Add reset button if there are flipped cards
  if (flippedCards.length > 0) {
    buttons.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`memory_reset:${interaction.user.id}`).setLabel('🔄 Reset Flips').setStyle(ButtonStyle.Secondary)
      )
    );
  }

  if (interaction.replied || interaction.deferred) {
    await interaction.editReply({ embeds: [embed], components: buttons });
  } else {
    await interaction.reply({ embeds: [embed], components: buttons });
  }

  // Store game state after reply (if not already stored)
  const messageId = interaction.message?.id || interaction.id;
  const { memoryGames } = await import('../game-states.js');

  if (!memoryGames.has(messageId)) {
    memoryGames.set(messageId, gameState);
  }
}

function getPerformanceRating(moves, pairs, time) {
  const efficiency = (pairs / moves) * 100;
  const timeBonus = Math.max(0, 100 - time);

  if (efficiency >= 70 && time <= 60) return '🌟 Perfect!';
  if (efficiency >= 60 && time <= 90) return '⭐ Excellent!';
  if (efficiency >= 50) return '🥇 Good Job!';
  if (efficiency >= 40) return '🥈 Not Bad!';
  return '📈 Keep Practicing!';
}