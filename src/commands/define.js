import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('define')
  .setDescription('Look up a word definition using the Free Dictionary API')
  .addStringOption(option =>
    option.setName('word')
      .setDescription('The word to define')
      .setRequired(true)
      .setMaxLength(50));

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  const word = interaction.options.getString('word').trim().toLowerCase();

  // Basic word validation
  if (!/^[a-z'-]+$/i.test(word)) {
    return interaction.reply({
      content: '❌ Please provide a valid word (letters, hyphens, and apostrophes only).',
      flags: MessageFlags.Ephemeral
    });
  }

  await interaction.deferReply();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    let response;
    try {
      response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {
        signal: controller.signal
      });
    }
    finally {
      clearTimeout(timeoutId);
    }

    if (response.status === 404) {
      return interaction.editReply(`❌ No definition found for **"${word}"**. Please check the spelling and try again.`);
    }

    if (!response.ok) {
      return interaction.editReply('❌ Failed to fetch definition. Please try again later.');
    }

    const entries = await response.json();
    if (!entries || entries.length === 0) {
      return interaction.editReply(`❌ No definition found for **"${word}"**.`);
    }

    const entry = entries[0];
    const embed = new EmbedBuilder()
      .setTitle(`📖 ${entry.word}`)
      .setColor(0x57_F2_87)
      .setFooter({ text: 'Powered by Free Dictionary API' })
      .setTimestamp();

    // Add phonetics
    const phonetic = entry.phonetic || entry.phonetics?.find(p => p.text)?.text;
    if (phonetic) {
      embed.setDescription(`*${phonetic}*`);
    }

    // Add meanings (up to 3 parts of speech)
    const meanings = entry.meanings?.slice(0, 3) ?? [];
    for (const meaning of meanings) {
      const definitions = meaning.definitions?.slice(0, 2) ?? [];
      const defText = definitions.map((d, i) => {
        let text = `${i + 1}. ${d.definition}`;
        if (d.example) text += `\n   *"${d.example}"*`;
        return text;
      }).join('\n');

      if (defText) {
        const synonyms = meaning.synonyms?.slice(0, 5).join(', ');
        const antonyms = meaning.antonyms?.slice(0, 5).join(', ');
        let value = defText;
        if (synonyms) value += `\n\n**Synonyms:** ${synonyms}`;
        if (antonyms) value += `\n**Antonyms:** ${antonyms}`;

        embed.addFields({
          name: `📌 ${meaning.partOfSpeech.charAt(0).toUpperCase() + meaning.partOfSpeech.slice(1)}`,
          value: value.length > 1024 ? `${value.slice(0, 1021)}...` : value,
          inline: false
        });
      }
    }

    // Add etymology if available
    const origin = entry.origin;
    if (origin) {
      embed.addFields({ name: '🗿 Etymology', value: origin.length > 512 ? `${origin.slice(0, 509)}...` : origin, inline: false });
    }

    await interaction.editReply({ embeds: [embed] });
  }
  catch (error) {
    if (error.name === 'AbortError') {
      return interaction.editReply('❌ Request timed out. Please try again later.');
    }
    return interaction.editReply('❌ An error occurred while fetching the definition. Please try again later.');
  }
}
