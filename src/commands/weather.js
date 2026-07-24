1|import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
2|import { RateLimiterMemory } from 'rate-limiter-flexible';
3|
4|// Rate limiter for weather API (60 requests per minute per user)
5|const weatherRateLimiter = new RateLimiterMemory({
6|  keyPrefix: 'weather_api',
7|  points: 60,
8|  duration: 60,
9|});
10|
11|/**
12| * Validates if the location input is safe and reasonable.
13| * @param {string} location - The location string to validate.
14| * @returns {boolean} True if valid, false otherwise.
15| */
16|function isValidLocation(location) {
17|  if (!location || typeof location !== 'string') return false;
18|  if (location.length < 2 || location.length > 100) return false;
19|  // Basic check for potentially malicious input
20|  if (/["&';<>]/.test(location)) return false;
21|  return true;
22|}
23|
24|/**
25| * Gets the weather emoji based on the weather condition.
26| * @param {string} condition - The weather condition.
27| * @returns {string} The corresponding emoji.
28| */
29|function getWeatherEmoji(condition) {
30|  const emojis = {
31|    Clear: '☀️',
32|    Clouds: '☁️',
33|    Rain: '🌧️',
34|    Drizzle: '🌦️',
35|    Thunderstorm: '⛈️',
36|    Snow: '❄️',
37|    Mist: '🌫️',
38|    Fog: '🌫️',
39|    Haze: '🌫️',
40|  };
41|  return emojis[condition] || '🌤️';
42|}
43|
44|/**
45| * Gets the wind direction from degrees.
46| * @param {number} degrees - Wind direction in degrees.
47| * @returns {string} Wind direction abbreviation.
48| */
49|function getWindDirection(degrees) {
50|  if (degrees == undefined) return '';
51|  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
52|  const index = Math.round(degrees / 22.5) % 16;
53|  return directions[index];
54|}
55|
56|export const data = new SlashCommandBuilder()
57|  .setName('weather')
58|  .setDescription('Get current weather information for a location')
59|  .addStringOption((option) => option.setName('location').setDescription('City name or location').setRequired(true));
60|
61|/**
62| * Executes the weather command.
63| * @param {import('discord.js').CommandInteraction} interaction - The interaction object.
64| */
65|export async function execute(interaction) {
66|  try {
67|    const location = interaction.options.getString('location');
68|
69|    // Validate location input
70|    if (!isValidLocation(location)) {
71|      return await interaction.reply({ content: '❌ Invalid location. Please provide a valid city name or location.', flags: MessageFlags.Ephemeral });
72|    }
73|
74|    // Check if API key is configured
75|    if (!process.env.OPENWEATHER_API_KEY) {
76|      return await interaction.reply({ content: '❌ Weather API key not configured. Please contact an administrator.', flags: MessageFlags.Ephemeral });
77|    }
78|
79|    // Rate limiting for weather API
80|    try {
81|      await weatherRateLimiter.consume(interaction.user.id);
82|    } catch (error) {
83|      return await interaction.reply({
84|        content: `⏰ **Rate limit exceeded!** Please wait ${Math.round(error.msBeforeNext / 1000)} seconds before trying again.`,
85|        flags: MessageFlags.Ephemeral,
86|      });
87|    }
88|
89|    // Using a free weather API (you may want to replace with a paid one for production)
90|    const response = await fetch(
91|      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`,
92|      {
93|        timeout: 10_000, // 10 second timeout
94|      },
95|    );
96|
97|    if (!response.ok) {
98|      switch (response.status) {
99|        case 401: {
100|          return await interaction.reply({ content: '❌ Weather API key not configured. Please contact an administrator.', flags: MessageFlags.Ephemeral });
101|        }
102|        case 404: {
103|          return await interaction.reply({
104|            content: `❌ Location "${location}" not found. Please check the spelling and try again.`,
105|            flags: MessageFlags.Ephemeral,
106|          });
107|        }
108|        case 429: {
109|          return await interaction.reply({ content: '❌ Weather API rate limit exceeded. Please try again later.', flags: MessageFlags.Ephemeral });
110|        }
111|        default: {
112|          return await interaction.reply({ content: '❌ Unable to fetch weather data. Please try again later.', flags: MessageFlags.Ephemeral });
113|        }
114|      }
115|    }
116|
117|    const data = await response.json();
118|
119|    // Validate API response structure
120|    if (!data || !data.main || !data.weather || !data.weather[0] || !data.sys || !data.wind) {
121|      return await interaction.reply({ content: '❌ Invalid weather data received. Please try again later.', flags: MessageFlags.Ephemeral });
122|    }
123|
124|    const embed = new EmbedBuilder()
125|      .setTitle(`🌤️ Weather in ${data.name}, ${data.sys.country}`)
126|      .setColor(0x00_99_ff)
127|      .addFields(
128|        {
129|          name: '🌡️ Temperature',
130|          value: `**${Math.round(data.main.temp)}°C** (Feels like ${Math.round(data.main.feels_like)}°C)`,
131|          inline: true,
132|        },
133|        {
134|          name: '💧 Humidity',
135|          value: `**${data.main.humidity}%**`,
136|          inline: true,
137|        },
138|        {
139|          name: '🌬️ Wind',
140|          value: `**${Math.round(data.wind.speed * 3.6)} km/h** ${getWindDirection(data.wind.deg)}`,
141|          inline: true,
142|        },
143|        {
144|          name: '🌥️ Conditions',
145|          value: `${getWeatherEmoji(data.weather[0].main)} **${data.weather[0].description}**`,
146|          inline: true,
147|        },
148|        {
149|          name: '📊 Pressure',
150|          value: `**${data.main.pressure} hPa**`,
151|          inline: true,
152|        },
153|        {
154|          name: '👁️ Visibility',
155|          value: `**${(data.visibility / 1000).toFixed(1)} km**`,
156|          inline: true,
157|        },
158|      )
159|      .setFooter({ text: 'Data provided by OpenWeatherMap' })
160|      .setTimestamp();
161|
162|    await interaction.reply({ embeds: [embed] });
163|
164|    // Track weather_checks achievement stat
165|    try {
166|      const { updateUserStats } = await import('../achievements.js');
167|      updateUserStats(interaction.user.id, { weather_checks: 1 });
168|    } catch (error) { /* achievements optional */ }
169|  } catch (error) {
170|    logger.error('Weather command error:', error instanceof Error ? error : new Error(String(error)));
171|    if (error.name === 'AbortError') {
172|      await interaction.reply({ content: '❌ Request timed out. Please try again later.', flags: MessageFlags.Ephemeral });
173|    } else if (error.message.includes('fetch')) {
174|      await interaction.reply({ content: '❌ Network error. Please check your connection and try again.', flags: MessageFlags.Ephemeral });
175|    } else {
176|      await interaction.reply({ content: '❌ An error occurred while fetching weather data. Please try again later.', flags: MessageFlags.Ephemeral });
177|    }
178|  }
179|}
180|