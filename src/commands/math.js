import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

// --- Safe math evaluator (no eval) ---
const TOKENS = /\s*(\*\*|[+\-*/%(),]|[A-Za-z_]\w*|\d+(?:\.\d+)?)\s*/g;

const FUNCTIONS = {
  sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil,
  round: Math.round, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  log: Math.log, max: Math.max, min: Math.min,
};
const CONSTANTS = { PI: Math.PI, E: Math.E };

function tokenize(expr) {
  const tokens = [];
  let match;
  TOKENS.lastIndex = 0;
  while ((match = TOKENS.exec(expr)) !== null) {
    tokens.push(match[1]);
  }
  return tokens;
}

// Recursive-descent parser: expr -> term ((+|-) term)*
function parseExpression(tokens, pos) {
  let [left, p] = parseTerm(tokens, pos);
  while (p < tokens.length && (tokens[p] === '+' || tokens[p] === '-')) {
    const op = tokens[p++];
    let right;
    [right, p] = parseTerm(tokens, p);
    left = op === '+' ? left + right : left - right;
  }
  return [left, p];
}

function parseTerm(tokens, pos) {
  let [left, p] = parsePower(tokens, pos);
  while (p < tokens.length && (tokens[p] === '*' || tokens[p] === '/' || tokens[p] === '%')) {
    const op = tokens[p++];
    let right;
    [right, p] = parsePower(tokens, p);
    if (op === '*') left *= right;
    else if (op === '/') {
      if (right === 0) throw new Error('Division by zero');
      left /= right;
    } else left %= right;
  }
  return [left, p];
}

function parsePower(tokens, pos) {
  let [base, p] = parseUnary(tokens, pos);
  if (p < tokens.length && tokens[p] === '**') {
    p++;
    let exp;
    [exp, p] = parseUnary(tokens, p);
    base = base ** exp;
  }
  return [base, p];
}

function parseUnary(tokens, pos) {
  if (tokens[pos] === '-') {
    const [val, p] = parseUnary(tokens, pos + 1);
    return [-val, p];
  }
  if (tokens[pos] === '+') return parseUnary(tokens, pos + 1);
  return parsePrimary(tokens, pos);
}

function parsePrimary(tokens, pos) {
  const tok = tokens[pos];
  if (tok === undefined) throw new Error('Unexpected end of expression');

  if (/^\d+(\.\d+)?$/.test(tok)) return [parseFloat(tok), pos + 1];

  if (tok in CONSTANTS) return [CONSTANTS[tok], pos + 1];

  if (tok in FUNCTIONS) {
    if (tokens[pos + 1] !== '(') throw new Error(`Expected '(' after ${tok}`);
    const args = [];
    let p = pos + 2;
    if (tokens[p] !== ')') {
      let arg;
      [arg, p] = parseExpression(tokens, p);
      args.push(arg);
      while (tokens[p] === ',') {
        p++;
        [arg, p] = parseExpression(tokens, p);
        args.push(arg);
      }
    }
    if (tokens[p] !== ')') throw new Error(`Expected ')' after ${tok} arguments`);
    return [FUNCTIONS[tok](...args), p + 1];
  }

  if (tok === '(') {
    const [val, p] = parseExpression(tokens, pos + 1);
    if (tokens[p] !== ')') throw new Error("Expected ')'");
    return [val, p + 1];
  }

  throw new Error(`Unknown token: ${tok}`);
}

function safeEval(expr) {
  const tokens = tokenize(expr);
  const [result, pos] = parseExpression(tokens, 0);
  if (pos !== tokens.length) throw new Error(`Unexpected token: ${tokens[pos]}`);
  return result;
}

// --- Unit conversion ---
const CONVERSIONS = {
  length: { m: 1, km: 1000, cm: 0.01, ft: 0.3048, mi: 1609.344, in: 0.0254 },
  weight: { kg: 1, g: 0.001, lb: 0.453592, oz: 0.0283495 },
};

function convertTemp(value, from, to) {
  let celsius;
  if (from === 'c') celsius = value;
  else if (from === 'f') celsius = (value - 32) * 5 / 9;
  else if (from === 'k') celsius = value - 273.15;
  else throw new Error(`Unknown temperature unit: ${from}`);

  if (to === 'c') return celsius;
  if (to === 'f') return celsius * 9 / 5 + 32;
  if (to === 'k') return celsius + 273.15;
  throw new Error(`Unknown temperature unit: ${to}`);
}

function convertUnit(value, from, to) {
  from = from.toLowerCase();
  to = to.toLowerCase();

  const tempUnits = new Set(['c', 'f', 'k']);
  if (tempUnits.has(from) || tempUnits.has(to)) {
    if (!tempUnits.has(from) || !tempUnits.has(to)) throw new Error('Cannot mix temperature with other units');
    return convertTemp(value, from, to);
  }

  for (const [, units] of Object.entries(CONVERSIONS)) {
    if (from in units && to in units) {
      return value * units[from] / units[to];
    }
  }
  throw new Error(`Cannot convert from '${from}' to '${to}' — incompatible or unknown units`);
}

// --- Statistics ---
function statistics(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const sum = numbers.reduce((a, b) => a + b, 0);
  const mean = sum / numbers.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  const freq = {};
  for (const n of numbers) freq[n] = (freq[n] ?? 0) + 1;
  const maxFreq = Math.max(...Object.values(freq));
  const mode = Object.keys(freq).filter(k => freq[k] === maxFreq).map(Number);

  return { mean, median, mode, min: sorted[0], max: sorted[sorted.length - 1], sum, count: numbers.length };
}

// --- Command definition ---
export const data = new SlashCommandBuilder()
  .setName('math')
  .setDescription('Math utilities')
  .addSubcommand(sub =>
    sub.setName('calculate')
      .setDescription('Evaluate a math expression')
      .addStringOption(opt =>
        opt.setName('expression').setDescription('Expression to evaluate (e.g. 2 + 2 * sqrt(9))').setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub.setName('convert')
      .setDescription('Convert between units')
      .addNumberOption(opt => opt.setName('value').setDescription('Value to convert').setRequired(true))
      .addStringOption(opt => opt.setName('from_unit').setDescription('From unit (m, km, ft, mi, cm, in, kg, g, lb, oz, c, f, k)').setRequired(true))
      .addStringOption(opt => opt.setName('to_unit').setDescription('To unit').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('random')
      .setDescription('Generate a random number in a range')
      .addIntegerOption(opt => opt.setName('min').setDescription('Minimum value').setRequired(true))
      .addIntegerOption(opt => opt.setName('max').setDescription('Maximum value').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('stats')
      .setDescription('Statistics for a list of numbers')
      .addStringOption(opt =>
        opt.setName('numbers').setDescription('Comma-separated numbers (e.g. 1,2,3,4,5)').setRequired(true)
      )
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  try {
    if (sub === 'calculate') {
      const expr = interaction.options.getString('expression', true);
      const result = safeEval(expr);
      if (!isFinite(result)) throw new Error('Result is not a finite number');
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🧮 Calculator')
        .addFields(
          { name: 'Expression', value: `\`${expr}\``, inline: false },
          { name: 'Result', value: `\`\`\`${result}\`\`\``, inline: false },
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'convert') {
      const value = interaction.options.getNumber('value', true);
      const from = interaction.options.getString('from_unit', true);
      const to = interaction.options.getString('to_unit', true);
      const result = convertUnit(value, from, to);
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📐 Unit Converter')
        .addFields(
          { name: 'Input', value: `\`${value} ${from}\``, inline: true },
          { name: 'Result', value: `\`${parseFloat(result.toFixed(6))} ${to}\``, inline: true },
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'random') {
      const min = interaction.options.getInteger('min', true);
      const max = interaction.options.getInteger('max', true);
      if (min >= max) throw new Error('`min` must be less than `max`');
      const result = Math.floor(Math.random() * (max - min + 1)) + min;
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🎲 Random Number')
        .setDescription(`Between **${min}** and **${max}**: **${result}**`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'stats') {
      const raw = interaction.options.getString('numbers', true);
      const numbers = raw.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
      if (numbers.length === 0) throw new Error('No valid numbers found');
      const s = statistics(numbers);
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📊 Statistics')
        .addFields(
          { name: 'Count', value: `${s.count}`, inline: true },
          { name: 'Sum', value: `${s.sum}`, inline: true },
          { name: 'Mean', value: `${+s.mean.toFixed(4)}`, inline: true },
          { name: 'Median', value: `${s.median}`, inline: true },
          { name: 'Mode', value: s.mode.join(', '), inline: true },
          { name: 'Min', value: `${s.min}`, inline: true },
          { name: 'Max', value: `${s.max}`, inline: true },
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  } catch (error) {
    const errEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('Math Error')
      .setDescription(error.message);
    if (interaction.replied || interaction.deferred) {
      return interaction.editReply({ embeds: [errEmbed] });
    }
    return interaction.reply({ embeds: [errEmbed], ephemeral: true });
  }
}
