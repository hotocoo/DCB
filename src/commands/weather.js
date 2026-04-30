import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { logger } from '../logger.js';

// Rate limiter for weather API (60 requests per minute per user)
const weatherRateLimiter = new RateLimiterMemory({
  keyPrefix: 'weather_api',
  points: 60,
  duration: 60,
});

/**
 * Validates if the location input is safe and reasonable.
 * @param {string} location - The location string to validate.
 * @returns {boolean} True if valid, false otherwise.
 */
function isValidLocation(location) {
  if (!location || typeof location !== 'string') return false;
  if (location.length < 2 || location.length > 100) return false;
  // Basic check for potentially malicious input
  if (/["&';<>]/.test(location)) return false;
  return true;
}

/**
 * Gets the weather emoji based on the weather condition.
 * @param {string} condition - The weather condition.
 * @returns {string} The corresponding emoji.
 */
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

/**
 * Gets the wind direction from degrees.
 * @param {number} degrees - Wind direction in degrees.
 * @returns {string} Wind direction abbreviation.
 */
function getWindDirection(degrees) {
  if (degrees == undefined) return '';
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

export const data = new SlashCommandBuilder()
  .setName('weather')
  .setDescription('Get current weather information for a location')
  .addStringOption(option =>
    option.setName('location')
      .setDescription('City name or location')
      .setRequired(true));

/**
 * Executes the weather command.
 * @param {import('discord.js').CommandInteraction} interaction - The interaction object.
 */
export async function execute(interaction) {
  try {
    const location = interaction.options.getString('location');

    // Validate location input
    if (!isValidLocation(location)) {
      return await interaction.reply({ content: '❌ Invalid location. Please provide a valid city name or location.', flags: MessageFlags.Ephemeral });
    }

    // Check if API key is configured
    if (!process.env.OPENWEATHER_API_KEY) {
      return await interaction.reply({ content: '❌ Weather API key not configured. Please contact an administrator.', flags: MessageFlags.Ephemeral });
    }

    // Rate limiting for weather API
    try {
      await weatherRateLimiter.consume(interaction.user.id);
    }
    catch (error) {
      return await interaction.reply({
        content: `⏰ **Rate limit exceeded!** Please wait ${Math.round(error.msBeforeNext / 1000)} seconds before trying again.`,
        flags: MessageFlags.Ephemeral
      });
    }

    // Using a free weather API (you may want to replace with a paid one for production)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    let response;
    try {
      response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`, {
        signal: controller.signal
      });
    }
    finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      switch (response.status) {
        case 401: {
          return await interaction.reply({ content: '❌ Weather API key not configured. Please contact an administrator.', flags: MessageFlags.Ephemeral });
        }
        case 404: {
          return await interaction.reply({ content: `❌ Location "${location}" not found. Please check the spelling and try again.`, flags: MessageFlags.Ephemeral });
        }
        case 429: {
          return await interaction.reply({ content: '❌ Weather API rate limit exceeded. Please try again later.', flags: MessageFlags.Ephemeral });
        }
        default: {
          return await interaction.reply({ content: '❌ Unable to fetch weather data. Please try again later.', flags: MessageFlags.Ephemeral });
        }
      }
    }

    const data = await response.json();

    // Validate API response structure
    if (!data || !data.main || !data.weather || !data.weather[0] || !data.sys || !data.wind) {
      return await interaction.reply({ content: '❌ Invalid weather data received. Please try again later.', flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setTitle(`🌤️ Weather in ${data.name}, ${data.sys.country}`)
      .setColor(0x00_99_FF)
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

  }
  catch (error) {
    logger.error('Weather command error', error instanceof Error ? error : new Error(String(error)));
    if (error.name === 'AbortError') {
      await interaction.reply({ content: '❌ Request timed out. Please try again later.', flags: MessageFlags.Ephemeral });
    }
    else if (error.message.includes('fetch')) {
      await interaction.reply({ content: '❌ Network error. Please check your connection and try again.', flags: MessageFlags.Ephemeral });
    }
    else {
      await interaction.reply({ content: '❌ An error occurred while fetching weather data. Please try again later.', flags: MessageFlags.Ephemeral });
    }
  }
}
