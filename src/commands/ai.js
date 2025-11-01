import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import {
  generateResponse,
  analyzeSentiment,
  generateSummary,
  translateText,
  getAvailableModels,
  getAvailablePersonalities,
  clearUserHistory,
  generateIdeas,
  generateCodeSnippet,
  generateRecommendations
} from '../aiassistant.js';

export const data = new SlashCommandBuilder()
  .setName('ai')
  .setDescription('Advanced AI assistant with multiple models and personalities')
  .addSubcommand(sub => sub.setName('chat').setDescription('Chat with AI assistant').addStringOption(opt => opt.setName('message').setDescription('Your message').setRequired(true)).addStringOption(opt => opt.setName('model').setDescription('AI model to use').addChoices(
    { name: 'Creative Writer', value: 'creative' },
    { name: 'Technical Expert', value: 'technical' },
    { name: 'Helpful Assistant', value: 'helpful' },
    { name: 'Comedy Bot', value: 'funny' },
    { name: 'Teacher Bot', value: 'educational' }
  ).setRequired(false)).addStringOption(opt => opt.setName('personality').setDescription('AI personality').addChoices(
    { name: 'Professional', value: 'professional' },
    { name: 'Friendly', value: 'friendly' },
    { name: 'Energetic', value: 'energetic' },
    { name: 'Wise Mentor', value: 'wise' }
  ).setRequired(false)))
  .addSubcommand(sub => sub.setName('analyze').setDescription('Analyze text sentiment').addStringOption(opt => opt.setName('text').setDescription('Text to analyze').setRequired(true)))
  .addSubcommand(sub => sub.setName('summarize').setDescription('Summarize text').addStringOption(opt => opt.setName('text').setDescription('Text to summarize').setRequired(true)).addIntegerOption(opt => opt.setName('length').setDescription('Max summary length').setRequired(false)))
  .addSubcommand(sub => sub.setName('translate').setDescription('Translate text').addStringOption(opt => opt.setName('text').setDescription('Text to translate').setRequired(true)).addStringOption(opt => opt.setName('language').setDescription('Target language').setRequired(true)))
  .addSubcommand(sub => sub.setName('ideas').setDescription('Generate ideas').addStringOption(opt => opt.setName('topic').setDescription('Topic for ideas').setRequired(true)).addIntegerOption(opt => opt.setName('count').setDescription('Number of ideas').setRequired(false)))
  .addSubcommand(sub => sub.setName('code').setDescription('Generate code').addStringOption(opt => opt.setName('language').setDescription('Programming language').setRequired(true)).addStringOption(opt => opt.setName('description').setDescription('Code description').setRequired(true)))
  .addSubcommand(sub => sub.setName('models').setDescription('List available AI models'))
  .addSubcommand(sub => sub.setName('personalities').setDescription('List available personalities'))
  .addSubcommand(sub => sub.setName('recommend').setDescription('Get personalized recommendations'))
  .addSubcommand(sub => sub.setName('clear').setDescription('Clear conversation history'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'chat') {
    const message = interaction.options.getString('message');
    const model = interaction.options.getString('model') || 'helpful';
    const personality = interaction.options.getString('personality') || 'friendly';

    try {
      const response = await generateResponse(interaction.user.id, message, {
        model,
        personality,
        guildId: interaction.guild?.id
      });

      const embed = new EmbedBuilder()
        .setTitle(`🤖 ${model.charAt(0).toUpperCase() + model.slice(1)} AI Response`)
        .setColor(0x0099FF)
        .setDescription(response)
        .addFields(
          { name: 'Model', value: model, inline: true },
          { name: 'Personality', value: personality, inline: true }
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ai_chat:${model}:${personality}:${interaction.user.id}`).setLabel('💬 Continue Chat').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`ai_clear:${interaction.user.id}`).setLabel('🗑️ Clear History').setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ embeds: [embed], components: [row] });

    } catch (error) {
      console.error('AI chat error:', error);
      await interaction.reply({ content: '❌ Failed to generate AI response. Please try again.', flags: MessageFlags.Ephemeral });
    }

  } else if (sub === 'analyze') {
    const text = interaction.options.getString('text');

    try {
      const sentiment = await analyzeSentiment(text);

      const embed = new EmbedBuilder()
        .setTitle('📊 Sentiment Analysis')
        .setColor(sentiment === 'positive' ? 0x00FF00 : sentiment === 'negative' ? 0xFF0000 : 0xFFFF00)
        .setDescription(`**Text:** ${text}`)
        .addFields({
          name: 'Sentiment',
          value: sentiment.toUpperCase(),
          inline: false
        });

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Sentiment analysis error:', error);
      await interaction.reply({ content: '❌ Failed to analyze sentiment.', flags: MessageFlags.Ephemeral });
    }

  } else if (sub === 'summarize') {
    const text = interaction.options.getString('text');
    const maxLength = interaction.options.getInteger('length') || 200;

    try {
      const summary = await generateSummary(text, maxLength);

      const embed = new EmbedBuilder()
        .setTitle('📝 Text Summary')
        .setColor(0x9932CC)
        .setDescription(summary)
        .addFields({
          name: 'Original Length',
          value: `${text.length} characters`,
          inline: true
        }, {
          name: 'Summary Length',
          value: `${summary.length} characters`,
          inline: true
        });

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Summarization error:', error);
      await interaction.reply({ content: '❌ Failed to summarize text.', flags: MessageFlags.Ephemeral });
    }

  } else if (sub === 'translate') {
    const text = interaction.options.getString('text');
    const language = interaction.options.getString('language');

    try {
      const translation = await translateText(text, language);

      const embed = new EmbedBuilder()
        .setTitle('🌐 Translation')
        .setColor(0x4CAF50)
        .addFields(
          { name: 'Original', value: text, inline: false },
          { name: `Translated (${language.toUpperCase()})`, value: translation, inline: false }
        );

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Translation error:', error);
      await interaction.reply({ content: '❌ Failed to translate text.', flags: MessageFlags.Ephemeral });
    }

  } else if (sub === 'ideas') {
    const topic = interaction.options.getString('topic');
    const count = interaction.options.getInteger('count') || 5;

    try {
      const ideas = await generateIdeas(topic, count);

      const embed = new EmbedBuilder()
        .setTitle(`💡 Ideas for "${topic}"`)
        .setColor(0xFF9800)
        .setDescription(ideas.map((idea, index) => `${index + 1}. ${idea}`).join('\n'));

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Idea generation error:', error);
      await interaction.reply({ content: '❌ Failed to generate ideas.', flags: MessageFlags.Ephemeral });
    }

  } else if (sub === 'code') {
    const language = interaction.options.getString('language');
    const description = interaction.options.getString('description');

    try {
      const code = await generateCodeSnippet(language, description);

      const embed = new EmbedBuilder()
        .setTitle(`💻 ${language.toUpperCase()} Code`)
        .setColor(0x333333)
        .setDescription('```' + language.toLowerCase() + '\n' + code + '\n```')
        .addFields({
          name: 'Description',
          value: description,
          inline: false
        });

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Code generation error:', error);
      await interaction.reply({ content: '❌ Failed to generate code.', flags: MessageFlags.Ephemeral });
    }

  } else if (sub === 'models') {
    const models = getAvailableModels();

    const embed = new EmbedBuilder()
      .setTitle('🤖 Available AI Models')
      .setColor(0x0099FF);

    models.forEach(model => {
      embed.addFields({
        name: model.name,
        value: model.description,
        inline: false
      });
    });

    await interaction.reply({ embeds: [embed] });

  } else if (sub === 'personalities') {
    const personalities = getAvailablePersonalities();

    const embed = new EmbedBuilder()
      .setTitle('🎭 Available Personalities')
      .setColor(0xE91E63);

    personalities.forEach(personality => {
      embed.addFields({
        name: personality.name,
        value: `Style: ${personality.style}`,
        inline: false
      });
    });

    await interaction.reply({ embeds: [embed] });

  } else if (sub === 'recommend') {
    try {
      const recommendations = await generateRecommendations(interaction.user.id, 'general');

      const embed = new EmbedBuilder()
        .setTitle('💡 Personalized Recommendations')
        .setColor(0xFFC107)
        .setDescription(recommendations.map((rec, index) => `${index + 1}. ${rec}`).join('\n'));

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

    } catch (error) {
      console.error('Recommendation error:', error);
      await interaction.reply({ content: '❌ Failed to generate recommendations.', flags: MessageFlags.Ephemeral });
    }

  } else if (sub === 'clear') {
    clearUserHistory(interaction.user.id);

    await interaction.reply({ content: '🧹 **AI conversation history cleared!** Starting fresh.', flags: MessageFlags.Ephemeral });
  }
}