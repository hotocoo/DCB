import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
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

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'joke') {
    const category = interaction.options.getString('category') || 'general';
    const joke = getRandomJoke(category);

    const embed = new EmbedBuilder()
      .setTitle('😂 Random Joke')
      .setColor(0xFFD700)
      .setDescription(joke.joke)
      .setFooter({ text: `${category.charAt(0).toUpperCase() + category.slice(1)} Jokes` });

    // Track entertainment stats
    updateEntertainmentStats(interaction.user.id, 'jokesHeard');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`fun_joke:${category}:${interaction.user.id}`).setLabel('😂 Another Joke').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`fun_rate:${joke.id}:5:${interaction.user.id}`).setLabel('⭐ Rate 5 Stars').setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [embed], components: [row] });

  } else if (sub === 'story') {
    const prompt = interaction.options.getString('prompt');
    const genre = interaction.options.getString('genre') || 'fantasy';
    const story = generateStory(prompt, genre);

    const embed = new EmbedBuilder()
      .setTitle(`📖 ${genre.charAt(0).toUpperCase() + genre.slice(1)} Story`)
      .setColor(0x9932CC)
      .setDescription(story.story)
      .addFields({
        name: '🎯 Prompt',
        value: prompt,
        inline: false
      });

    // Track entertainment stats
    updateEntertainmentStats(interaction.user.id, 'storiesGenerated');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`fun_story:${genre}:${interaction.user.id}`).setLabel('📖 Another Story').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`fun_share:${story.id}:${interaction.user.id}`).setLabel('📤 Share Story').setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [embed], components: [row] });

  } else if (sub === 'riddle') {
    const difficulty = interaction.options.getString('difficulty') || 'medium';
    const riddle = getRiddle(difficulty);

    const embed = new EmbedBuilder()
      .setTitle(`🧩 ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} Riddle`)
      .setColor(0xFF8C00)
      .setDescription(riddle.riddle)
      .setFooter({ text: 'Think hard and reply with your answer!' });

    // Track entertainment stats
    updateEntertainmentStats(interaction.user.id, 'riddlesAttempted');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`fun_riddle:${difficulty}:${riddle.id}:${interaction.user.id}`).setLabel('💡 Show Answer').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`fun_riddle_new:${difficulty}:${interaction.user.id}`).setLabel('🧩 Another Riddle').setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [embed], components: [row] });

  } else if (sub === 'fact') {
    const category = interaction.options.getString('category') || 'random';
    const fact = getFunFact(category);

    const embed = new EmbedBuilder()
      .setTitle(`🧠 ${category === 'random' ? 'Random' : category.charAt(0).toUpperCase() + category.slice(1)} Fun Fact`)
      .setColor(0x4CAF50)
      .setDescription(fact.fact)
      .setFooter({ text: `${fact.category} Facts` });

    // Track entertainment stats
    updateEntertainmentStats(interaction.user.id, 'factsLearned');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`fun_fact:${category}:${interaction.user.id}`).setLabel('🧠 Another Fact').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`fun_share:${fact.id}:${interaction.user.id}`).setLabel('📤 Share Fact').setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [embed], components: [row] });

  } else if (sub === 'quote') {
    const category = interaction.options.getString('category') || 'inspirational';
    const quote = getRandomQuote(category);

    const embed = new EmbedBuilder()
      .setTitle(`💬 ${category.charAt(0).toUpperCase() + category.slice(1)} Quote`)
      .setColor(0xE91E63)
      .addFields(
        { name: 'Quote', value: `"${quote.quote}"`, inline: false },
        { name: 'Author', value: quote.author, inline: true },
        { name: 'Category', value: category, inline: true }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`fun_quote:${category}:${interaction.user.id}`).setLabel('💬 Another Quote').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`fun_share:${quote.id}:${interaction.user.id}`).setLabel('📤 Share Quote').setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [embed], components: [row] });

  } else if (sub === '8ball') {
    const question = interaction.options.getString('question');
    const result = magic8Ball(question);

    const embed = new EmbedBuilder()
      .setTitle('🔮 Magic 8-Ball')
      .setColor(0x9C27B0)
      .addFields(
        { name: 'Question', value: question, inline: false },
        { name: 'Answer', value: result.answer, inline: false }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`fun_8ball:${interaction.user.id}`).setLabel('🔮 Ask Again').setStyle(ButtonStyle.Primary)
    );

    await interaction.reply({ embeds: [embed], components: [row] });

  } else if (sub === 'name') {
    const type = interaction.options.getString('type') || 'superhero';
    const name = generateFunName(type);

    const embed = new EmbedBuilder()
      .setTitle(`🎭 ${type.charAt(0).toUpperCase() + type.slice(1)} Name Generator`)
      .setColor(0xFF5722)
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

    await interaction.reply({ embeds: [embed], components: [row] });

  } else if (sub === 'challenge') {
    const type = interaction.options.getString('type') || 'daily';
    const challenge = createFunChallenge(type);

    const embed = new EmbedBuilder()
      .setTitle(`🎯 ${type.charAt(0).toUpperCase() + type.slice(1)} Challenge`)
      .setColor(0xFFC107)
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

    await interaction.reply({ embeds: [embed], components: [row] });

  } else if (sub === 'leaderboard') {
    const category = interaction.options.getString('category') || 'jokes';
    const leaderboard = getFunLeaderboard(category, 10);

    if (leaderboard.length === 0) {
      return interaction.reply({ content: '🏆 No data available for this leaderboard yet. Be the first to participate!', flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setTitle(`🏆 Fun Leaderboard - ${category.charAt(0).toUpperCase() + category.slice(1)}`)
      .setColor(0xFFD700);

    leaderboard.forEach((entry, index) => {
      const rank = index + 1;
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅';
      embed.addFields({
        name: `${medal} #${rank}`,
        value: `**${entry.score}** ${category}`,
        inline: true
      });
    });

    await interaction.reply({ embeds: [embed] });
  }
}