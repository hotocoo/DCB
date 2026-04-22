import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';

/**
 * Parses a color from hex, rgb(), or named color.
 * @param {string} input
 * @returns {{ r: number, g: number, b: number, hex: string } | null}
 */
function parseColor(input) {
  const cleaned = input.trim();

  // Hex color: #RRGGBB or #RGB
  const hexFull = /^#?([0-9a-f]{6})$/i.exec(cleaned);
  if (hexFull) {
    const hex = hexFull[1].toLowerCase();
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return { r, g, b, hex: `#${hex}` };
  }

  const hexShort = /^#?([0-9a-f]{3})$/i.exec(cleaned);
  if (hexShort) {
    const h = hexShort[1].toLowerCase();
    const r = Number.parseInt(h[0] + h[0], 16);
    const g = Number.parseInt(h[1] + h[1], 16);
    const b = Number.parseInt(h[2] + h[2], 16);
    const hex = `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
    return { r, g, b, hex: `#${hex}` };
  }

  // rgb() or rgba()
  const rgbMatch = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(cleaned);
  if (rgbMatch) {
    const r = Math.min(255, Number(rgbMatch[1]));
    const g = Math.min(255, Number(rgbMatch[2]));
    const b = Math.min(255, Number(rgbMatch[3]));
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    return { r, g, b, hex };
  }

  return null;
}

/**
 * Converts RGB to HSL.
 */
function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h;
  let s;
  const l = (max + min) / 2;

  if (max === min) {
    h = 0;
    s = 0;
  }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

/**
 * Returns a basic color name from hex (nearest named color).
 */
function getColorName(r, g, b) {
  const colors = [
    { name: 'Red', r: 255, g: 0, b: 0 },
    { name: 'Green', r: 0, g: 128, b: 0 },
    { name: 'Blue', r: 0, g: 0, b: 255 },
    { name: 'Yellow', r: 255, g: 255, b: 0 },
    { name: 'Orange', r: 255, g: 165, b: 0 },
    { name: 'Purple', r: 128, g: 0, b: 128 },
    { name: 'Pink', r: 255, g: 192, b: 203 },
    { name: 'Cyan', r: 0, g: 255, b: 255 },
    { name: 'Magenta', r: 255, g: 0, b: 255 },
    { name: 'White', r: 255, g: 255, b: 255 },
    { name: 'Black', r: 0, g: 0, b: 0 },
    { name: 'Gray', r: 128, g: 128, b: 128 },
    { name: 'Brown', r: 165, g: 42, b: 42 },
    { name: 'Teal', r: 0, g: 128, b: 128 },
    { name: 'Navy', r: 0, g: 0, b: 128 },
    { name: 'Lime', r: 0, g: 255, b: 0 },
    { name: 'Maroon', r: 128, g: 0, b: 0 },
    { name: 'Olive', r: 128, g: 128, b: 0 },
    { name: 'Coral', r: 255, g: 127, b: 80 },
    { name: 'Gold', r: 255, g: 215, b: 0 }
  ];

  let nearest = colors[0];
  let minDist = Infinity;

  for (const c of colors) {
    const dist = (r - c.r) ** 2 + (g - c.g) ** 2 + (b - c.b) ** 2;
    if (dist < minDist) {
      minDist = dist;
      nearest = c;
    }
  }

  return nearest.name;
}

export const data = new SlashCommandBuilder()
  .setName('color')
  .setDescription('Look up color information by hex code or RGB values')
  .addStringOption(option =>
    option.setName('color')
      .setDescription('Color value — hex (#FF5733), shorthand (#F50), or RGB (rgb(255, 87, 51))')
      .setRequired(true)
      .setMaxLength(30));

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  const input = interaction.options.getString('color');
  const parsed = parseColor(input);

  if (!parsed) {
    return interaction.reply({
      content: '❌ Invalid color format. Please use hex (#FF5733), shorthand (#F50), or RGB (255, 87, 51).',
      flags: MessageFlags.Ephemeral
    });
  }

  const { r, g, b, hex } = parsed;
  const hsl = rgbToHsl(r, g, b);
  const colorInt = (r << 16) | (g << 8) | b; // eslint-disable-line no-bitwise
  const colorName = getColorName(r, g, b);

  // Create a color preview image URL using a public color API
  const colorPreviewUrl = `https://singlecolorimage.com/get/${hex.slice(1)}/100x100`;

  const embed = new EmbedBuilder()
    .setTitle(`🎨 Color: ${colorName}`)
    .setColor(colorInt || 0x000001)
    .addFields(
      { name: '🔢 Hex', value: `\`${hex.toUpperCase()}\``, inline: true },
      { name: '🎛️ RGB', value: `\`rgb(${r}, ${g}, ${b})\``, inline: true },
      { name: '🌈 HSL', value: `\`hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)\``, inline: true },
      { name: '🔢 Decimal', value: `\`${colorInt}\``, inline: true },
      { name: '🎨 Nearest Name', value: colorName, inline: true }
    )
    .setThumbnail(colorPreviewUrl)
    .setFooter({ text: `Requested by ${interaction.user.username}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
