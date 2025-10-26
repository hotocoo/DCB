import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { RateLimiterMemory } from 'rate-limiter-flexible';

// Rate limiter for weather API (60 requests per minute)
const weatherRateLimiter = new RateLimiterMemory({
  keyPrefix: 'weather_api',
  points: 60,
  duration: 60,
});

export const data = new SlashCommandBuilder()
  .setName('weather')
  .setDescription('Get current weather information for a location')
  .addStringOption(option =>
    option.setName('location')
      .setDescription('City name or location')
      .setRequired(true));

export async function execute(interaction) {
  const location = interaction.options.getString('location');

  try {
    // Rate limiting for weather API
    try {
      await weatherRateLimiter.consume('weather_api');
    } catch (rejRes) {
      return interaction.reply({
        content: `⏰ **Rate limit exceeded!** Please wait ${Math.round(rejRes.msBeforeNext / 1000)} seconds before trying again.`,
        ephemeral: true
      });
    }

    // Using a free weather API (you may want to replace with a paid one for production)
    const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`);

    if (!response.ok) {
      if (response.status === 401) {
        return interaction.reply({ content: '❌ Weather API key not configured. Please contact an administrator.', ephemeral: true });
      } else if (response.status === 404) {
        return interaction.reply({ content: `❌ Location "${location}" not found. Please check the spelling and try again.`, ephemeral: true });
      } else {
        return interaction.reply({ content: `❌ Unable to fetch weather data. Please try again later.`, ephemeral: true });
      }
    }

    const data = await response.json();

    const embed = new EmbedBuilder()
      .setTitle(`🌤️ Weather in ${data.name}, ${data.sys.country}`)
      .setColor(0x0099FF)
      .addFields(
        {
          name: '🌡️ Temperature',
          value: `**${Math.round(data.main.temp)}°C** (Feels like ${Math.round(data.main.feels_like)}°C)`,
          inline: true
        },
        {
          name: '💧 Humidity',
          value: `**${data.main.humidity}%**`,
          inline: true
        },
        {
          name: '🌬️ Wind',
          value: `**${Math.round(data.wind.speed * 3.6)} km/h** ${getWindDirection(data.wind.deg)}`,
          inline: true
        },
        {
          name: '🌥️ Conditions',
          value: `${getWeatherEmoji(data.weather[0].main)} **${data.weather[0].description}**`,
          inline: true
        },
        {
          name: '📊 Pressure',
          value: `**${data.main.pressure} hPa**`,
          inline: true
        },
        {
          name: '👁️ Visibility',
          value: `**${(data.visibility / 1000).toFixed(1)} km**`,
          inline: true
        }
      )
      .setFooter({ text: 'Data provided by OpenWeatherMap' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

  } catch (error) {
    console.error('Weather command error:', error);
    await interaction.reply({ content: '❌ An error occurred while fetching weather data. Please try again later.', ephemeral: true });
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

function getWindDirection(degrees) {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}