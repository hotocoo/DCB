import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';

import { CommandError, handleCommandError } from '../errorHandler';
import { safeInteractionReply, safeInteractionUpdate } from '../interactionHandlers';
import {
  getRandomJoke,
  generateStory,
  getRiddle,
  getFunFact,
  getRandomQuote,
  magic8Ball,
  generateFunName,
  getPersonalityQuestion,
  updateEntertainmentStats,
  createFunChallenge,
  getFunLeaderboard
} from '../entertainment.js';

export const data = new SlashCommandBuilder()
  .setName('fun')
  .setDescription('Entertainment and fun commands - jokes, stories, riddles, and more')
  .addSubcommand(sub => sub.setName('joke').setDescription('Get a random joke').addStringOption(opt => opt.setName('category').setDescription('Joke category').addChoices(
    { name: 'General', value: 'general' },
    { name: 'Programming', value: 'programming' },
    { name: 'Dad Jokes', value: 'dad' },
    { name: 'Math', value: 'math' },
    { name: 'Science', value: 'science' }
  ).setRequired(false)))
  .addSubcommand(sub => sub.setName('story').setDescription('Generate a creative story').addStringOption(opt => opt.setName('prompt').setDescription('Story prompt').setRequired(true)).addStringOption(opt => opt.setName('genre').setDescription('Story genre').addChoices(
    { name: 'Fantasy', value: 'fantasy' },
    { name: 'Adventure', value: 'adventure' },
    { name: 'Mystery', value: 'mystery' },
    { name: 'Sci-Fi', value: 'sciFi' }
  ).setRequired(false)))
  .addSubcommand(sub => sub.setName('riddle').setDescription('Get a riddle to solve').addStringOption(opt => opt.setName('difficulty').setDescription('Riddle difficulty').addChoices(
    { name: 'Easy', value: 'easy' },
    { name: 'Medium', value: 'medium' },
    { name: 'Hard', value: 'hard' }
  ).setRequired(false)))
  .addSubcommand(sub => sub.setName('fact').setDescription('Get a fun fact').addStringOption(opt => opt.setName('category').setDescription('Fact category').addChoices(
    { name: 'Random', value: 'random' },
    { name: 'Animals', value: 'animals' },
    { name: 'Space', value: 'space' },
    { name: 'Science', value: 'science' },
    { name: 'History', value: 'history' }
  ).setRequired(false)))
  .addSubcommand(sub => sub.setName('quote').setDescription('Get an inspirational quote').addStringOption(opt => opt.setName('category').setDescription('Quote category').addChoices(
    { name: 'Inspirational', value: 'inspirational' },
    { name: 'Motivational', value: 'motivational' },
    { name: 'Wisdom', value: 'wisdom' },
    { name: 'Humor', value: 'humor' }
  ).setRequired(false)))
  .addSubcommand(sub => sub.setName('8ball').setDescription('Ask the magic 8-ball').addStringOption(opt => opt.setName('question').setDescription('Your question').setRequired(true)))
  .addSubcommand(sub => sub.setName('name').setDescription('Generate a fun name').addStringOption(opt => opt.setName('type').setDescription('Name type').addChoices(
    { name: 'Superhero', value: 'superhero' },
    { name: 'Villain', value: 'villain' },
    { name: 'Fantasy', value: 'fantasy' },
    { name: 'Sci-Fi', value: 'sciFi' }
  ).setRequired(false)))
  .addSubcommand(sub => sub.setName('challenge').setDescription('Get a fun challenge').addStringOption(opt => opt.setName('type').setDescription('Challenge type').addChoices(
    { name: 'Daily', value: 'daily' },
    { name: 'Weekly', value: 'weekly' },
    { name: 'Monthly', value: 'monthly' }
  ).setRequired(false)))
  .addSubcommand(sub => sub.setName('leaderboard').setDescription('View fun leaderboards').addStringOption(opt => opt.setName('category').setDescription('Leaderboard category').addChoices(
    { name: 'Jokes Told', value: 'jokes' },
    { name: 'Riddles Solved', value: 'riddles' },
    { name: 'Stories Generated', value: 'stories' }
  ).setRequired(false)));

/**
* @param {import('discord.js').ChatInputCommandInteraction} interaction
*/
export async function execute(interaction) {
  try {
    const sub = interaction.options.getSubcommand();

    switch (sub) {
      case 'joke': {
        const category = interaction.options.getString('category') || 'general';
        const joke = getRandomJoke(category);

        if (!joke || !joke.joke) {
          throw new CommandError('Failed to retrieve joke. Please try again.', 'ENTERTAINMENT_ERROR');
        }

        const embed = new EmbedBuilder()
          .setTitle('😂 Random Joke')
          .setColor(0xFF_D7_00)
          .setDescription(joke.joke)
          .setFooter({ text: `${category.charAt(0).toUpperCase() + category.slice(1)} Jokes` });

        // Track entertainment stats
        try {
          updateEntertainmentStats(interaction.user.id, 'jokesHeard');
        }
        catch (error) {
          console.warn('Failed to update joke stats:', error instanceof Error ? error.message : String(error));
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`fun_joke:${category}:${interaction.user.id}`).setLabel('😂 Another Joke').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`fun_rate:${joke.id}:5:${interaction.user.id}`).setLabel('⭐ Rate 5 Stars').setStyle(ButtonStyle.Secondary)
        );

        await safeInteractionReply(interaction, { embeds: [embed], components: [row] });

        break;
      }
      case 'story': {
        const prompt = interaction.options.getString('prompt');
        const genre = interaction.options.getString('genre') || 'fantasy';

        if (!prompt || prompt.trim().length === 0) {
          throw new CommandError('Story prompt cannot be empty.', 'INVALID_ARGUMENT');
        }

        if (prompt.length > 500) {
          throw new CommandError('Story prompt is too long. Maximum 500 characters allowed.', 'INVALID_ARGUMENT');
        }

        const story = generateStory(prompt, genre);

        if (!story || !story.story) {
          throw new CommandError('Failed to generate story. Please try again.', 'ENTERTAINMENT_ERROR');
        }

        const embed = new EmbedBuilder()
          .setTitle(`📖 ${genre.charAt(0).toUpperCase() + genre.slice(1)} Story`)
          .setColor(0x99_32_CC)
          .setDescription(story.story)
          .addFields({
            name: '🎯 Prompt',
            value: prompt,
            inline: false
          });

        // Track entertainment stats
        try {
          updateEntertainmentStats(interaction.user.id, 'storiesGenerated');
        }
        catch (error) {
          console.warn('Failed to update story stats:', error instanceof Error ? error.message : String(error));
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`fun_story:${genre}:${interaction.user.id}`).setLabel('📖 Another Story').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`fun_share:${story.id}:${interaction.user.id}`).setLabel('📤 Share Story').setStyle(ButtonStyle.Secondary)
        );

        await safeInteractionReply(interaction, { embeds: [embed], components: [row] });

        break;
      }
      case 'riddle': {
        const difficulty = interaction.options.getString('difficulty') || 'medium';
        const riddle = getRiddle(difficulty);

        if (!riddle || !riddle.riddle) {
          throw new CommandError('Failed to retrieve riddle. Please try again.', 'ENTERTAINMENT_ERROR');
        }

        const embed = new EmbedBuilder()
          .setTitle(`🧩 ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} Riddle`)
          .setColor(0xFF_8C_00)
          .setDescription(riddle.riddle)
          .setFooter({ text: 'Think hard and reply with your answer!' });

        // Track entertainment stats
        try {
          updateEntertainmentStats(interaction.user.id, 'riddlesAttempted');
        }
        catch (error) {
          console.warn('Failed to update riddle stats:', error instanceof Error ? error.message : String(error));
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`fun_riddle:${difficulty}:${riddle.id}:${interaction.user.id}`).setLabel('💡 Show Answer').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`fun_riddle_new:${difficulty}:${interaction.user.id}`).setLabel('🧩 Another Riddle').setStyle(ButtonStyle.Secondary)
        );

        await safeInteractionReply(interaction, { embeds: [embed], components: [row] });

        break;
      }
      case 'fact': {
        const category = interaction.options.getString('category') || 'random';
        const fact = getFunFact(category);

        if (!fact || !fact.fact) {
          throw new CommandError('Failed to retrieve fun fact. Please try again.', 'ENTERTAINMENT_ERROR');
        }

        const embed = new EmbedBuilder()
          .setTitle(`🧠 ${category === 'random' ? 'Random' : category.charAt(0).toUpperCase() + category.slice(1)} Fun Fact`)
          .setColor(0x4C_AF_50)
          .setDescription(fact.fact)
          .setFooter({ text: `${fact.category} Facts` });

        // Track entertainment stats
        try {
          updateEntertainmentStats(interaction.user.id, 'factsLearned');
        }
        catch (error) {
          console.warn('Failed to update fact stats:', error instanceof Error ? error.message : String(error));
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`fun_fact:${category}:${interaction.user.id}`).setLabel('🧠 Another Fact').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`fun_share:${fact.id}:${interaction.user.id}`).setLabel('📤 Share Fact').setStyle(ButtonStyle.Secondary)
        );

        await safeInteractionReply(interaction, { embeds: [embed], components: [row] });

        break;
      }
      case 'quote': {
        const category = interaction.options.getString('category') || 'inspirational';
        const quote = getRandomQuote(category);

        if (!quote || !quote.quote || !quote.author) {
          throw new CommandError('Failed to retrieve quote. Please try again.', 'ENTERTAINMENT_ERROR');
        }

        const embed = new EmbedBuilder()
          .setTitle(`💬 ${category.charAt(0).toUpperCase() + category.slice(1)} Quote`)
          .setColor(0xE9_1E_63)
          .addFields(
            { name: 'Quote', value: `"${quote.quote}"`, inline: false },
            { name: 'Author', value: quote.author, inline: true },
            { name: 'Category', value: category, inline: true }
          );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`fun_quote:${category}:${interaction.user.id}`).setLabel('💬 Another Quote').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`fun_share:${quote.id}:${interaction.user.id}`).setLabel('📤 Share Quote').setStyle(ButtonStyle.Secondary)
        );

        await safeInteractionReply(interaction, { embeds: [embed], components: [row] });

        break;
      }
      case '8ball': {
        const question = interaction.options.getString('question');

        if (!question || question.trim().length === 0) {
          throw new CommandError('8-ball question cannot be empty.', 'INVALID_ARGUMENT');
        }

        if (question.length > 200) {
          throw new CommandError('8-ball question is too long. Maximum 200 characters allowed.', 'INVALID_ARGUMENT');
        }

        const result = magic8Ball(question);

        if (!result || !result.answer) {
          throw new CommandError('Failed to get 8-ball response. Please try again.', 'ENTERTAINMENT_ERROR');
        }

        const embed = new EmbedBuilder()
          .setTitle('🔮 Magic 8-Ball')
          .setColor(0x9C_27_B0)
          .addFields(
            { name: 'Question', value: question, inline: false },
            { name: 'Answer', value: result.answer, inline: false }
          );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`fun_8ball:${interaction.user.id}`).setLabel('🔮 Ask Again').setStyle(ButtonStyle.Primary)
        );

        await safeInteractionReply(interaction, { embeds: [embed], components: [row] });

        break;
      }
      case 'name': {
        const type = interaction.options.getString('type') || 'superhero';
        const name = generateFunName(type);

        if (!name || !name.name) {
          throw new CommandError('Failed to generate fun name. Please try again.', 'ENTERTAINMENT_ERROR');
        }

        const embed = new EmbedBuilder()
          .setTitle(`🎭 ${type.charAt(0).toUpperCase() + type.slice(1)} Name Generator`)
          .setColor(0xFF_57_22)
          .setDescription(`**Your ${type} name:** ${name.name}`)
          .addFields({
            name: 'Type',
            value: type,
            inline: true
          });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`fun_name:${type}:${interaction.user.id}`).setLabel('🎭 Another Name').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`fun_name_random:${interaction.user.id}`).setLabel('🎲 Random Type').setStyle(ButtonStyle.Secondary)
        );

        await safeInteractionReply(interaction, { embeds: [embed], components: [row] });

        break;
      }
      case 'challenge': {
        const type = interaction.options.getString('type') || 'daily';
        const challenge = createFunChallenge(type);

        if (!challenge || !challenge.challenge) {
          throw new CommandError('Failed to generate challenge. Please try again.', 'ENTERTAINMENT_ERROR');
        }

        const embed = new EmbedBuilder()
          .setTitle(`🎯 ${type.charAt(0).toUpperCase() + type.slice(1)} Challenge`)
          .setColor(0xFF_C1_07)
          .setDescription(challenge.challenge)
          .addFields({
            name: 'Reward',
            value: challenge.reward,
            inline: false
          });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`fun_challenge:${type}:${interaction.user.id}`).setLabel('🎯 Accept Challenge').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`fun_challenge_new:${type}:${interaction.user.id}`).setLabel('🔄 New Challenge').setStyle(ButtonStyle.Secondary)
        );

        await safeInteractionReply(interaction, { embeds: [embed], components: [row] });

        break;
      }
      case 'leaderboard': {
        const category = interaction.options.getString('category') || 'jokes';

        const leaderboard = getFunLeaderboard(category, 10);

        if (!Array.isArray(leaderboard)) {
          throw new CommandError('Failed to retrieve leaderboard data.', 'ENTERTAINMENT_ERROR');
        }

        if (leaderboard.length === 0) {
          return await safeInteractionReply(interaction, {
            content: '🏆 No data available for this leaderboard yet. Be the first to participate!',
            flags: MessageFlags.Ephemeral
          });
        }

        const embed = new EmbedBuilder()
          .setTitle(`🏆 Fun Leaderboard - ${category.charAt(0).toUpperCase() + category.slice(1)}`)
          .setColor(0xFF_D7_00);

        for (const [index, entry] of leaderboard.entries()) {
          if (!entry || typeof entry.score !== 'number') {
            console.warn('Invalid leaderboard entry:', entry);
            continue;
          }
          const rank = index + 1;
          const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅';
          embed.addFields({
            name: `${medal} #${rank}`,
            value: `**${entry.score}** ${category}`,
            inline: true
          });
        }

        await safeInteractionReply(interaction, { embeds: [embed] });

        break;
      }
    // No default
    }
  }
  catch (error) {
    console.error('Error in fun command execution:', error);
    await handleCommandError(interaction, error instanceof CommandError ? error :
      new CommandError(error instanceof Error ? error.message : String(error) || 'An error occurred while processing the fun command.', 'UNKNOWN_ERROR'));
  }
  return;
}
