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
  try {
    // Validate interaction object
    if (!interaction || !interaction.user || !interaction.options) {
      throw new Error('Invalid interaction object');
    }

    const sub = interaction.options.getSubcommand();

    // Validate subcommand
    const validSubcommands = ['chat', 'analyze', 'summarize', 'translate', 'ideas', 'code', 'models', 'personalities', 'recommend', 'clear'];
    if (!validSubcommands.includes(sub)) {
      return interaction.reply({
        content: '❌ Invalid subcommand. Please use a valid AI subcommand.',
        flags: MessageFlags.Ephemeral
      });
    }

    switch (sub) {
      case 'chat': {
        const message = interaction.options.getString('message');
        const model = interaction.options.getString('model') || 'helpful';
        const personality = interaction.options.getString('personality') || 'friendly';

        // Validate inputs
        if (!message || message.trim().length === 0) {
          return interaction.reply({
            content: '❌ Please provide a message to send to the AI.',
            flags: MessageFlags.Ephemeral
          });
        }

        if (message.length > 2000) {
          return interaction.reply({
            content: '❌ Message is too long. Please keep it under 2000 characters.',
            flags: MessageFlags.Ephemeral
          });
        }

        const validModels = ['creative', 'technical', 'helpful', 'funny', 'educational'];
        if (!validModels.includes(model)) {
          return interaction.reply({
            content: '❌ Invalid model. Please choose from: creative, technical, helpful, funny, educational.',
            flags: MessageFlags.Ephemeral
          });
        }

        const validPersonalities = ['professional', 'friendly', 'energetic', 'wise'];
        if (!validPersonalities.includes(personality)) {
          return interaction.reply({
            content: '❌ Invalid personality. Please choose from: professional, friendly, energetic, wise.',
            flags: MessageFlags.Ephemeral
          });
        }

        try {
          const response = await generateResponse(interaction.user.id, message.trim(), {
            model,
            personality,
            guildId: interaction.guild?.id
          });

          if (!response || typeof response !== 'string') {
            throw new Error('Invalid AI response');
          }

          const embed = new EmbedBuilder()
            .setTitle(`🤖 ${model.charAt(0).toUpperCase() + model.slice(1)} AI Response`)
            .setColor(0x00_99_FF)
            .setDescription(response.length > 4000 ? response.slice(0, 3997) + '...' : response)
            .addFields(
              { name: 'Model', value: model, inline: true },
              { name: 'Personality', value: personality, inline: true }
            );

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`ai_chat:${model}:${personality}:${interaction.user.id}`)
              .setLabel('💬 Continue Chat')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(`ai_clear:${interaction.user.id}`)
              .setLabel('🗑️ Clear History')
              .setStyle(ButtonStyle.Secondary)
          );

          await interaction.reply({ embeds: [embed], components: [row] });

        }
        catch (error) {
          console.error('AI chat error:', error);
          await interaction.reply({
            content: '❌ Failed to generate AI response. Please try again.',
            flags: MessageFlags.Ephemeral
          });
        }

        break;
      }
      case 'analyze': {
        const text = interaction.options.getString('text');

        // Validate inputs
        if (!text || text.trim().length === 0) {
          return interaction.reply({
            content: '❌ Please provide text to analyze.',
            flags: MessageFlags.Ephemeral
          });
        }

        if (text.length > 1000) {
          return interaction.reply({
            content: '❌ Text is too long. Please keep it under 1000 characters.',
            flags: MessageFlags.Ephemeral
          });
        }

        try {
          const sentiment = await analyzeSentiment(text.trim());

          if (!sentiment || !['positive', 'negative', 'neutral'].includes(sentiment)) {
            throw new Error('Invalid sentiment result');
          }

          const embed = new EmbedBuilder()
            .setTitle('📊 Sentiment Analysis')
            .setColor(sentiment === 'positive' ? 0x00_FF_00 : (sentiment === 'negative' ? 0xFF_00_00 : 0xFF_FF_00))
            .setDescription(`**Text:** ${text.length > 500 ? text.slice(0, 497) + '...' : text}`)
            .addFields({
              name: 'Sentiment',
              value: sentiment.toUpperCase(),
              inline: false
            });

          await interaction.reply({ embeds: [embed] });

        }
        catch (error) {
          console.error('Sentiment analysis error:', error);
          await interaction.reply({
            content: '❌ Failed to analyze sentiment.',
            flags: MessageFlags.Ephemeral
          });
        }

        break;
      }
      case 'summarize': {
        const text = interaction.options.getString('text');
        const maxLength = interaction.options.getInteger('length') || 200;

        // Validate inputs
        if (!text || text.trim().length === 0) {
          return interaction.reply({
            content: '❌ Please provide text to summarize.',
            flags: MessageFlags.Ephemeral
          });
        }

        if (text.length < 50) {
          return interaction.reply({
            content: '❌ Text is too short to summarize. Please provide at least 50 characters.',
            flags: MessageFlags.Ephemeral
          });
        }

        if (maxLength < 50 || maxLength > 1000) {
          return interaction.reply({
            content: '❌ Summary length must be between 50 and 1000 characters.',
            flags: MessageFlags.Ephemeral
          });
        }

        try {
          const summary = await generateSummary(text.trim(), maxLength);

          if (!summary || typeof summary !== 'string') {
            throw new Error('Invalid summary result');
          }

          const embed = new EmbedBuilder()
            .setTitle('📝 Text Summary')
            .setColor(0x99_32_CC)
            .setDescription(summary.length > 4000 ? summary.slice(0, 3997) + '...' : summary)
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

        }
        catch (error) {
          console.error('Summarization error:', error);
          await interaction.reply({
            content: '❌ Failed to summarize text.',
            flags: MessageFlags.Ephemeral
          });
        }

        break;
      }
      case 'translate': {
        const text = interaction.options.getString('text');
        const language = interaction.options.getString('language');

        // Validate inputs
        if (!text || text.trim().length === 0) {
          return interaction.reply({
            content: '❌ Please provide text to translate.',
            flags: MessageFlags.Ephemeral
          });
        }

        if (!language || language.trim().length === 0) {
          return interaction.reply({
            content: '❌ Please specify a target language.',
            flags: MessageFlags.Ephemeral
          });
        }

        if (text.length > 1000) {
          return interaction.reply({
            content: '❌ Text is too long. Please keep it under 1000 characters.',
            flags: MessageFlags.Ephemeral
          });
        }

        try {
          const translation = await translateText(text.trim(), language.trim());

          if (!translation || typeof translation !== 'string') {
            throw new Error('Invalid translation result');
          }

          const embed = new EmbedBuilder()
            .setTitle('🌐 Translation')
            .setColor(0x4C_AF_50)
            .addFields(
              { name: 'Original', value: text.length > 1024 ? text.slice(0, 1021) + '...' : text, inline: false },
              { name: `Translated (${language.toUpperCase()})`, value: translation.length > 1024 ? translation.slice(0, 1021) + '...' : translation, inline: false }
            );

          await interaction.reply({ embeds: [embed] });

        }
        catch (error) {
          console.error('Translation error:', error);
          await interaction.reply({
            content: '❌ Failed to translate text.',
            flags: MessageFlags.Ephemeral
          });
        }

        break;
      }
      case 'ideas': {
        const topic = interaction.options.getString('topic');
        const count = interaction.options.getInteger('count') || 5;

        // Validate inputs
        if (!topic || topic.trim().length === 0) {
          return interaction.reply({
            content: '❌ Please provide a topic for idea generation.',
            flags: MessageFlags.Ephemeral
          });
        }

        if (count < 1 || count > 10) {
          return interaction.reply({
            content: '❌ Number of ideas must be between 1 and 10.',
            flags: MessageFlags.Ephemeral
          });
        }

        if (topic.length > 100) {
          return interaction.reply({
            content: '❌ Topic is too long. Please keep it under 100 characters.',
            flags: MessageFlags.Ephemeral
          });
        }

        try {
          const ideas = await generateIdeas(topic.trim(), count);

          if (!Array.isArray(ideas) || ideas.length === 0) {
            throw new Error('Invalid ideas result');
          }

          const validIdeas = ideas.filter(idea => idea && typeof idea === 'string').slice(0, count);
          const embed = new EmbedBuilder()
            .setTitle(`💡 Ideas for "${topic}"`)
            .setColor(0xFF_98_00)
            .setDescription(validIdeas.map((idea, index) => `${index + 1}. ${idea.slice(0, 200)}`).join('\n'));

          await interaction.reply({ embeds: [embed] });

        }
        catch (error) {
          console.error('Idea generation error:', error);
          await interaction.reply({
            content: '❌ Failed to generate ideas.',
            flags: MessageFlags.Ephemeral
          });
        }

        break;
      }
      case 'code': {
        const language = interaction.options.getString('language');
        const description = interaction.options.getString('description');

        // Validate inputs
        if (!language || language.trim().length === 0) {
          return interaction.reply({
            content: '❌ Please specify a programming language.',
            flags: MessageFlags.Ephemeral
          });
        }

        if (!description || description.trim().length === 0) {
          return interaction.reply({
            content: '❌ Please provide a description for the code.',
            flags: MessageFlags.Ephemeral
          });
        }

        if (language.length > 20 || description.length > 500) {
          return interaction.reply({
            content: '❌ Language or description is too long.',
            flags: MessageFlags.Ephemeral
          });
        }

        try {
          const code = await generateCodeSnippet(language.trim(), description.trim());

          if (!code || typeof code !== 'string') {
            throw new Error('Invalid code result');
          }

          const embed = new EmbedBuilder()
            .setTitle(`💻 ${language.toUpperCase()} Code`)
            .setColor(0x33_33_33)
            .setDescription('```' + language.toLowerCase() + '\n' + (code.length > 1500 ? code.slice(0, 1497) + '...' : code) + '\n```')
            .addFields({
              name: 'Description',
              value: description.length > 1024 ? description.slice(0, 1021) + '...' : description,
              inline: false
            });

          await interaction.reply({ embeds: [embed] });

        }
        catch (error) {
          console.error('Code generation error:', error);
          await interaction.reply({
            content: '❌ Failed to generate code.',
            flags: MessageFlags.Ephemeral
          });
        }

        break;
      }
      case 'models': {
        try {
          const models = getAvailableModels();

          if (!Array.isArray(models)) {
            throw new TypeError('Invalid models data');
          }

          const embed = new EmbedBuilder()
            .setTitle('🤖 Available AI Models')
            .setColor(0x00_99_FF);

          const validModels = models.filter(model => model && model.name && model.description).slice(0, 10);
          for (const model of validModels) {
            embed.addFields({
              name: model.name.slice(0, 256),
              value: model.description.slice(0, 1024),
              inline: false
            });
          }

          await interaction.reply({ embeds: [embed] });
        }
        catch (error) {
          console.error('Error fetching models:', error);
          await interaction.reply({
            content: '❌ Failed to fetch available models.',
            flags: MessageFlags.Ephemeral
          });
        }

        break;
      }
      case 'personalities': {
        try {
          const personalities = getAvailablePersonalities();

          if (!Array.isArray(personalities)) {
            throw new TypeError('Invalid personalities data');
          }

          const embed = new EmbedBuilder()
            .setTitle('🎭 Available Personalities')
            .setColor(0xE9_1E_63);

          const validPersonalities = personalities.filter(p => p && p.name && p.style).slice(0, 10);
          for (const personality of validPersonalities) {
            embed.addFields({
              name: personality.name.slice(0, 256),
              value: `Style: ${personality.style.slice(0, 768)}`,
              inline: false
            });
          }

          await interaction.reply({ embeds: [embed] });
        }
        catch (error) {
          console.error('Error fetching personalities:', error);
          await interaction.reply({
            content: '❌ Failed to fetch available personalities.',
            flags: MessageFlags.Ephemeral
          });
        }

        break;
      }
      case 'recommend': {
        try {
          const recommendations = await generateRecommendations(interaction.user.id, 'general');

          if (!Array.isArray(recommendations)) {
            throw new TypeError('Invalid recommendations result');
          }

          const validRecommendations = recommendations.filter(rec => rec && typeof rec === 'string').slice(0, 10);
          const embed = new EmbedBuilder()
            .setTitle('💡 Personalized Recommendations')
            .setColor(0xFF_C1_07)
            .setDescription(validRecommendations.map((rec, index) => `${index + 1}. ${rec.slice(0, 200)}`).join('\n'));

          await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        }
        catch (error) {
          console.error('Recommendation error:', error);
          await interaction.reply({
            content: '❌ Failed to generate recommendations.',
            flags: MessageFlags.Ephemeral
          });
        }

        break;
      }
      case 'clear': {
        try {
          clearUserHistory(interaction.user.id);
          await interaction.reply({
            content: '🧹 **AI conversation history cleared!** Starting fresh.',
            flags: MessageFlags.Ephemeral
          });
        }
        catch (error) {
          console.error('Error clearing history:', error);
          await interaction.reply({
            content: '❌ Failed to clear conversation history.',
            flags: MessageFlags.Ephemeral
          });
        }

        break;
      }
    // No default
    }

  }
  catch (error) {
    console.error('AI command error:', error);
    try {
      if (interaction && typeof interaction.reply === 'function') {
        await interaction.reply({
          content: '❌ An unexpected error occurred. Please try again later.',
          flags: MessageFlags.Ephemeral
        });
      }
    }
    catch (replyError) {
      console.error('Failed to send error reply:', replyError);
    }
  }
}
