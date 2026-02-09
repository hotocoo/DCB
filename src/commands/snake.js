/**
 * Snake command
 * @fileoverview Command to play the Snake mini-game
 */

import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { startGame, getGame, move, endGame } from '../minigames/snake.js';
import { logger } from '../logger.js';

export const data = new SlashCommandBuilder()
  .setName('snake')
  .setDescription('Play the classic Snake game!');

/**
 * Creates game controls
 * @returns {ActionRowBuilder} Button row
 */
function createControls() {
  const row1 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('snake_up')
        .setEmoji('⬆️')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('snake_down')
        .setEmoji('⬇️')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('snake_left')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('snake_right')
        .setEmoji('➡️')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('snake_quit')
        .setLabel('Quit')
        .setStyle(ButtonStyle.Danger)
    );

  return row1;
}

/**
 * Creates game embed
 * @param {Object} game - Game instance
 * @returns {EmbedBuilder} Game embed
 */
function createGameEmbed(game) {
  const embed = new EmbedBuilder()
    .setTitle('🐍 Snake Game')
    .setDescription(\`\${game.render()}\\n\${game.getStatus()}\`)
    .setColor(game.gameOver ? 0xFF_00_00 : 0x00_FF_00)
    .setFooter({ text: '🟢 = Head | 🟩 = Body | 🍎 = Food' })
    .setTimestamp();

  return embed;
}

/**
 * Executes the snake command
 * @param {import('discord.js').CommandInteraction} interaction - The interaction object
 */
export async function execute(interaction) {
  try {
    const userId = interaction.user.id;

    // Check for existing game
    let game = getGame(userId);
    if (game && !game.gameOver) {
      await interaction.reply({
        content: '❌ You already have an active snake game! Use the buttons to continue playing.',
        ephemeral: true
      });
      return;
    }

    // Start new game
    game = startGame(userId);

    const embed = createGameEmbed(game);
    const row = createControls();

    await interaction.reply({
      embeds: [embed],
      components: [row]
    });

    logger.info('Snake game started', { userId: interaction.user.tag });

  } catch (error) {
    logger.error('Failed to start snake game', error);
    await interaction.reply({
      content: \`❌ Failed to start game: \${error.message}\`,
      ephemeral: true
    });
  }
}

/**
 * Handles snake game button interactions
 * @param {import('discord.js').ButtonInteraction} interaction - Button interaction
 */
export async function handleButton(interaction) {
  try {
    const userId = interaction.user.id;
    const game = getGame(userId);

    if (!game) {
      await interaction.reply({
        content: '❌ No active game found. Start a new game with /snake',
        ephemeral: true
      });
      return;
    }

    // Check if the user clicking is the game owner
    if (game.userId !== userId) {
      await interaction.reply({
        content: '❌ This is not your game!',
        ephemeral: true
      });
      return;
    }

    const action = interaction.customId.replace('snake_', '');

    if (action === 'quit') {
      endGame(userId);
      await interaction.update({
        content: '🛑 Game ended!',
        embeds: [],
        components: []
      });
      return;
    }

    // Map button to direction emoji
    const directionMap = {
      'up': '⬆️',
      'down': '⬇️',
      'left': '⬅️',
      'right': '➡️'
    };

    const direction = directionMap[action];
    if (direction) {
      move(userId, direction);
      
      const embed = createGameEmbed(game);
      const row = createControls();

      if (game.gameOver) {
        // Disable buttons when game is over
        row.components.forEach(button => button.setDisabled(true));
        
        await interaction.update({
          embeds: [embed],
          components: [row]
        });

        // Clean up after showing final state
        setTimeout(() => endGame(userId), 60000);
      } else {
        await interaction.update({
          embeds: [embed],
          components: [row]
        });
      }
    }

  } catch (error) {
    logger.error('Failed to handle snake button', error);
    await interaction.reply({
      content: \`❌ Error: \${error.message}\`,
      ephemeral: true
    });
  }
}
