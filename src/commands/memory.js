import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const CARD_EMOJIS = ['🎮', '🎯', '🎲', '🎪', '🎨', '🎭', '🎪', '🎨', '🎭', '🎯', '🎲', '🎮'];
const DIFFICULTIES = {
  easy: { pairs: 6, timeLimit: 60 },
  medium: { pairs: 8, timeLimit: 90 },
  hard: { pairs: 12, timeLimit: 120 },
};

export const data = new SlashCommandBuilder()
  .setName('memory')
  .setDescription('Play a memory matching card game')
  .addStringOption((option) =>
    option
      .setName('difficulty')
      .setDescription('Game difficulty')
      .addChoices({ name: 'Easy (6 pairs)', value: 'easy' }, { name: 'Medium (8 pairs)', value: 'medium' }, { name: 'Hard (12 pairs)', value: 'hard' })
      .setRequired(false),
  );

export async function execute(interaction) {
  const difficulty = interaction.options.getString('difficulty') || 'easy';
  // eslint-disable-next-line security/detect-object-injection -- difficulty validated by slash-command choices
  const config = DIFFICULTIES[difficulty];

  // Create shuffled card deck
  const gameCards = CARD_EMOJIS.slice(0, config.pairs * 2);
  const shuffledCards = gameCards.sort(() => Math.random() - 0.5);

  const gameState = {
    cards: shuffledCards.map((emoji, index) => ({
      id: index,
      emoji,
      isFlipped: false,
      isMatched: false,
    })),
    flippedCards: [],
    matchedPairs: 0,
    totalPairs: config.pairs,
    moves: 0,
    gameActive: true,
    difficulty,
    startTime: Date.now(),
  };

  await sendMemoryBoard(interaction, gameState);
}

export { sendMemoryBoard, getPerformanceRating };

async function sendMemoryBoard(interaction, gameState) {
  if (!gameState.gameActive) return;

  const { cards, flippedCards, matchedPairs, totalPairs, moves, startTime, difficulty } = gameState;

  // Check win condition
  if (matchedPairs === totalPairs) {
    gameState.gameActive = false;
    const timeElapsed = Math.round((Date.now() - startTime) / 1000);
    await sendWinEmbed(interaction, gameState, {
      moves,
      totalPairs,
      timeElapsed,
      userId: interaction.user.id,
    });
  }

  return sendBoardEmbed(interaction, gameState, {
    cards,
    flippedCards,
    matchedPairs,
    totalPairs,
    moves,
    difficulty,
  });
}

async function sendWinEmbed(interaction, gameState, { moves, totalPairs, timeElapsed, userId }) {
  const winEmbed = new EmbedBuilder()
    .setTitle('🎉 Memory Master!')
    .setDescription(`Congratulations! You matched all ${totalPairs} pairs in ${moves} moves and ${timeElapsed} seconds! 🏆`)
    .setColor(0x00_ff_00)
    .addFields(
      { name: '📊 Stats', value: `**Moves:** ${moves}\n**Time:** ${timeElapsed}s\n**Efficiency:** ${((totalPairs / moves) * 100).toFixed(1)}%`, inline: true },
      { name: '🏆 Rating', value: getPerformanceRating(moves, totalPairs, timeElapsed), inline: true },
    );

  await (interaction.replied || interaction.deferred ? interaction.editReply({ embeds: [winEmbed], components: [] }) : interaction.reply({ embeds: [winEmbed] }));

  // Record achievement stat so memory_games_completed can actually be earned
  if (userId) {
    try {
      const { updateUserStats } = await import('../achievements.js');
      updateUserStats(userId, { memory_games_completed: 1 });
    } catch (_ignore) { /* achievements optional */ }
  }

  // Clean up game state
  const { memoryGames } = await import('../game-states.js');
  const messageId = interaction.message?.id || interaction.id;
  memoryGames.delete(messageId);
}

async function sendBoardEmbed(interaction, gameState, ctx) {
  const { cards, flippedCards, matchedPairs, totalPairs, moves, difficulty } = ctx;

  const embed = new EmbedBuilder()
    .setTitle(`🧠 Memory Game - ${matchedPairs}/${totalPairs} Pairs Found`)
    .setDescription(`**Moves:** ${moves} | **Difficulty:** ${difficulty.toUpperCase()}`)
    .setColor(0x00_99_ff);

  // Create card grid (4x3 for easy, 4x4 for medium/hard)
  const gridSize = totalPairs <= 6 ? 3 : 4;
  const flippedSet = new Set(flippedCards);
  let cardGrid = '';

  for (let i = 0; i < cards.length; i += gridSize) {
    const row = cards
      .slice(i, i + gridSize)
      .map((card) => {
        if (card.isMatched) return '✅';
        if (card.isFlipped || flippedSet.has(card.id)) return card.emoji;
        return '🂠'; // Face down card
      })
      .join(' ');
    cardGrid += row + '\n';
  }

  embed.addFields({
    name: 'Cards',
    value: cardGrid || 'No cards',
    inline: false,
  });

  // Create buttons for card grid
  const buttons = [];
  for (let i = 0; i < cards.length; i += gridSize) {
    const row = new ActionRowBuilder();
    for (let j = i; j < i + gridSize && j < cards.length; j++) {
      // eslint-disable-next-line security/detect-object-injection -- j is a numeric loop index
      const card = Object.hasOwn(cards, j) ? cards[j] : undefined;
      row.addComponents(buildCardButton(j, card, flippedSet));
    }
    buttons.push(row);
  }

  // Add reset button if there are flipped cards
  if (flippedCards.length > 0) {
    const resetId = `memory_reset:${interaction.user.id}`;
    const resetBtn = new ButtonBuilder().setCustomId(resetId).setLabel('🔄 Reset Flips').setStyle(ButtonStyle.Secondary);
    buttons.push(new ActionRowBuilder().addComponents(resetBtn));
  }

  const replyOptions = { embeds: [embed], components: buttons };
  await (interaction.replied || interaction.deferred ? interaction.editReply(replyOptions) : interaction.reply(replyOptions));

  // Store game state after reply (if not already stored)
  const messageId = interaction.message?.id || interaction.id;
  const { memoryGames } = await import('../game-states.js');

  if (!memoryGames.has(messageId)) {
    memoryGames.set(messageId, gameState);
  }
}

function buildCardButton(index, card, flippedSet) {
  const id = `memory_${index}`;
  const matched = Boolean(card?.isMatched);
  const label = matched ? '✅' : card?.isFlipped ? card.emoji : '🂠';
  const style = matched ? ButtonStyle.Success : ButtonStyle.Primary;
  const disabled = matched || flippedSet.has(index);
  return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
}

function getPerformanceRating(moves, pairs, time) {
  const efficiency = (pairs / moves) * 100;

  if (efficiency >= 70 && time <= 60) return '🌟 Perfect!';
  if (efficiency >= 60 && time <= 90) return '⭐ Excellent!';
  if (efficiency >= 50) return '🥇 Good Job!';
  if (efficiency >= 40) return '🥈 Not Bad!';
  return '📈 Keep Practicing!';
}
