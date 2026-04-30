import { SlashCommandBuilder } from 'discord.js';

import { safeExecuteCommand, CommandError, validateRange, validateNotEmpty } from '../errorHandler.js';

/**
 * Roll command data structure.
 */
export const data = new SlashCommandBuilder()
  .setName('roll')
  .setDescription('Roll dice in NdM format, e.g., 2d6')
  .addStringOption(opt =>
    opt.setName('dice')
      .setDescription('Dice expression (e.g., 2d6, 1d20)')
      .setRequired(false)
  );

/**
 * Executes the roll command to simulate dice rolls.
 * @param {object} interaction - Discord interaction object
 * @returns {Promise<void>}
 */
export async function execute(interaction) {
  return safeExecuteCommand(interaction, async() => {
    // Validate interaction and user
    validateNotEmpty(interaction, 'interaction');
    validateNotEmpty(interaction.user, 'user');

    // Get dice expression, default to 1d6
    const expr = interaction.options.getString('dice') || '1d6';

    // Validate dice expression format using regex
    const diceRegex = /^(\d+)d(\d+)$/i;
    const match = expr.match(diceRegex);

    if (!match) {
      throw new CommandError(
        'Invalid dice format. Please use NdM format (e.g., 2d6, 1d20).',
        'INVALID_FORMAT'
      );
    }

    // Extract and validate dice count and sides
    const diceCount = Math.min(100, Number(match[1]));
    const sides = Number(match[2]);

    // Validate dice count range (1-100)
    validateRange(diceCount, 1, 100, 'dice count');

    // Validate sides range (2-1000 for practical dice)
    validateRange(sides, 2, 1000, 'dice sides');

    // Generate rolls with proper random distribution
    const rolls = [];
    for (let i = 0; i < diceCount; i++) {
      // Math.random() is inclusive of 0, exclusive of 1, so +1 for 1-based dice
      const roll = Math.floor(Math.random() * sides) + 1;
      rolls.push(roll);
    }

    // Calculate sum
    const sum = rolls.reduce((total, roll) => total + roll, 0);

    // Format response message
    const rollList = rolls.join(', ');
    const response = `${interaction.user.username} rolled ${expr}: [${rollList}] = ${sum}`;

    // Reply with results
    await interaction.reply(response);
  });
}
