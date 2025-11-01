import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import {
  getNews,
  getRandomJoke,
  getCatFact,
  getNumberFact,
  getDadJoke,
  getProgrammingQuote,
  getGitHubStats,
  getWeather,
  setAPIKey,
  getAPIKey,
  getIntegrationStats
} from '../integrations.js';

export const data = new SlashCommandBuilder()
  .setName('api')
  .setDescription('External API integrations - news, jokes, facts, and more')
  .addSubcommand(sub => sub.setName('news').setDescription('Get latest news').addStringOption(opt => opt.setName('query').setDescription('Search topic').setRequired(false)))
  .addSubcommand(sub => sub.setName('joke').setDescription('Get a random joke'))
  .addSubcommand(sub => sub.setName('catfact').setDescription('Get a random cat fact'))
  .addSubcommand(sub => sub.setName('numberfact').setDescription('Get a fact about a number').addIntegerOption(opt => opt.setName('number').setDescription('Number (1-1000, random if not specified)').setRequired(false)))
  .addSubcommand(sub => sub.setName('dadjoke').setDescription('Get a dad joke'))
  .addSubcommand(sub => sub.setName('programquote').setDescription('Get a programming quote'))
  .addSubcommand(sub => sub.setName('github').setDescription('Get GitHub user stats').addStringOption(opt => opt.setName('username').setDescription('GitHub username').setRequired(true)))
  .addSubcommand(sub => sub.setName('weather').setDescription('Get weather info').addStringOption(opt => opt.setName('location').setDescription('Location').setRequired(true)))
  .addSubcommand(sub => sub.setName('stats').setDescription('API usage statistics'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'news') {
    const query = interaction.options.getString('query') || 'technology';

    const result = await getNews(query, 5);
    if (!result.success) {
      return interaction.reply({ content: `❌ ${result.reason}`, flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setTitle(`📰 Latest News: ${query}`)
      .setColor(0x0099FF);

    result.data.slice(0, 3).forEach((article, index) => {
      embed.addFields({
        name: `${index + 1}. ${article.title}`,
        value: `${article.description || 'No description available'}\n[Read more](${article.url})`,
        inline: false
      });
    });

    await interaction.reply({ embeds: [embed] });

  } else if (sub === 'joke') {
    const result = await getRandomJoke();
    if (!result.success) {
      return interaction.reply({ content: '❌ Failed to get joke. Please try again later.', flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setTitle('😂 Random Joke')
      .setColor(0xFFD700)
      .setDescription(`**${result.data.setup}**\n\n${result.data.punchline}`)
      .setFooter({ text: 'Powered by Official Joke API' });

    await interaction.reply({ embeds: [embed] });

  } else if (sub === 'catfact') {
    const result = await getCatFact();
    if (!result.success) {
      return interaction.reply({ content: '❌ Failed to get cat fact. Please try again later.', flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setTitle('🐱 Cat Fact')
      .setColor(0xFF69B4)
      .setDescription(result.data.fact)
      .setFooter({ text: 'Powered by Cat Facts API' });

    await interaction.reply({ embeds: [embed] });

  } else if (sub === 'numberfact') {
    const number = interaction.options.getInteger('number');

    const result = await getNumberFact(number);
    if (!result.success) {
      return interaction.reply({ content: '❌ Failed to get number fact. Please try again later.', flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setTitle(`🔢 Fact about ${result.data.number}`)
      .setColor(0x9932CC)
      .setDescription(result.data.text)
      .setFooter({ text: 'Powered by Numbers API' });

    await interaction.reply({ embeds: [embed] });

  } else if (sub === 'dadjoke') {
    const result = await getDadJoke();
    if (!result.success) {
      return interaction.reply({ content: '❌ Failed to get dad joke. Please try again later.', flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setTitle('👨‍🦳 Dad Joke')
      .setColor(0xFF8C00)
      .setDescription(result.data.joke)
      .setFooter({ text: 'Powered by Dad Jokes API' });

    await interaction.reply({ embeds: [embed] });

  } else if (sub === 'programquote') {
    const result = await getProgrammingQuote();
    if (!result.success) {
      return interaction.reply({ content: '❌ Failed to get programming quote. Please try again later.', flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setTitle('💻 Programming Quote')
      .setColor(0x4CAF50)
      .addFields(
        { name: 'Quote', value: `"${result.data.en}"`, inline: false },
        { name: 'Author', value: result.data.author, inline: true },
        { name: 'Rating', value: `⭐ ${result.data.rating}`, inline: true }
      )
      .setFooter({ text: 'Powered by Programming Quotes API' });

    await interaction.reply({ embeds: [embed] });

  } else if (sub === 'github') {
    const username = interaction.options.getString('username');

    const result = await getGitHubStats(username);
    if (!result.success) {
      return interaction.reply({ content: `❌ Failed to get GitHub stats for ${username}. User may not exist.`, flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setTitle(`🐙 GitHub Stats: ${result.data.name || username}`)
      .setColor(0x333333)
      .setDescription(result.data.bio || 'No bio available')
      .addFields(
        { name: '📍 Location', value: result.data.location || 'Not specified', inline: true },
        { name: '📚 Public Repos', value: result.data.publicRepos, inline: true },
        { name: '👥 Followers', value: result.data.followers, inline: true },
        { name: '👤 Following', value: result.data.following, inline: true }
      )
      .setFooter({ text: `Account created: ${new Date(result.data.created).toLocaleDateString()}` });

    await interaction.reply({ embeds: [embed] });

  } else if (sub === 'weather') {
    const location = interaction.options.getString('location');

    const result = await getWeather(location);
    if (!result.success) {
      return interaction.reply({ content: `❌ ${result.reason}`, flags: MessageFlags.Ephemeral });
    }

    const data = result.data;
    const embed = new EmbedBuilder()
      .setTitle(`🌤️ Weather in ${data.name}, ${data.sys.country}`)
      .setColor(0x0099FF)
      .addFields(
        { name: '🌡️ Temperature', value: `**${Math.round(data.main.temp)}°C** (Feels like ${Math.round(data.main.feels_like)}°C)`, inline: true },
        { name: '💧 Humidity', value: `**${data.main.humidity}%**`, inline: true },
        { name: '🌬️ Wind', value: `**${Math.round(data.wind.speed * 3.6)} km/h**`, inline: true },
        { name: '🌥️ Conditions', value: `${getWeatherEmoji(data.weather[0].main)} **${data.weather[0].description}**`, inline: true },
        { name: '📊 Pressure', value: `**${data.main.pressure} hPa**`, inline: true },
        { name: '👁️ Visibility', value: `**${(data.visibility / 1000).toFixed(1)} km**`, inline: true }
      )
      .setFooter({ text: 'Powered by OpenWeatherMap' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

  } else if (sub === 'stats') {
    const stats = getIntegrationStats();

    const embed = new EmbedBuilder()
      .setTitle('🔌 API Integration Statistics')
      .setColor(0x9932CC)
      .setDescription('External service usage and performance')
      .addFields(
        { name: '🔑 Configured APIs', value: stats.apiKeys, inline: true },
        { name: '📊 Total Requests', value: stats.totalUsage, inline: true },
        { name: '❌ Errors', value: stats.totalErrors, inline: true },
        { name: '💾 Cache Size', value: `${stats.cacheSize} entries`, inline: true }
      );

    if (stats.totalUsage > 0) {
      const successRate = ((stats.totalUsage - stats.totalErrors) / stats.totalUsage * 100).toFixed(1);
      embed.addFields({
        name: '📈 Success Rate',
        value: `${successRate}%`,
        inline: true
      });
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

function getWeatherEmoji(condition) {
  const emojis = {
    'Clear': '☀️',
    'Clouds': '☁️',
    'Rain': '🌧️',
    'Drizzle': '🌦️',
    'Thunderstorm': '⛈️',
    'Snow': '❄️',
    'Mist': '🌫️',
    'Fog': '🌫️',
    'Haze': '🌫️'
  };
  return emojis[condition] || '🌤️';
}