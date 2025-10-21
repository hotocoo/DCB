import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { searchSongs, getMusicStats } from '../music.js';

export const data = new SlashCommandBuilder()
  .setName('music')
  .setDescription('Advanced music system with playlists and controls')
  .addSubcommand(sub => sub.setName('play').setDescription('Play a song').addStringOption(opt => opt.setName('query').setDescription('Song name or URL').setRequired(true)))
  .addSubcommand(sub => sub.setName('search').setDescription('Search for songs').addStringOption(opt => opt.setName('query').setDescription('Search term').setRequired(true)))
  .addSubcommand(sub => sub.setName('skip').setDescription('Skip current song'))
  .addSubcommand(sub => sub.setName('pause').setDescription('Pause current song'))
  .addSubcommand(sub => sub.setName('resume').setDescription('Resume paused song'))
  .addSubcommand(sub => sub.setName('stop').setDescription('Stop music and clear queue'))
  .addSubcommand(sub => sub.setName('queue').setDescription('View music queue'))
  .addSubcommand(sub => sub.setName('nowplaying').setDescription('Show currently playing song'))
  .addSubcommand(sub => sub.setName('shuffle').setDescription('Shuffle the queue'))
  .addSubcommand(sub => sub.setName('volume').setDescription('Set volume (0-100)').addIntegerOption(opt => opt.setName('level').setDescription('Volume level').setRequired(true)))
  .addSubcommand(sub => sub.setName('lyrics').setDescription('Get lyrics for a song').addStringOption(opt => opt.setName('song').setDescription('Song name').setRequired(true)))
  .addSubcommand(sub => sub.setName('playlist').setDescription('Playlist management').addStringOption(opt => opt.setName('action').setDescription('create|add|view').setRequired(true)).addStringOption(opt => opt.setName('name').setDescription('Playlist name')));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guild.id;

  if (sub === 'play') {
    const query = interaction.options.getString('query');

    try {
      // Enhanced voice channel check
      const userVoiceChannel = interaction.member.voice?.channel;
      if (!userVoiceChannel) {
        return interaction.reply({
          content: '🎵 **You must be in a voice channel to play music!**\n\n**Troubleshooting:**\n• Join a voice channel first\n• Make sure the bot has permission to view your voice channel\n• Check that the bot has "Connect" and "Speak" permissions',
          ephemeral: true
        });
      }

      // Additional validation
      if (userVoiceChannel.guild.id !== interaction.guild.id) {
        return interaction.reply({ content: '❌ You must be in a voice channel in this server!', ephemeral: true });
      }

      // Check bot permissions in voice channel
      const botPermissions = userVoiceChannel.permissionsFor(interaction.guild.members.me);
      if (!botPermissions.has('Connect') || !botPermissions.has('Speak')) {
        return interaction.reply({
          content: '❌ **I need permissions to join and speak in voice channels!**\n\n**Required Permissions:**\n• Connect\n• Speak\n• Use Voice Activity\n\nPlease give me these permissions in your voice channel.',
          ephemeral: true
        });
      }

      // For demo purposes, create a mock song
      const song = {
        title: `Demo Song: ${query}`,
        artist: 'Demo Artist',
        duration: '3:00',
        url: 'demo://song'
      };

      // Add to queue and start playing
      const { addToQueue, play } = await import('../music.js');
      addToQueue(guildId, { ...song, addedBy: interaction.user.id });

      // Start playing
      const playResult = play(guildId, userVoiceChannel, song);

      if (playResult.success) {
        const embed = new EmbedBuilder()
          .setTitle('🎵 Music Started!')
          .setColor(0x00FF00)
          .setDescription(`**${song.title}** by ${song.artist}\n\n🎵 *Bot has joined ${userVoiceChannel.name} and started playing music!*`)
          .addFields(
            { name: '⏱️ Duration', value: song.duration, inline: true },
            { name: '👤 Requested by', value: interaction.user.username, inline: true },
            { name: '🔊 Voice Channel', value: userVoiceChannel.name, inline: true }
          );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`music_pause:${guildId}`).setLabel('⏸️ Pause').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`music_skip:${guildId}`).setLabel('⏭️ Skip').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`music_stop:${guildId}`).setLabel('⏹️ Stop').setStyle(ButtonStyle.Danger)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
      } else {
        await interaction.reply({ content: `❌ Failed to play song: ${playResult.error}`, ephemeral: true });
      }

    } catch (error) {
      console.error('Music play error:', error);
      await interaction.reply({ content: '❌ An error occurred while playing music.', ephemeral: true });
    }

  } else if (sub === 'search') {
    const query = interaction.options.getString('query');

    try {
      const results = searchSongs(query, 5);

      if (results.length === 0) {
        return interaction.reply({ content: '🔍 No songs found for that query.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle(`🔍 Search Results for "${query}"`)
        .setColor(0x0099FF)
        .setDescription('Click the buttons below to play songs!');

      results.forEach((song, index) => {
        embed.addFields({
          name: `${index + 1}. ${song.title}`,
          value: `👤 ${song.artist} • ⏱️ ${song.duration}`,
          inline: false
        });
      });

      // Create play buttons for each result
      const rows = [];
      for (let i = 0; i < results.length; i += 2) {
        const row = new ActionRowBuilder();
        for (let j = i; j < i + 2 && j < results.length; j++) {
          const song = results[j];
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`music_play:${j}:${query}`)
              .setLabel(`Play ${j + 1}`)
              .setStyle(ButtonStyle.Primary)
          );
        }
        rows.push(row);
      }

      await interaction.reply({ embeds: [embed], components: rows });

    } catch (error) {
      console.error('Music search error:', error);
      await interaction.reply({ content: '❌ Search failed. Please try again.', ephemeral: true });
    }

  } else if (sub === 'skip') {
    // Check if user is in voice channel
    if (!interaction.member.voice.channel) {
      return interaction.reply({ content: '🎵 You must be in a voice channel to control music!', ephemeral: true });
    }

    const { skip } = await import('../music.js');
    const nextSong = skip(guildId);

    if (nextSong) {
      const embed = new EmbedBuilder()
        .setTitle('⏭️ Song Skipped')
        .setColor(0xFFA500)
        .setDescription(`Now playing: **${nextSong.title}** by ${nextSong.artist}`);

      await interaction.reply({ embeds: [embed] });
    } else {
      await interaction.reply({ content: '❌ No songs in queue to skip to.', ephemeral: true });
    }

  } else if (sub === 'pause') {
    // Check if user is in voice channel
    if (!interaction.member.voice.channel) {
      return interaction.reply({ content: '🎵 You must be in a voice channel to control music!', ephemeral: true });
    }

    const { pause } = await import('../music.js');
    const result = pause(guildId);

    if (result) {
      await interaction.reply({ content: '⏸️ **Music paused!** Use `/music resume` to continue.' });
    } else {
      await interaction.reply({ content: '❌ No music currently playing.', ephemeral: true });
    }

  } else if (sub === 'resume') {
    const { resume } = await import('../music.js');
    const result = resume(guildId);

    if (result) {
      await interaction.reply({ content: '▶️ **Music resumed!**' });
    } else {
      await interaction.reply({ content: '❌ No paused music to resume.', ephemeral: true });
    }

  } else if (sub === 'stop') {
    const { stop } = await import('../music.js');
    const result = stop(guildId);

    if (result) {
      await interaction.reply({ content: '⏹️ **Music stopped and queue cleared!**' });
    } else {
      await interaction.reply({ content: '❌ Failed to stop music.', ephemeral: true });
    }

  } else if (sub === 'queue') {
    // Check if user is in voice channel
    if (!interaction.member.voice.channel) {
      return interaction.reply({ content: '🎵 You must be in a voice channel to view the queue!', ephemeral: true });
    }

    const { getQueue, getMusicStats } = await import('../music.js');
    const queue = getQueue(guildId);
    const stats = getMusicStats(guildId);

    if (queue.length === 0) {
      return interaction.reply({ content: '📋 Music queue is empty. Use `/music search` to find songs!', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('🎵 Music Queue')
      .setColor(0x0099FF)
      .setDescription(`**Currently Playing:** ${stats.currentlyPlaying ? `${stats.currentlyPlaying.title} by ${stats.currentlyPlaying.artist}` : 'Nothing'}`)
      .addFields({
        name: '📋 Up Next',
        value: queue.slice(0, 10).map((song, index) =>
          `${index + 1}. **${song.title}** by ${song.artist} (${song.duration})`
        ).join('\n'),
        inline: false
      });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`music_shuffle:${guildId}`).setLabel('🔀 Shuffle').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`music_clear:${guildId}`).setLabel('🗑️ Clear Queue').setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({ embeds: [embed], components: [row] });

  } else if (sub === 'nowplaying') {
    const { getMusicStats } = await import('../music.js');
    const stats = getMusicStats(guildId);

    if (!stats.currentlyPlaying) {
      return interaction.reply({ content: '🎵 No music currently playing.', ephemeral: true });
    }

    const progress = Math.floor(stats.currentlyPlaying.progress / 1000); // Convert to seconds
    const progressBar = '▰'.repeat(Math.floor(progress / 10)) + '▱'.repeat(10 - Math.floor(progress / 10));

    const embed = new EmbedBuilder()
      .setTitle('🎵 Now Playing')
      .setColor(0x00FF00)
      .setDescription(`**${stats.currentlyPlaying.title}**\n👤 ${stats.currentlyPlaying.artist}`)
      .addFields(
        { name: '⏱️ Duration', value: stats.currentlyPlaying.duration, inline: true },
        { name: '🔊 Volume', value: `${stats.volume}%`, inline: true },
        { name: '📊 Progress', value: `${progressBar} (${progress}s)`, inline: true }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`music_pause:${guildId}`).setLabel('⏸️ Pause').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`music_skip:${guildId}`).setLabel('⏭️ Skip').setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [embed], components: [row] });

  } else if (sub === 'shuffle') {
    // Check if user is in voice channel
    if (!interaction.member.voice.channel) {
      return interaction.reply({ content: '🎵 You must be in a voice channel to control music!', ephemeral: true });
    }

    const { shuffleQueue } = await import('../music.js');
    const result = shuffleQueue(guildId);

    if (result) {
      await interaction.reply({ content: '🔀 **Queue shuffled!** Songs are now in random order.' });
    } else {
      await interaction.reply({ content: '❌ Queue is empty or too small to shuffle.', ephemeral: true });
    }

  } else if (sub === 'volume') {
    // Check if user is in voice channel
    if (!interaction.member.voice.channel) {
      return interaction.reply({ content: '🎵 You must be in a voice channel to control music!', ephemeral: true });
    }

    const volume = interaction.options.getInteger('level');

    if (volume < 0 || volume > 200) {
      return interaction.reply({ content: '❌ Volume must be between 0 and 200.', ephemeral: true });
    }

    const { setVolume } = await import('../music.js');
    const newVolume = setVolume(guildId, volume);

    await interaction.reply({ content: `🔊 **Volume set to ${newVolume}%**` });

  } else if (sub === 'lyrics') {
    const songQuery = interaction.options.getString('song');

    try {
      const { getLyrics } = await import('../music.js');
      const lyrics = getLyrics(songQuery, 'Unknown Artist');

      if (!lyrics) {
        return interaction.reply({ content: '📝 Lyrics not found for that song.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle(`📝 Lyrics: ${lyrics.title}`)
        .setColor(0x9932CC)
        .setDescription(`👤 **${lyrics.artist}**\n\n${lyrics.lyrics}`)
        .setFooter({ text: `Source: ${lyrics.source}` });

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Lyrics error:', error);
      await interaction.reply({ content: '❌ Failed to get lyrics. Please try again.', ephemeral: true });
    }

  } else if (sub === 'playlist') {
    const action = interaction.options.getString('action');
    const playlistName = interaction.options.getString('name');

    if (action === 'create' && playlistName) {
      const { createPlaylist } = await import('../music.js');
      const playlist = createPlaylist(guildId, playlistName, interaction.user.id);

      const embed = new EmbedBuilder()
        .setTitle('📋 Playlist Created!')
        .setColor(0x00FF00)
        .setDescription(`**${playlistName}** has been created.`)
        .addFields(
          { name: '👤 Creator', value: interaction.user.username, inline: true },
          { name: '🎵 Songs', value: '0', inline: true }
        );

      await interaction.reply({ embeds: [embed] });

    } else if (action === 'view' && playlistName) {
      const { getPlaylist } = await import('../music.js');
      const playlist = getPlaylist(guildId, playlistName);

      if (!playlist) {
        return interaction.reply({ content: '❌ Playlist not found.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle(`📋 ${playlist.name}`)
        .setColor(0x0099FF)
        .addFields(
          { name: '👤 Creator', value: `<@${playlist.creator}>`, inline: true },
          { name: '🎵 Songs', value: playlist.songs.length, inline: true },
          { name: '▶️ Plays', value: playlist.playCount, inline: true }
        );

      if (playlist.songs.length > 0) {
        const songList = playlist.songs.slice(0, 10).map((song, index) =>
          `${index + 1}. **${song.title}** by ${song.artist}`
        ).join('\n');

        embed.addFields({
          name: '🎵 Song List',
          value: songList,
          inline: false
        });
      }

      await interaction.reply({ embeds: [embed] });

    } else {
      await interaction.reply({ content: '❌ Please specify a playlist name for this action.', ephemeral: true });
    }
  }
}