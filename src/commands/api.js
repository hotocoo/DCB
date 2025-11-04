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
  try {
    // Validate interaction object
    if (!interaction || !interaction.user || !interaction.options) {
      throw new Error('Invalid interaction object');
    }

    const sub = interaction.options.getSubcommand();

    // Validate subcommand
    const validSubcommands = ['news', 'joke', 'catfact', 'numberfact', 'dadjoke', 'programquote', 'github', 'weather', 'stats'];
    if (!validSubcommands.includes(sub)) {
      return interaction.reply({
        content: '❌ Invalid subcommand. Please use a valid API subcommand.',
        flags: MessageFlags.Ephemeral
      });
    }

    switch (sub) {
      case 'news': {
        const query = interaction.options.getString('query') || 'technology';

        // Validate inputs
        if (query && query.length > 100) {
          return interaction.reply({
            content: '❌ Search query is too long. Please keep it under 100 characters.',
            flags: MessageFlags.Ephemeral
          });
        }

        try {
          const result = await getNews(query, 5);
          if (!result || !result.success) {
            return interaction.reply({
              content: `❌ ${result?.reason || 'Failed to fetch news. Please try again later.'}`,
              flags: MessageFlags.Ephemeral
            });
          }

          if (!Array.isArray(result.data) || result.data.length === 0) {
            return interaction.reply({
              content: '❌ No news articles found for this query.',
              flags: MessageFlags.Ephemeral
            });
          }

          const embed = new EmbedBuilder()
            .setTitle(`📰 Latest News: ${query}`)
            .setColor(0x00_99_FF);

          for (const [index, article] of result.data.slice(0, 3).entries()) {
            if (article && article.title && article.url) {
              const title = article.title.slice(0, 256);
              const description = article.description ?
                (article.description.length > 500 ? article.description.slice(0, 497) + '...' : article.description) :
                'No description available';
              embed.addFields({
                name: `${index + 1}. ${title}`,
                value: `${description}\n[Read more](${article.url})`,
                inline: false
              });
            }
          }

          await interaction.reply({ embeds: [embed] });
        }
        catch (error) {
          console.error('News fetch error:', error);
          await interaction.reply({
            content: '❌ Failed to fetch news. Please try again later.',
            flags: MessageFlags.Ephemeral
          });
        }

        break;
      }
      case 'joke': {
        try {
          const result = await getRandomJoke();
          if (!result || !result.success || !result.data) {
            return interaction.reply({
              content: '❌ Failed to get joke. Please try again later.',
              flags: MessageFlags.Ephemeral
            });
          }

          const jokeData = result.data;
          if (!jokeData.setup || !jokeData.punchline) {
            throw new Error('Invalid joke data structure');
          }

          const embed = new EmbedBuilder()
            .setTitle('😂 Random Joke')
            .setColor(0xFF_D7_00)
            .setDescription(`**${jokeData.setup}**\n\n${jokeData.punchline}`)
            .setFooter({ text: 'Powered by Official Joke API' });

          await interaction.reply({ embeds: [embed] });
        }
        catch (error) {
          console.error('Joke fetch error:', error);
          await interaction.reply({
            content: '❌ Failed to get joke. Please try again later.',
            flags: MessageFlags.Ephemeral
          });
        }

        break;
      }
      case 'catfact': {
        try {
          const result = await getCatFact();
          if (!result || !result.success || !result.data || !result.data.fact) {
            return interaction.reply({
              content: '❌ Failed to get cat fact. Please try again later.',
              flags: MessageFlags.Ephemeral
            });
          }

          const embed = new EmbedBuilder()
            .setTitle('🐱 Cat Fact')
            .setColor(0xFF_69_B4)
            .setDescription(result.data.fact.length > 2000 ? result.data.fact.slice(0, 1997) + '...' : result.data.fact)
            .setFooter({ text: 'Powered by Cat Facts API' });

          await interaction.reply({ embeds: [embed] });
        }
        catch (error) {
          console.error('Cat fact fetch error:', error);
          await interaction.reply({
            content: '❌ Failed to get cat fact. Please try again later.',
            flags: MessageFlags.Ephemeral
          });
        }

        break;
      }
      case 'numberfact': {
        const number = interaction.options.getInteger('number');

        // Validate inputs
        if (number !== null && (number < 1 || number > 1000)) {
          return interaction.reply({
            content: '❌ Number must be between 1 and 1000.',
            flags: MessageFlags.Ephemeral
          });
        }

        try {
          const result = await getNumberFact(number);
          if (!result || !result.success || !result.data) {
            return interaction.reply({
              content: '❌ Failed to get number fact. Please try again later.',
              flags: MessageFlags.Ephemeral
            });
          }

          const embed = new EmbedBuilder()
            .setTitle(`🔢 Fact about ${result.data.number}`)
            .setColor(0x99_32_CC)
            .setDescription(result.data.text.length > 2000 ? result.data.text.slice(0, 1997) + '...' : result.data.text)
            .setFooter({ text: 'Powered by Numbers API' });

          await interaction.reply({ embeds: [embed] });
        }
        catch (error) {
          console.error('Number fact fetch error:', error);
          await interaction.reply({
            content: '❌ Failed to get number fact. Please try again later.',
            flags: MessageFlags.Ephemeral
          });
        }

        break;
      }
      case 'dadjoke': {
        try {
          const result = await getDadJoke();
          if (!result || !result.success || !result.data || !result.data.joke) {
            return interaction.reply({
              content: '❌ Failed to get dad joke. Please try again later.',
              flags: MessageFlags.Ephemeral
            });
          }

          const embed = new EmbedBuilder()
            .setTitle('👨‍🦳 Dad Joke')
            .setColor(0xFF_8C_00)
            .setDescription(result.data.joke.length > 2000 ? result.data.joke.slice(0, 1997) + '...' : result.data.joke)
            .setFooter({ text: 'Powered by Dad Jokes API' });

          await interaction.reply({ embeds: [embed] });
        }
        catch (error) {
          console.error('Dad joke fetch error:', error);
          await interaction.reply({
            content: '❌ Failed to get dad joke. Please try again later.',
            flags: MessageFlags.Ephemeral
          });
        }

        break;
      }
      case 'programquote': {
        try {
          const result = await getProgrammingQuote();
          if (!result || !result.success || !result.data) {
            return interaction.reply({
              content: '❌ Failed to get programming quote. Please try again later.',
              flags: MessageFlags.Ephemeral
            });
          }

          const quoteData = result.data;
          if (!quoteData.en || !quoteData.author || typeof quoteData.rating !== 'number') {
            throw new Error('Invalid quote data structure');
          }

          const embed = new EmbedBuilder()
            .setTitle('💻 Programming Quote')
            .setColor(0x4C_AF_50)
            .addFields(
              { name: 'Quote', value: `"${quoteData.en.slice(0, 1000)}"`, inline: false },
              { name: 'Author', value: quoteData.author.slice(0, 256), inline: true },
              { name: 'Rating', value: `⭐ ${quoteData.rating}`, inline: true }
            )
            .setFooter({ text: 'Powered by Programming Quotes API' });

          await interaction.reply({ embeds: [embed] });
        }
        catch (error) {
          console.error('Programming quote fetch error:', error);
          await interaction.reply({
            content: '❌ Failed to get programming quote. Please try again later.',
            flags: MessageFlags.Ephemeral
          });
        }

        break;
      }
      case 'github': {
        const username = interaction.options.getString('username');

        // Validate inputs
        if (!username || username.trim().length === 0) {
          return interaction.reply({
            content: '❌ Please provide a GitHub username.',
            flags: MessageFlags.Ephemeral
          });
        }

        if (username.length > 39 || !/^[\dA-Za-z](?:[\dA-Za-z]|-(?=[\dA-Za-z])){0,38}$/.test(username)) {
          return interaction.reply({
            content: '❌ Invalid GitHub username format.',
            flags: MessageFlags.Ephemeral
          });
        }

        try {
          const result = await getGitHubStats(username.trim());
          if (!result || !result.success || !result.data) {
            return interaction.reply({
              content: `❌ Failed to get GitHub stats for ${username}. User may not exist.`,
              flags: MessageFlags.Ephemeral
            });
          }

          const userData = result.data;
          const embed = new EmbedBuilder()
            .setTitle(`🐙 GitHub Stats: ${userData.name || username}`)
            .setColor(0x33_33_33)
            .setDescription(userData.bio ? userData.bio.slice(0, 500) : 'No bio available')
            .addFields(
              { name: '📍 Location', value: userData.location || 'Not specified', inline: true },
              { name: '📚 Public Repos', value: String(userData.publicRepos || 0), inline: true },
              { name: '👥 Followers', value: String(userData.followers || 0), inline: true },
              { name: '👤 Following', value: String(userData.following || 0), inline: true }
            )
            .setFooter({
              text: userData.created ? `Account created: ${new Date(userData.created).toLocaleDateString()}` : 'Account creation date unknown'
            });

          await interaction.reply({ embeds: [embed] });
        }
        catch (error) {
          console.error('GitHub stats fetch error:', error);
          await interaction.reply({
            content: `❌ Failed to get GitHub stats for ${username}. Please try again later.`,
            flags: MessageFlags.Ephemeral
          });
        }

        break;
      }
      case 'weather': {
        const location = interaction.options.getString('location');

        // Validate inputs
        if (!location || location.trim().length === 0) {
          return interaction.reply({
            content: '❌ Please provide a location.',
            flags: MessageFlags.Ephemeral
          });
        }

        if (location.length > 100) {
          return interaction.reply({
            content: '❌ Location name is too long. Please keep it under 100 characters.',
            flags: MessageFlags.Ephemeral
          });
        }

        try {
          const result = await getWeather(location.trim());
          if (!result || !result.success || !result.data) {
            return interaction.reply({
              content: `❌ ${result?.reason || 'Failed to get weather data. Please check the location name.'}`,
              flags: MessageFlags.Ephemeral
            });
          }

          const data = result.data;
          // Validate weather data structure
          if (!data.name || !data.sys || !data.main || !data.weather || !data.wind) {
            throw new Error('Invalid weather data structure');
          }

          const embed = new EmbedBuilder()
            .setTitle(`🌤️ Weather in ${data.name}, ${data.sys.country}`)
            .setColor(0x00_99_FF)
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
        }
        catch (error) {
          console.error('Weather fetch error:', error);
          await interaction.reply({
            content: '❌ Failed to get weather data. Please try again later.',
            flags: MessageFlags.Ephemeral
          });
        }

        break;
      }
      case 'stats': {
        try {
          const stats = getIntegrationStats() || {
            apiKeys: 0,
            totalUsage: 0,
            totalErrors: 0,
            cacheSize: 0
          };

          const embed = new EmbedBuilder()
            .setTitle('🔌 API Integration Statistics')
            .setColor(0x99_32_CC)
            .setDescription('External service usage and performance')
            .addFields(
              { name: '🔑 Configured APIs', value: String(stats.apiKeys || 0), inline: true },
              { name: '📊 Total Requests', value: String(stats.totalUsage || 0), inline: true },
              { name: '❌ Errors', value: String(stats.totalErrors || 0), inline: true },
              { name: '💾 Cache Size', value: `${stats.cacheSize || 0} entries`, inline: true }
            );

          if ((stats.totalUsage || 0) > 0) {
            const successRate = (((stats.totalUsage || 0) - (stats.totalErrors || 0)) / (stats.totalUsage || 1) * 100).toFixed(1);
            embed.addFields({
              name: '📈 Success Rate',
              value: `${successRate}%`,
              inline: true
            });
          }

          await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
        catch (error) {
          console.error('Stats fetch error:', error);
          await interaction.reply({
            content: '❌ Failed to fetch API statistics. Please try again later.',
            flags: MessageFlags.Ephemeral
          });
        }

        break;
      }
    // No default
    }

  }
  catch (error) {
    console.error('API command error:', error);
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