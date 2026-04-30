import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';

// Allowed characters and operators for safe math evaluation
const SAFE_MATH_REGEX = /^[\d\s+\-*/^%().]+$/;

/**
 * Safely evaluates a math expression using only allowed characters.
 * Replaces ^ with ** for power, then evaluates via Function.
 * @param {string} expr - The math expression
 * @returns {number} The result
 */
function safeEval(expr) {
  // Normalize: replace ^ with ** for exponentiation
  const normalized = expr.replaceAll('^', '**');

  if (!SAFE_MATH_REGEX.test(normalized)) {
    throw new TypeError('Expression contains invalid characters. Only numbers and +, -, *, /, ^, %, (, ) are allowed.');
  }

  // Additional safety: disallow __proto__, constructor etc. (belt + suspenders)
  if (/[a-z_$]/i.test(normalized)) {
    throw new TypeError('Expression cannot contain letters or special identifiers.');
  }

  // eslint-disable-next-line no-new-func
  const result = new Function(`"use strict"; return (${normalized})`)();

  if (typeof result !== 'number' || !isFinite(result)) {
    throw new RangeError('Result is not a finite number (division by zero or overflow).');
  }

  return result;
}

export const data = new SlashCommandBuilder()
  .setName('calc')
  .setDescription('Calculate a math expression safely')
  .addStringOption(option =>
    option.setName('expression')
      .setDescription('Math expression (e.g. "2 + 2", "sqrt not supported, use ^ for powers)')
      .setRequired(true)
      .setMaxLength(200));

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  const expression = interaction.options.getString('expression');

  let result;
  try {
    result = safeEval(expression);
  }
  catch (error) {
    return interaction.reply({
      content: `❌ **Invalid expression:** ${error.message}`,
      flags: MessageFlags.Ephemeral
    });
  }

  // Format result nicely
  const formatted = Number.isInteger(result)
    ? result.toLocaleString()
    : result.toPrecision(10).replace(/\.?0+$/, '');

  const embed = new EmbedBuilder()
    .setTitle('🧮 Calculator')
    .setColor(0x57_F2_87)
    .addFields(
      { name: '📝 Expression', value: `\`${expression}\``, inline: false },
      { name: '✅ Result', value: `\`\`\`\n${formatted}\n\`\`\``, inline: false }
    )
    .setFooter({ text: `Requested by ${interaction.user.username}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
