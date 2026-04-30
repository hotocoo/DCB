import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';

import { safeExecuteCommand, CommandError } from '../errorHandler.js';

export const data = new SlashCommandBuilder()
  .setName('calculator')
  .setDescription('Perform a mathematical calculation')
  .addStringOption(opt =>
    opt
      .setName('expression')
      .setDescription('Math expression (e.g. 2 + 2, sqrt(16), 5^3, (3+4)*2)')
      .setRequired(true)
      .setMaxLength(200)
  );

/**
 * Safely evaluates a math expression using a whitelist approach.
 * @param {string} expr - The expression to evaluate
 * @returns {number|string} The result
 */
function safeMath(expr) {
  // Allow only safe characters and math functions
  const sanitized = expr
    .replace(/\s+/g, '')
    .replace(/\^/g, '**') // Support ^ as power operator
    .replace(/√/g, 'Math.sqrt')
    .replace(/π/g, 'Math.PI')
    .replace(/e(?![0-9])/g, 'Math.E');

  // Whitelist check - only allow digits, operators, Math functions, parentheses
  if (!/^[\d\s+\-*/.%(),!_MathsqrcblgotnapiEPISR*]+$/.test(sanitized)) {
    throw new Error('Invalid characters in expression');
  }

  // Allow only specific Math methods to prevent code injection
  const allowedMathFunctions = [
    'abs', 'acos', 'acosh', 'asin', 'asinh', 'atan', 'atanh', 'atan2',
    'ceil', 'cbrt', 'cos', 'cosh', 'exp', 'floor', 'hypot', 'log',
    'log2', 'log10', 'max', 'min', 'pow', 'random', 'round', 'sign',
    'sin', 'sinh', 'sqrt', 'tan', 'tanh', 'trunc', 'PI', 'E', 'LN2',
    'LN10', 'LOG2E', 'LOG10E', 'SQRT2',
  ];

  // Replace Math.xxx with a restricted version
  const mathProxy = {};
  for (const fn of allowedMathFunctions) {
    mathProxy[fn] = typeof Math[fn] === 'function' ? Math[fn].bind(Math) : Math[fn];
  }

  // Use Function constructor with only Math in scope
  // This is safe because we've already sanitized the input with a whitelist
  const fn = new Function('Math', `"use strict"; return (${sanitized});`);
  return fn(mathProxy);
}

/**
 * Formats a number for display.
 * @param {number} num
 * @returns {string}
 */
function formatResult(num) {
  if (!isFinite(num)) return String(num);
  if (Number.isInteger(num)) return num.toLocaleString('en-US');
  // Show up to 10 significant digits
  const str = num.toPrecision(10).replace(/\.?0+$/, '');
  return parseFloat(str).toLocaleString('en-US', { maximumSignificantDigits: 10 });
}

/**
 * Executes the calculator command.
 * @param {object} interaction - Discord interaction object
 */
export async function execute(interaction) {
  return safeExecuteCommand(interaction, async () => {
    const expression = interaction.options.getString('expression');

    let result;
    try {
      result = safeMath(expression);
    } catch (err) {
      throw new CommandError(
        `Could not evaluate \`${expression}\`: ${err.message}`,
        'INVALID_ARGUMENT'
      );
    }

    if (result === undefined || result === null) {
      throw new CommandError('Expression returned no result.', 'INVALID_ARGUMENT');
    }

    const embed = new EmbedBuilder()
      .setTitle('🧮 Calculator')
      .setColor(0x00b4d8)
      .addFields(
        { name: '📥 Expression', value: `\`${expression}\``, inline: false },
        { name: '📤 Result', value: `\`\`\`${formatResult(result)}\`\`\``, inline: false },
      )
      .setFooter({ text: `Requested by ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  });
}
