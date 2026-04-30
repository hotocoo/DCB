import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

// --- Color helpers ---
function parseHex(hex) {
  const cleaned = hex.replace(/^#/, '');
  if (!/^[\dA-Fa-f]{6}$/.test(cleaned)) throw new Error(`Invalid hex color: \`#${cleaned}\``);
  const r = Number.parseInt(cleaned.slice(0, 2), 16);
  const g = Number.parseInt(cleaned.slice(2, 4), 16);
  const b = Number.parseInt(cleaned.slice(4, 6), 16);
  return { r, g, b, hex: `#${cleaned.toUpperCase()}`, int: Number.parseInt(cleaned, 16) };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: { h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      }
      case g: { h = ((b - r) / d + 2) / 6; break;
      }
      default: { h = ((r - g) / d + 4) / 6;
      }
    }
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function complementary(r, g, b) {
  const cr = 255 - r, cg = 255 - g, cb = 255 - b;
  return `#${[cr, cg, cb].map(v => v.toString(16).padStart(2, '0').toUpperCase()).join('')}`;
}

function mixColors(c1, c2) {
  const r = Math.round((c1.r + c2.r) / 2);
  const g = Math.round((c1.g + c2.g) / 2);
  const b = Math.round((c1.b + c2.b) / 2);
  const hex = `#${[r, g, b].map(v => v.toString(16).padStart(2, '0').toUpperCase()).join('')}`;
  const int = Number.parseInt(hex.slice(1), 16);
  return { r, g, b, hex, int };
}

function colorEmbed(color) {
  const hsl = rgbToHsl(color.r, color.g, color.b);
  const comp = complementary(color.r, color.g, color.b);
  return new EmbedBuilder()
    .setColor(color.int)
    .setTitle(`🎨 ${color.hex}`)
    .addFields(
      { name: 'HEX', value: `\`${color.hex}\``, inline: true },
      { name: 'RGB', value: `\`rgb(${color.r}, ${color.g}, ${color.b})\``, inline: true },
      { name: 'HSL', value: `\`hsl(${hsl.h}°, ${hsl.s}%, ${hsl.l}%)\``, inline: true },
      { name: 'Complementary', value: `\`${comp}\``, inline: true },
    );
}

// --- Command definition ---
export const data = new SlashCommandBuilder()
  .setName('color')
  .setDescription('Color utilities')
  .addSubcommand(sub =>
    sub.setName('info')
      .setDescription('Get info about a hex color')
      .addStringOption(opt =>
        opt.setName('hex').setDescription('Hex color code (e.g. #FF5733 or FF5733)').setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub.setName('random').setDescription('Generate a random color')
  )
  .addSubcommand(sub =>
    sub.setName('mix')
      .setDescription('Mix two hex colors together')
      .addStringOption(opt =>
        opt.setName('color1').setDescription('First hex color (e.g. #FF0000)').setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName('color2').setDescription('Second hex color (e.g. #0000FF)').setRequired(true)
      )
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  try {
    if (sub === 'info') {
      const hex = interaction.options.getString('hex', true);
      const color = parseHex(hex);
      return interaction.reply({ embeds: [colorEmbed(color)] });
    }

    if (sub === 'random') {
      const int = Math.floor(Math.random() * 0xFF_FF_FF);
      const hex = int.toString(16).padStart(6, '0').toUpperCase();
      const color = parseHex(hex);
      return interaction.reply({ embeds: [colorEmbed(color).setTitle(`🎲 Random Color: ${color.hex}`)] });
    }

    if (sub === 'mix') {
      const c1 = parseHex(interaction.options.getString('color1', true));
      const c2 = parseHex(interaction.options.getString('color2', true));
      const mixed = mixColors(c1, c2);
      const embed = colorEmbed(mixed)
        .setTitle(`🎨 Mix: ${c1.hex} + ${c2.hex} = ${mixed.hex}`)
        .setDescription(`**${c1.hex}** mixed with **${c2.hex}**`);
      return interaction.reply({ embeds: [embed] });
    }
  }
  catch (error) {
    const errEmbed = new EmbedBuilder()
      .setColor(0xFF_00_00)
      .setTitle('Color Error')
      .setDescription(error.message);
    if (interaction.replied || interaction.deferred) {
      return interaction.editReply({ embeds: [errEmbed] });
    }
    return interaction.reply({ embeds: [errEmbed], ephemeral: true });
  }
}
